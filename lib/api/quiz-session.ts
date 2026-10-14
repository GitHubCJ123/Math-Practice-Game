import type { Operation } from "../../shared/types.js";
import { INTRO_COUNTDOWN_TOTAL_MS } from "../../shared/types.js";

/**
 * Pure timing rules for server-verified solo leaderboard runs.
 *
 * The server records when it issued a quiz (`issuedAtMs`) and when the
 * finished run reached it (`finishedAtMs`). Everything in between — network,
 * rendering, the fixed intro countdown, and the actual quiz — happens on the
 * client, so `finishedAtMs - issuedAtMs - intro` is always >= the real quiz
 * time. That server window bounds how fast a run can claim to be.
 */

/** How long an issued quiz stays usable (finish + submit). */
export const QUIZ_SESSION_TTL_MS = 2 * 60 * 60 * 1000;

/**
 * Most the client's own timer may undercut the server-measured window by.
 * Covers network round trips and render delays for legit players; a tampered
 * client can shave at most this much off its real time.
 */
export const LATENCY_ALLOWANCE_MS = 1000;

/**
 * Fastest believable pace per question, by operation: ~75% of the fastest
 * Hall of Fame time on record for that mode (Oct 2025 – Sep 2026). Anything
 * faster is rejected outright — no human has come close, and a script that
 * waits out the server window can get no lower than this.
 */
export const MIN_MS_PER_QUESTION: Record<Operation, number> = {
  multiplication: 200, // record 2.71s / 10
  division: 270, // record 3.62s
  squares: 300, // record 4.08s
  "square-roots": 230, // record 3.10s
  "negative-numbers": 700, // record 9.40s
  "fraction-to-decimal": 290, // record 3.87s
  "decimal-to-fraction": 500, // record 6.78s
  "fraction-to-percent": 400, // record 5.44s
  "percent-to-fraction": 580, // record 7.76s
};

export type RunTimingVerdict =
  | { ok: true; scoreMs: number; serverMs: number }
  | { ok: false; reason: "expired" | "too-fast"; serverMs: number };

export function verifyRunTiming(input: {
  operation: Operation;
  clientMs: number;
  issuedAtMs: number;
  finishedAtMs: number;
  questionCount: number;
}): RunTimingVerdict {
  const elapsedMs = input.finishedAtMs - input.issuedAtMs;
  const serverMs = elapsedMs - INTRO_COUNTDOWN_TOTAL_MS;

  if (elapsedMs > QUIZ_SESSION_TTL_MS) {
    return { ok: false, reason: "expired", serverMs };
  }

  // Trust the (more precise) client timer only within the latency allowance.
  const scoreMs = Math.max(Math.round(input.clientMs), serverMs - LATENCY_ALLOWANCE_MS);

  if (scoreMs < MIN_MS_PER_QUESTION[input.operation] * input.questionCount) {
    return { ok: false, reason: "too-fast", serverMs };
  }

  return { ok: true, scoreMs, serverMs };
}
