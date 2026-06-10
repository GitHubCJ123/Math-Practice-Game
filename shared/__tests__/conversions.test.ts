import { describe, it, expect } from 'vitest';
import { conversions, formatPercentString } from '../conversions.js';

describe('formatPercentString', () => {
  it('formats whole-number percents with no decimals', () => {
    expect(formatPercentString(0.5)).toBe('50%');
    expect(formatPercentString(0.25)).toBe('25%');
    expect(formatPercentString(0.2)).toBe('20%');
    expect(formatPercentString(1)).toBe('100%');
  });

  it('formats fractional percents to a single decimal place', () => {
    expect(formatPercentString(0.333)).toBe('33.3%');
    expect(formatPercentString(0.666)).toBe('66.6%');
    expect(formatPercentString(0.125)).toBe('12.5%');
    expect(formatPercentString(0.875)).toBe('87.5%');
  });

  it('rounds to one decimal place', () => {
    // 0.1666 * 100 = 16.66 → rounds to 16.7
    expect(formatPercentString(0.1666)).toBe('16.7%');
  });

  it('always ends with a percent sign', () => {
    for (const c of conversions) {
      expect(formatPercentString(c.decimal).endsWith('%')).toBe(true);
    }
  });
});

describe('conversions table integrity', () => {
  it('is non-empty', () => {
    expect(conversions.length).toBeGreaterThan(0);
  });

  it('every row has a decimal consistent with numerator/denominator', () => {
    for (const c of conversions) {
      // Stored decimals are truncated for repeating values (e.g. 1/3 → 0.333),
      // so allow a small tolerance.
      expect(Math.abs(c.decimal - c.numerator / c.denominator)).toBeLessThan(0.01);
    }
  });

  it('fractionString matches numerator/denominator', () => {
    for (const c of conversions) {
      expect(c.fractionString).toBe(`${c.numerator}/${c.denominator}`);
    }
  });

  it('decimalString parses back to the stored decimal', () => {
    for (const c of conversions) {
      expect(Number(c.decimalString)).toBeCloseTo(c.decimal, 5);
    }
  });

  it('has no duplicate fractions', () => {
    const keys = conversions.map(c => c.fractionString);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
