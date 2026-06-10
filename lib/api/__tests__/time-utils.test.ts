import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  EASTERN_TIME_ZONE,
  getEasternMonthBounds,
  getCurrentEasternMonthBounds,
  getPreviousEasternMonthBounds,
} from '../time-utils.js';

describe('EASTERN_TIME_ZONE', () => {
  it('is America/New_York', () => {
    expect(EASTERN_TIME_ZONE).toBe('America/New_York');
  });
});

describe('getEasternMonthBounds', () => {
  it('uses EST (UTC-5) for a winter month', () => {
    const b = getEasternMonthBounds(2026, 1);
    expect(b.startUtc.toISOString()).toBe('2026-01-01T05:00:00.000Z');
    expect(b.endUtc.toISOString()).toBe('2026-02-01T05:00:00.000Z');
    expect(b.year).toBe(2026);
    expect(b.month).toBe(1);
  });

  it('uses EDT (UTC-4) for a summer month', () => {
    const b = getEasternMonthBounds(2026, 7);
    expect(b.startUtc.toISOString()).toBe('2026-07-01T04:00:00.000Z');
    expect(b.endUtc.toISOString()).toBe('2026-08-01T04:00:00.000Z');
  });

  it('always produces endUtc strictly after startUtc', () => {
    for (let month = 1; month <= 12; month++) {
      const b = getEasternMonthBounds(2026, month);
      expect(b.endUtc.getTime()).toBeGreaterThan(b.startUtc.getTime());
    }
  });
});

describe('current and previous month bounds (clock-dependent)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('reports the current Eastern month', () => {
    vi.setSystemTime(new Date('2026-06-10T12:00:00Z')); // June (EDT)
    const b = getCurrentEasternMonthBounds();
    expect(b.year).toBe(2026);
    expect(b.month).toBe(6);
    expect(b.startUtc.toISOString()).toBe('2026-06-01T04:00:00.000Z');
  });

  it('uses Eastern time (not UTC) at a month boundary', () => {
    // 04:30Z on Mar 1 is still 23:30 on Feb 28 in ET (pre-DST EST).
    vi.setSystemTime(new Date('2026-03-01T04:30:00Z'));
    const b = getCurrentEasternMonthBounds();
    expect(b.month).toBe(2); // February, not March
  });

  it('rolls the previous month back across a year boundary', () => {
    vi.setSystemTime(new Date('2026-01-15T12:00:00Z'));
    const b = getPreviousEasternMonthBounds();
    expect(b.year).toBe(2025);
    expect(b.month).toBe(12);
  });
});
