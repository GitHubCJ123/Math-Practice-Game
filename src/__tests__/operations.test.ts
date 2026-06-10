import { describe, it, expect } from 'vitest';
import {
  ALL_OPERATIONS,
  OPERATION_LABELS,
  getOperationDisplayName,
  getNumbersForOperation,
} from '../lib/operations';

describe('ALL_OPERATIONS', () => {
  it('lists all nine operations', () => {
    expect(ALL_OPERATIONS).toHaveLength(9);
    expect(new Set(ALL_OPERATIONS).size).toBe(9);
  });

  it('has a label for every operation', () => {
    for (const op of ALL_OPERATIONS) {
      expect(OPERATION_LABELS[op]).toBeTruthy();
    }
  });
});

describe('getOperationDisplayName', () => {
  it('returns the configured label', () => {
    expect(getOperationDisplayName('multiplication')).toBe('Multiplication');
    expect(getOperationDisplayName('square-roots')).toBe('Square Roots');
    expect(getOperationDisplayName('fraction-to-decimal')).toBe('Fraction → Decimal');
  });
});

describe('getNumbersForOperation', () => {
  it('returns 1–20 for squares and square-roots', () => {
    const expected = Array.from({ length: 20 }, (_, i) => i + 1);
    expect(getNumbersForOperation('squares')).toEqual(expected);
    expect(getNumbersForOperation('square-roots')).toEqual(expected);
  });

  it('returns 1–10 for negative-numbers', () => {
    expect(getNumbersForOperation('negative-numbers')).toEqual(
      Array.from({ length: 10 }, (_, i) => i + 1)
    );
  });

  it('returns 1–12 for multiplication and division', () => {
    const expected = Array.from({ length: 12 }, (_, i) => i + 1);
    expect(getNumbersForOperation('multiplication')).toEqual(expected);
    expect(getNumbersForOperation('division')).toEqual(expected);
  });
});
