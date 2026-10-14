import { describe, it, expect } from 'vitest';
import { getLeaderboardNumberPool, isLeaderboardRun, isScoreEligible } from '../score-eligibility.js';

/**
 * Eligibility rules (mirrors shared/score-eligibility.ts):
 *  - questionCount must be exactly 10, otherwise never eligible.
 *  - Arithmetic ops require ALL numbers selected:
 *      multiplication / division → 12
 *      squares / square-roots    → 20
 *      negative-numbers          → 10
 *  - Conversion ops have no number requirement (eligible at count 10).
 */
describe('isScoreEligible', () => {
  describe('question count gate', () => {
    it('rejects any count other than 10', () => {
      expect(isScoreEligible('multiplication', 9, 12, true)).toBe(false);
      expect(isScoreEligible('multiplication', 11, 12, true)).toBe(false);
      expect(isScoreEligible('multiplication', 0, 12, true)).toBe(false);
      expect(isScoreEligible('fraction-to-decimal', 25, 0, false)).toBe(false);
    });
  });

  describe('multiplication / division (require all 12)', () => {
    it('is eligible with all 12 numbers selected', () => {
      expect(isScoreEligible('multiplication', 10, 12, true)).toBe(true);
      expect(isScoreEligible('division', 10, 12, true)).toBe(true);
    });

    it('is ineligible when not all numbers are selected', () => {
      expect(isScoreEligible('multiplication', 10, 11, false)).toBe(false);
      expect(isScoreEligible('division', 10, 6, false)).toBe(false);
    });

    it('is ineligible when the count matches but allNumbersSelected is false', () => {
      expect(isScoreEligible('multiplication', 10, 12, false)).toBe(false);
    });

    it('is ineligible when allNumbersSelected is true but the count is wrong', () => {
      expect(isScoreEligible('multiplication', 10, 11, true)).toBe(false);
    });
  });

  describe('squares / square-roots (require all 20)', () => {
    it('is eligible with all 20 numbers selected', () => {
      expect(isScoreEligible('squares', 10, 20, true)).toBe(true);
      expect(isScoreEligible('square-roots', 10, 20, true)).toBe(true);
    });

    it('is ineligible with fewer than 20', () => {
      expect(isScoreEligible('squares', 10, 12, true)).toBe(false);
      expect(isScoreEligible('square-roots', 10, 19, true)).toBe(false);
    });
  });

  describe('negative-numbers (require all 10)', () => {
    it('is eligible with all 10 numbers selected', () => {
      expect(isScoreEligible('negative-numbers', 10, 10, true)).toBe(true);
    });

    it('is ineligible with fewer than 10', () => {
      expect(isScoreEligible('negative-numbers', 10, 9, true)).toBe(false);
    });
  });

  describe('conversion operations (no number requirement)', () => {
    it('is eligible at count 10 regardless of selected numbers', () => {
      expect(isScoreEligible('fraction-to-decimal', 10, 0, false)).toBe(true);
      expect(isScoreEligible('decimal-to-fraction', 10, 0, false)).toBe(true);
      expect(isScoreEligible('fraction-to-percent', 10, 0, false)).toBe(true);
      expect(isScoreEligible('percent-to-fraction', 10, 0, false)).toBe(true);
    });
  });
});

describe('getLeaderboardNumberPool', () => {
  it('returns the full 1..N pool for arithmetic operations', () => {
    expect(getLeaderboardNumberPool('multiplication')).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(getLeaderboardNumberPool('division')).toHaveLength(12);
    expect(getLeaderboardNumberPool('squares')).toHaveLength(20);
    expect(getLeaderboardNumberPool('square-roots')).toHaveLength(20);
    expect(getLeaderboardNumberPool('negative-numbers')).toHaveLength(10);
  });

  it('returns an empty pool for conversion operations', () => {
    expect(getLeaderboardNumberPool('fraction-to-decimal')).toEqual([]);
    expect(getLeaderboardNumberPool('percent-to-fraction')).toEqual([]);
  });
});

describe('isLeaderboardRun', () => {
  const all12 = Array.from({ length: 12 }, (_, i) => i + 1);

  it('accepts the full pool in any order', () => {
    expect(isLeaderboardRun('multiplication', all12, 10)).toBe(true);
    expect(isLeaderboardRun('multiplication', [...all12].reverse(), 10)).toBe(true);
  });

  it('rejects a partial pool or the wrong question count', () => {
    expect(isLeaderboardRun('multiplication', all12.slice(1), 10)).toBe(false);
    expect(isLeaderboardRun('multiplication', all12, 20)).toBe(false);
  });

  it('checks the actual numbers, not just how many there are', () => {
    const twelveWrongNumbers = [1, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 99];
    expect(isLeaderboardRun('multiplication', twelveWrongNumbers, 10)).toBe(false);
    expect(isLeaderboardRun('multiplication', [...all12.slice(0, 11), 13], 10)).toBe(false);
  });

  it('ignores numbers for conversion operations', () => {
    expect(isLeaderboardRun('fraction-to-decimal', [], 10)).toBe(true);
    expect(isLeaderboardRun('decimal-to-fraction', [3], 10)).toBe(true);
    expect(isLeaderboardRun('decimal-to-fraction', [], 9)).toBe(false);
  });
});