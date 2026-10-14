import type { Question } from './types.js';
import { formatPercentString } from './conversions.js';

/**
 * Single source of truth for grading a solo quiz answer. The results screen
 * uses it for display and the leaderboard API uses it to re-grade a run
 * server-side, so both always agree on what counts as correct.
 */

const normalizePercentAnswer = (value: string): string => {
  const trimmed = value.trim();
  const numericPart = trimmed.replace(/[^0-9.]/g, '');
  if (!numericPart) return trimmed;
  const numericValue = parseFloat(numericPart);
  if (Number.isNaN(numericValue)) return trimmed;
  return formatPercentString(numericValue / 100);
};

export const normalizeAnswerForComparison = (
  value: string | number | null | undefined,
  question: Question
): string => {
  const strValue = String(value ?? '').trim();
  if (!strValue) return '';

  if (question.operation === 'fraction-to-decimal') {
    return strValue.startsWith('.') ? `0${strValue}` : strValue;
  }

  if (question.operation === 'fraction-to-percent') {
    return normalizePercentAnswer(strValue);
  }

  return strValue;
};

export const isAnswerCorrect = (
  question: Question,
  userAnswer: string | number | null | undefined
): boolean =>
  normalizeAnswerForComparison(userAnswer, question) ===
  normalizeAnswerForComparison(question.answer, question);

export const countCorrectAnswers = (
  questions: Question[],
  answers: ReadonlyArray<string | null | undefined>
): number => questions.filter((question, i) => isAnswerCorrect(question, answers[i])).length;
