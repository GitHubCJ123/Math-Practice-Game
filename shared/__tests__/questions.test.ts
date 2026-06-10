import { describe, it, expect } from 'vitest';
import { generateQuestions } from '../questions.js';
import { conversions, formatPercentString } from '../conversions.js';
import type { Operation } from '../types.js';

const ARITHMETIC_NUMBERS: Record<string, number[]> = {
  multiplication: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  division: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  squares: Array.from({ length: 20 }, (_, i) => i + 1),
  'square-roots': Array.from({ length: 20 }, (_, i) => i + 1),
  'negative-numbers': [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
};

const CONVERSION_OPS: Operation[] = [
  'fraction-to-decimal',
  'decimal-to-fraction',
  'fraction-to-percent',
  'percent-to-fraction',
];

// Run generators many times so the random branches are all exercised.
const ITERATIONS = 60;

describe('generateQuestions', () => {
  describe('count', () => {
    it('returns exactly questionCount questions for arithmetic ops (full selection)', () => {
      for (const [op, numbers] of Object.entries(ARITHMETIC_NUMBERS)) {
        for (let i = 0; i < 10; i++) {
          const qs = generateQuestions(op as Operation, numbers, 10);
          expect(qs).toHaveLength(10);
        }
      }
    });

    it('caps conversion questions at the size of the conversion table', () => {
      for (const op of CONVERSION_OPS) {
        const qs = generateQuestions(op, [], 10);
        expect(qs).toHaveLength(Math.min(10, conversions.length));

        const huge = generateQuestions(op, [], 9999);
        expect(huge).toHaveLength(conversions.length);
      }
    });
  });

  describe('answer correctness', () => {
    it('multiplication: answer is the product of the two operands (each 1–12)', () => {
      for (let i = 0; i < ITERATIONS; i++) {
        for (const q of generateQuestions('multiplication', ARITHMETIC_NUMBERS.multiplication, 10)) {
          expect(q.operation).toBe('multiplication');
          expect(q.num2).toBeDefined();
          expect(q.num1).toBeGreaterThanOrEqual(1);
          expect(q.num1).toBeLessThanOrEqual(12);
          expect(q.num2!).toBeGreaterThanOrEqual(1);
          expect(q.num2!).toBeLessThanOrEqual(12);
          expect(q.answer).toBe(q.num1 * q.num2!);
        }
      }
    });

    it('division: answer is an exact integer quotient and divisor is in the selection', () => {
      const numbers = ARITHMETIC_NUMBERS.division;
      for (let i = 0; i < ITERATIONS; i++) {
        for (const q of generateQuestions('division', numbers, 10)) {
          expect(q.operation).toBe('division');
          expect(q.num2).toBeDefined();
          expect(numbers).toContain(q.num2);
          expect(q.num1 % q.num2!).toBe(0);
          expect(q.answer).toBe(q.num1 / q.num2!);
          expect(q.answer).toBeGreaterThanOrEqual(1);
          expect(q.answer).toBeLessThanOrEqual(12);
        }
      }
    });

    it('squares: answer is the square of num1 and num1 is in the selection', () => {
      const numbers = ARITHMETIC_NUMBERS.squares;
      for (let i = 0; i < ITERATIONS; i++) {
        for (const q of generateQuestions('squares', numbers, 10)) {
          expect(q.operation).toBe('squares');
          expect(numbers).toContain(q.num1);
          expect(q.answer).toBe(q.num1 * q.num1);
        }
      }
    });

    it('square-roots: answer squared equals num1 (a perfect square)', () => {
      const numbers = ARITHMETIC_NUMBERS['square-roots'];
      for (let i = 0; i < ITERATIONS; i++) {
        for (const q of generateQuestions('square-roots', numbers, 10)) {
          expect(q.operation).toBe('square-roots');
          expect(numbers).toContain(q.answer as number);
          expect(q.num1).toBe((q.answer as number) ** 2);
        }
      }
    });

    it('negative-numbers: answer matches the operator shown in the display', () => {
      const numbers = ARITHMETIC_NUMBERS['negative-numbers'];
      for (let i = 0; i < ITERATIONS; i++) {
        for (const q of generateQuestions('negative-numbers', numbers, 10)) {
          expect(q.operation).toBe('negative-numbers');
          expect(typeof q.display).toBe('string');
          expect(q.num2).toBeDefined();

          // The operator is the space-wrapped + or - between the two operands.
          const isAddition = q.display!.includes(' + ');
          const isSubtraction = q.display!.includes(' - ');
          expect(isAddition || isSubtraction).toBe(true);

          const expected = isAddition ? q.num1 + q.num2! : q.num1 - q.num2!;
          expect(q.answer).toBe(expected);

          // Negative second operands are parenthesized; non-negative are not.
          if (q.num2! < 0) {
            expect(q.display).toContain(`(${q.num2})`);
          } else {
            expect(q.display).not.toContain('(');
          }
        }
      }
    });
  });

  describe('uniqueness', () => {
    it('produces no duplicate questions within a single batch', () => {
      for (const [op, numbers] of Object.entries(ARITHMETIC_NUMBERS)) {
        for (let i = 0; i < 20; i++) {
          const qs = generateQuestions(op as Operation, numbers, 10);
          const keys = qs.map(q =>
            q.display ?? `${q.num1}|${q.num2 ?? ''}|${q.answer}`
          );
          expect(new Set(keys).size).toBe(qs.length);
        }
      }
    });
  });

  describe('conversion mapping', () => {
    it('maps each conversion question to a real row in the conversion table', () => {
      const fd = generateQuestions('fraction-to-decimal', [], 10);
      for (const q of fd) {
        const row = conversions.find(c => c.fractionString === q.display);
        expect(row).toBeDefined();
        expect(q.answer).toBe(row!.decimalString);
      }

      const df = generateQuestions('decimal-to-fraction', [], 10);
      for (const q of df) {
        const row = conversions.find(c => c.decimalString === q.display);
        expect(row).toBeDefined();
        expect(q.answer).toBe(row!.fractionString);
      }

      const fp = generateQuestions('fraction-to-percent', [], 10);
      for (const q of fp) {
        const row = conversions.find(c => c.fractionString === q.display);
        expect(row).toBeDefined();
        expect(q.answer).toBe(formatPercentString(row!.decimal));
      }

      const pf = generateQuestions('percent-to-fraction', [], 10);
      for (const q of pf) {
        const row = conversions.find(c => formatPercentString(c.decimal) === q.display);
        expect(row).toBeDefined();
        expect(q.answer).toBe(row!.fractionString);
      }
    });
  });

  // KNOWN BUG (see repo review): the arithmetic generator loops
  // `while (newQuestions.length < questionCount)` with no escape hatch. If a
  // selection cannot yield `questionCount` distinct questions (e.g. squares with
  // a single number, or any op whose selection capacity < count), it spins
  // forever. A test that triggers it would hang the suite, so it is documented
  // here rather than executed.
  it.todo('caps questionCount to the selection capacity instead of looping forever');
});
