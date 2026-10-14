import type { VercelRequest, VercelResponse } from "@vercel/node";
import { apiError, handleApiError } from "../lib/api/errors.js";
import { containsProfanity } from "../lib/api/profanity.js";
import { ScoreActionSchema, validate, type ScoreActionInput } from "../lib/api/validation.js";
import { logger } from "../lib/api/logger.js";
import { rateLimitHit, getClientKey } from "../lib/api/rate-limit.js";
import { verifyRunTiming } from "../lib/api/quiz-session.js";
import {
  claimQuizSessionForSubmit,
  createQuizSession,
  getQuizSession,
  markQuizSessionFinished,
  purgeExpiredQuizSessions,
  releaseQuizSessionClaim,
  type QuizSessionRow,
} from "../lib/api/quiz-session-store.js";
import { isTopFiveScore, saveBestScore } from "../lib/api/leaderboard-store.js";
import { generateQuestions } from "../shared/questions.js";
import { countCorrectAnswers } from "../shared/grading.js";
import {
  getLeaderboardNumberPool,
  isLeaderboardRun,
  LEADERBOARD_QUESTION_COUNT,
} from "../shared/score-eligibility.js";

type StartAction = Extract<ScoreActionInput, { action: "start" }>;
type FinishAction = Extract<ScoreActionInput, { action: "finish" }>;
type SubmitAction = Extract<ScoreActionInput, { action: "submit" }>;

const OUTDATED_CLIENT_MESSAGE =
  "This version of the game is out of date. Please refresh the page and play again to submit a score.";

/**
 * Solo leaderboard flow. The client never supplies its own score:
 *  1. start  — the server generates the quiz and records when it was issued.
 *  2. finish — the server re-grades the answers and bounds the time with its
 *              own clock (see lib/api/quiz-session.ts).
 *  3. submit — that run's verified score is written to the leaderboard, once.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Captured first so the server-side time window isn't inflated by our own work.
  const receivedAtMs = Date.now();
  logger.log("[api/submit-score] Function invoked.");
  try {
    if (req.method !== "POST") {
      return apiError(res, 405, "Method Not Allowed");
    }

    // Pre-session clients posted a raw { score, ... } payload; turn them away clearly.
    if (!req.body || typeof req.body !== "object" || !("action" in req.body)) {
      return apiError(res, 400, OUTDATED_CLIENT_MESSAGE);
    }

    const body = validate(ScoreActionSchema, req.body);
    const clientKey = getClientKey(req);

    switch (body.action) {
      case "start":
        return await handleStart(res, clientKey, body);
      case "finish":
        return await handleFinish(res, clientKey, body, receivedAtMs);
      case "submit":
        return await handleSubmit(res, clientKey, body);
    }
  } catch (error) {
    return handleApiError(res, "api/submit-score", "Score action failed", error);
  }
}

async function handleStart(res: VercelResponse, clientKey: string, body: StartAction) {
  if (!(await rateLimitHit(`score-start:${clientKey}`, 120, 60_000))) {
    return apiError(res, 429, "Too many requests. Please slow down.");
  }

  const { operationType, selectedNumbers, questionCount } = body;
  if (!isLeaderboardRun(operationType, selectedNumbers, questionCount)) {
    return apiError(res, 400, "These quiz settings are not eligible for the leaderboard.");
  }

  const questions = generateQuestions(
    operationType,
    getLeaderboardNumberPool(operationType),
    LEADERBOARD_QUESTION_COUNT
  );
  // Cleanup rides along with each start so abandoned sessions never pile up.
  const [sessionId] = await Promise.all([
    createQuizSession(operationType, questions, Date.now()),
    purgeExpiredQuizSessions().catch((error) =>
      logger.error("[api/submit-score] Failed to purge expired quiz sessions", error)
    ),
  ]);

  return res.status(201).json({ sessionId, questions });
}

/** The graded result for a finished session (also returned on retries). */
async function finishedResult(res: VercelResponse, session: QuizSessionRow) {
  if (session.score_ms === null) {
    return res.status(200).json({ verified: false, isTopScore: false });
  }
  const isTopScore = await isTopFiveScore(session.operation_type, session.score_ms);
  return res.status(200).json({ verified: true, scoreMs: session.score_ms, isTopScore });
}

