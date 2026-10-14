import { describe, it, expect } from 'vitest';
import { countCorrectAnswers, isAnswerCorrect, normalizeAnswerForComparison } from '../grading.js';
import type { Question } from '../types.js';

const q = (overrides: Partial<Question>): Question => ({
  num1: 1,
  operation: 'multiplication',
  answer: 1,
  ...overrides,
});

describe('normalizeAnswerForComparison', () => {
  it('trims whitespace and stringifies numbers', () => {
    expect(normalizeAnswerForComparison(' 56 ', q({}))).toBe('56');
    expect(normalizeAnswerForComparison(56, q({}))).toBe('56');
  });

  it('treats null/undefined/blank as empty', () => {
    expect(normalizeAnswerForComparison(undefined, q({}))).toBe('');
    expect(normalizeAnswerForComparison(null, q({}))).toBe('');
    expect(normalizeAnswerForComparison('   ', q({}))).toBe('');
  });

  it('adds a leading zero to bare decimals for fraction-to-decimal', () => {
    const question = q({ operation: 'fraction-to-decimal', answer: '0.5' });
    expect(normalizeAnswerForComparison('.5', question)).toBe('0.5');
  });

  it('normalizes percent answers for fraction-to-percent', () => {
    const question = q({ operation: 'fraction-to-percent', answer: '50%' });
    expect(normalizeAnswerForComparison('50', question)).toBe(normalizeAnswerForComparison('50%', question));
  });
});

describe('isAnswerCorrect / countCorrectAnswers', () => {
  const questions = [
    q({ num1: 7, num2: 8, answer: 56 }),
    q({ operation: 'fraction-to-decimal', answer: '0.25' }),
    q({ operation: 'fraction-to-percent', answer: '33.3%' }),
  ];

  it('accepts equivalent answers', () => {
    expect(isAnswerCorrect(questions[0], '56')).toBe(true);
    expect(isAnswerCorrect(questions[1], '.25')).toBe(true);
    expect(isAnswerCorrect(questions[2], '33.3')).toBe(true);
  });

  it('rejects wrong or missing answers', () => {
    expect(isAnswerCorrect(questions[0], '54')).toBe(false);
    expect(isAnswerCorrect(questions[0], '')).toBe(false);
    expect(isAnswerCorrect(questions[0], undefined)).toBe(false);
  });

  it('counts correct answers positionally', () => {
    expect(countCorrectAnswers(questions, ['56', '.25', '33.3'])).toBe(3);
    expect(countCorrectAnswers(questions, ['56', '0.3'])).toBe(1);
    expect(countCorrectAnswers(questions, [])).toBe(0);
  });
});
