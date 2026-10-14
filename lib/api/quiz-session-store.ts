import type { Operation, Question } from "../../shared/types.js";
import { getSupabase } from "./db-pool.js";
import { QUIZ_SESSION_TTL_MS } from "./quiz-session.js";

/**
 * Supabase-backed store for server-issued solo quiz sessions
 * (migrations/schema/quiz-sessions.sql). Every state change is a conditional
 * UPDATE so a session can only be finished once and submitted once, even when
 * requests race across serverless instances.
 */

export interface QuizSessionRow {
  id: string;
  operation_type: Operation;
  questions: Question[];
  issued_at_ms: number;
  finished_at_ms: number | null;
  score_ms: number | null;
  submitted_at: string | null;
  expires_at: string;
}

const TABLE = "quiz_sessions";

export async function createQuizSession(
  operation: Operation,
  questions: Question[],
  issuedAtMs: number
): Promise<string> {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .insert({
      operation_type: operation,
      questions,
      issued_at_ms: issuedAtMs,
      expires_at: new Date(issuedAtMs + QUIZ_SESSION_TTL_MS).toISOString(),
    })
    .select("id")
    .single();

  if (error) throw error;
  return (data as { id: string }).id;
}

export async function getQuizSession(id: string): Promise<QuizSessionRow | null> {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select("id, operation_type, questions, issued_at_ms, finished_at_ms, score_ms, submitted_at, expires_at")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  const row = data as QuizSessionRow;
  return {
    ...row,
    issued_at_ms: Number(row.issued_at_ms),
    finished_at_ms: row.finished_at_ms === null ? null : Number(row.finished_at_ms),
  };
}

/** Records the graded result. Returns false if the session was already finished. */
export async function markQuizSessionFinished(
  id: string,
  finishedAtMs: number,
  scoreMs: number | null
): Promise<boolean> {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .update({ finished_at_ms: finishedAtMs, score_ms: scoreMs })
    .eq("id", id)
    .is("finished_at_ms", null)
    .select("id");

  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

/**
 * Atomically claims a verified, unexpired, not-yet-submitted session for a
 * leaderboard write. Returns false if any of those conditions fail.
 */
export async function claimQuizSessionForSubmit(id: string): Promise<boolean> {
  const now = new Date().toISOString();
  const { data, error } = await getSupabase()
    .from(TABLE)
    .update({ submitted_at: now })
    .eq("id", id)
    .is("submitted_at", null)
    .not("score_ms", "is", null)
    .gt("expires_at", now)
    .select("id");

  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

/** Undo a claim when the leaderboard write fails, so the player can retry. */
export async function releaseQuizSessionClaim(id: string): Promise<void> {
  const { error } = await getSupabase().from(TABLE).update({ submitted_at: null }).eq("id", id);
  if (error) throw error;
}

export async function purgeExpiredQuizSessions(): Promise<void> {
  const { error } = await getSupabase()
    .from(TABLE)
    .delete()
    .lt("expires_at", new Date().toISOString());
  if (error) throw error;
}
