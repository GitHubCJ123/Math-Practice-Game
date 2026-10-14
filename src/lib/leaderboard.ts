import type { Operation, Question } from '@shared/types';
import { logger } from './logger';

/**
 * Client for the server-verified solo leaderboard flow (api/submit-score.ts):
 * start → play the server-issued questions → finish → submit.
 */

const ENDPOINT = '/api/submit-score';
const START_TIMEOUT_MS = 8000;

export interface LeaderboardQuizSession {
  sessionId: string;
  questions: Question[];
}

/** Leaderboard status of the run shown on the results screen. */
export type LeaderboardCheck =
  | { status: 'ineligible' }
  | { status: 'checking' }
  | { status: 'ready'; sessionId: string; isTopScore: boolean; scoreMs: number };

type ApiPayload = Record<string, unknown> & { error?: unknown; message?: unknown };

async function postScoreAction(
  body: Record<string, unknown>,
  timeoutMs?: number
): Promise<{ ok: boolean; data: ApiPayload }> {
  const controller = new AbortController();
  const timer = timeoutMs ? setTimeout(() => controller.abort(), timeoutMs) : undefined;
  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const data = (await response.json().catch(() => ({}))) as ApiPayload;
    return { ok: response.ok, data };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/** Requests server-issued questions. Resolves null if the server is unavailable. */
export async function startLeaderboardQuiz(
  operation: Operation,
  selectedNumbers: number[],
  questionCount: number
): Promise<LeaderboardQuizSession | null> {
  try {
    const { ok, data } = await postScoreAction(
      { action: 'start', operationType: operation, selectedNumbers, questionCount },
      START_TIMEOUT_MS
    );
    if (!ok || typeof data.sessionId !== 'string' || !Array.isArray(data.questions) || data.questions.length === 0) {
      logger.warn('[leaderboard] Could not start a leaderboard quiz', data);
      return null;
    }
    return { sessionId: data.sessionId, questions: data.questions as Question[] };
  } catch (error) {
    logger.warn('[leaderboard] Leaderboard quiz start failed', error);
    return null;
  }
}

/** Sends the finished run for server grading/timing. Resolves null on failure. */
export async function finishLeaderboardQuiz(
  sessionId: string,
  answers: string[],
  timeMs: number
): Promise<{ verified: boolean; isTopScore: boolean; scoreMs: number } | null> {
  try {
    const { ok, data } = await postScoreAction({ action: 'finish', sessionId, answers, timeMs });
    if (!ok) {
      logger.warn('[leaderboard] Finish rejected', data);
      return null;
    }
    return {
      verified: data.verified === true,
      isTopScore: data.isTopScore === true,
      scoreMs: typeof data.scoreMs === 'number' ? data.scoreMs : timeMs,
    };
  } catch (error) {
    logger.warn('[leaderboard] Finish failed', error);
    return null;
  }
}

/** Puts the verified score on the leaderboard. Throws with a user-facing message on failure. */
export async function submitLeaderboardScore(sessionId: string, playerName: string): Promise<void> {
  const { ok, data } = await postScoreAction({ action: 'submit', sessionId, playerName });
  if (!ok) {
    const message = typeof data.error === 'string' ? data.error : typeof data.message === 'string' ? data.message : null;
    throw new Error(message || 'An error occurred.');
  }
}