async function handleFinish(
  res: VercelResponse,
  clientKey: string,
  body: FinishAction,
  receivedAtMs: number
) {
  if (!(await rateLimitHit(`score-finish:${clientKey}`, 120, 60_000))) {
    return apiError(res, 429, "Too many requests. Please slow down.");
  }

  const session = await getQuizSession(body.sessionId);
  if (!session) {
    return apiError(res, 404, "Quiz session not found.");
  }
  // Already graded (e.g. a retry after a dropped response): return the stored
  // server-computed result; the new answers/time are ignored.
  if (session.finished_at_ms !== null) {
    return finishedResult(res, session);
  }

  const { questions } = session;
  const isPerfect =
    questions.length > 0 &&
    body.answers.length === questions.length &&
    countCorrectAnswers(questions, body.answers) === questions.length;

  const timing = verifyRunTiming({
    operation: session.operation_type,
    clientMs: body.timeMs,
    issuedAtMs: session.issued_at_ms,
    finishedAtMs: receivedAtMs,
    questionCount: questions.length,
  });

  if (isPerfect && !timing.ok) {
    logger.warn("[api/submit-score] Rejected implausible run", {
      sessionId: session.id,
      operation: session.operation_type,
      reason: timing.reason,
      clientMs: body.timeMs,
      serverMs: timing.serverMs,
      clientKey,
    });
  }

  const scoreMs = isPerfect && timing.ok ? timing.scoreMs : null;
  if (!(await markQuizSessionFinished(session.id, receivedAtMs, scoreMs))) {
    // Lost a race with a concurrent finish; report whatever that one stored.
    const latest = await getQuizSession(session.id);
    return latest ? finishedResult(res, latest) : apiError(res, 404, "Quiz session not found.");
  }

  return finishedResult(res, { ...session, finished_at_ms: receivedAtMs, score_ms: scoreMs });
}

async function handleSubmit(res: VercelResponse, clientKey: string, body: SubmitAction) {
  if (!(await rateLimitHit(`submit-score:${clientKey}`, 20, 60_000))) {
    return apiError(res, 429, "Too many requests. Please slow down.");
  }

  const { sessionId, playerName } = body;
  if (containsProfanity(playerName)) {
    logger.log(`[api/submit-score] Profanity DETECTED for: "${playerName}"`);
    return apiError(res, 400, "Inappropriate name detected. Please choose another.");
  }

  const session = await getQuizSession(sessionId);
  if (!session || session.score_ms === null) {
    return apiError(res, 400, "This quiz run is not eligible for the leaderboard.");
  }
  if (session.submitted_at !== null) {
    return apiError(res, 409, "This score has already been submitted.");
  }
  if (Date.parse(session.expires_at) <= Date.now()) {
    return apiError(res, 410, "This quiz run has expired. Play again to submit a score.");
  }
  if (!(await claimQuizSessionForSubmit(sessionId))) {
    return apiError(res, 409, "This score has already been submitted.");
  }

  try {
    const outcome = await saveBestScore(playerName, session.operation_type, session.score_ms);
    if (outcome === "inserted") {
      return res.status(201).json({ message: "Score submitted successfully!" });
    }
    return res.status(200).json({
      message: outcome === "updated" ? "Score updated successfully!" : "Existing score is better.",
    });
  } catch (error) {
    await releaseQuizSessionClaim(sessionId).catch((releaseError) =>
      logger.error("[api/submit-score] Failed to release session claim", releaseError)
    );
    throw error;
  }
}
