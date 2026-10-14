import type { Operation } from './types.js';
import { DEFAULT_QUESTION_COUNT } from './types.js';

/**
 * Leaderboard eligibility rules, shared by the client (to decide whether a
 * quiz needs a server-issued session) and the API (which enforces them).
 *
 *  - questionCount must be exactly 10.
 *  - Arithmetic ops require ALL numbers selected:
 *      multiplication / division → 1–12
 *      squares / square-roots    → 1–20
 *      negative-numbers          → 1–10
 *  - Conversion ops have no number requirement.
 */
export const LEADERBOARD_QUESTION_COUNT = DEFAULT_QUESTION_COUNT;

const CONVERSION_OPERATIONS = new Set<string>([
  'fraction-to-decimal',
  'decimal-to-fraction',
  'fraction-to-percent',
  'percent-to-fraction',
]);

/**
 * The full number pool a leaderboard run must use, or an empty array for
 * conversion modes (which draw from a fixed table instead).
 */
export function getLeaderboardNumberPool(operation: Operation): number[] {
  if (CONVERSION_OPERATIONS.has(operation)) return [];
  const size =
    operation === 'squares' || operation === 'square-roots'
      ? 20
      : operation === 'negative-numbers'
        ? 10
        : 12;
  return Array.from({ length: size }, (_, i) => i + 1);
}

export function isScoreEligible(
  operationType: string,
  questionCount: number,
  selectedNumbersCount: number,
  allNumbersSelected: boolean
) {
  const requiresAllNumbers =
    operationType === "multiplication" ||
    operationType === "division" ||
    operationType === "squares" ||
    operationType === "square-roots" ||
    operationType === "negative-numbers";
  const expectedCount =
    operationType === "squares" || operationType === "square-roots"
      ? 20
      : operationType === "negative-numbers"
        ? 10
        : 12;

  if (questionCount !== LEADERBOARD_QUESTION_COUNT) {
    return false;
  }
  if (requiresAllNumbers) {
    return allNumbersSelected && selectedNumbersCount === expectedCount;
  }
  return true;
}

/**
 * Whether a concrete quiz setup qualifies for the leaderboard. Unlike
 * isScoreEligible, this checks the actual numbers (every number in the pool,
 * nothing outside it) rather than trusting a caller-supplied count.
 */
export function isLeaderboardRun(
  operation: Operation,
  selectedNumbers: readonly number[],
  questionCount: number
): boolean {
  const pool = getLeaderboardNumberPool(operation);
  if (pool.length === 0) {
    return isScoreEligible(operation, questionCount, 0, true);
  }
  const unique = new Set(selectedNumbers);
  const coversPool = unique.size === pool.length && pool.every((n) => unique.has(n));
  return isScoreEligible(operation, questionCount, unique.size, coversPool);
}
