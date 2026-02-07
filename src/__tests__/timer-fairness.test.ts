/**
 * Timer Fairness Tests
 *
 * These tests verify that the quiz timer uses wall-clock time (performance.now)
 * rather than accumulating fixed increments per setInterval tick.
 *
 * The old (broken) approach:
 *   setInterval(() => elapsed += 0.01, 10)
 *   → On a slow device where ticks fire every 50ms instead of 10ms,
 *     5 seconds of real time would only register as 1 second.
 *
 * The new (correct) approach:
 *   const start = performance.now()
 *   setInterval(() => elapsed = (performance.now() - start) / 1000, 10)
 *   → Elapsed time always matches real wall-clock time.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Simulate the timer logic extracted from the components ──────────

/**
 * OLD timer logic (the broken accumulator approach).
 * Each tick adds a fixed 0.01 regardless of actual time passed.
 */
function runOldTimer(
  tickCount: number,
  realIntervalMs: number, // how often the tick *actually* fires
): number {
  let elapsed = 0;
  for (let i = 0; i < tickCount; i++) {
    // The old code always added 0.01 per tick, assuming 10ms intervals
    elapsed += 0.01;
  }
  return elapsed;
}

/**
 * NEW timer logic (the wall-clock approach used in the fix).
 * Computes elapsed as (now - startTime) / 1000.
 */
function runNewTimer(
  tickCount: number,
  realIntervalMs: number, // how often the tick *actually* fires
): number {
  const startTime = 0; // simulated performance.now() at start
  // After tickCount ticks at realIntervalMs each:
  const currentTime = tickCount * realIntervalMs;
  const elapsed = (currentTime - startTime) / 1000;
  return elapsed;
}

// ────────────────────────────────────────────────────────────────────

describe('Timer fairness', () => {
  describe('Old accumulator-based timer (the bug)', () => {
    it('is accurate when setInterval fires exactly every 10ms', () => {
      // 500 ticks × 10ms = 5 seconds real time
      const elapsed = runOldTimer(500, 10);
      const realSeconds = 5;
      // Old timer happens to be correct here
      expect(elapsed).toBeCloseTo(realSeconds, 1);
    });

    it('DRIFTS on a slow device where ticks fire every 30ms', () => {
      // 166 ticks in 5 seconds at 30ms/tick ≈ 4.98s real time
      const realMs = 5000;
      const actualInterval = 30;
      const tickCount = Math.floor(realMs / actualInterval); // 166 ticks
      const elapsed = runOldTimer(tickCount, actualInterval);
      const realSeconds = (tickCount * actualInterval) / 1000;

      // Old timer thinks only ~1.66s passed (166 × 0.01), real time was ~4.98s
      expect(elapsed).toBeCloseTo(1.66, 1);
      expect(realSeconds).toBeCloseTo(4.98, 1);
      // The drift is massive — timer only shows ~33% of real time
      expect(elapsed / realSeconds).toBeLessThan(0.4);
    });

    it('DRIFTS on an extremely slow device (50ms intervals)', () => {
      const realMs = 10000;
      const actualInterval = 50;
      const tickCount = Math.floor(realMs / actualInterval); // 200 ticks
      const elapsed = runOldTimer(tickCount, actualInterval);
      const realSeconds = (tickCount * actualInterval) / 1000;

      // Old timer: 200 × 0.01 = 2.0s, real time was 10s
      expect(elapsed).toBeCloseTo(2.0, 1);
      expect(realSeconds).toBeCloseTo(10.0, 1);
      // Timer shows only 20% of real time — huge unfair advantage
      expect(elapsed / realSeconds).toBeCloseTo(0.2, 1);
    });
  });

  describe('New wall-clock timer (the fix)', () => {
    it('is accurate when setInterval fires exactly every 10ms', () => {
      const elapsed = runNewTimer(500, 10);
      const realSeconds = 5;
      expect(elapsed).toBeCloseTo(realSeconds, 1);
    });

    it('is accurate on a slow device where ticks fire every 30ms', () => {
      const realMs = 5000;
      const actualInterval = 30;
      const tickCount = Math.floor(realMs / actualInterval);
      const elapsed = runNewTimer(tickCount, actualInterval);
      const realSeconds = (tickCount * actualInterval) / 1000;

      // New timer correctly reports ~4.98s
      expect(elapsed).toBeCloseTo(realSeconds, 2);
      // Ratio is essentially 1.0 — no drift
      expect(elapsed / realSeconds).toBeCloseTo(1.0, 2);
    });

    it('is accurate on an extremely slow device (50ms intervals)', () => {
      const realMs = 10000;
      const actualInterval = 50;
      const tickCount = Math.floor(realMs / actualInterval);
      const elapsed = runNewTimer(tickCount, actualInterval);
      const realSeconds = (tickCount * actualInterval) / 1000;

      // New timer correctly reports 10.0s
      expect(elapsed).toBeCloseTo(realSeconds, 2);
      expect(elapsed / realSeconds).toBeCloseTo(1.0, 2);
    });

    it('is accurate with wildly inconsistent tick intervals', () => {
      // Simulate irregular ticks: some fast, some slow
      // Total real time = sum of all tick intervals
      const tickIntervals = [5, 8, 25, 10, 50, 12, 40, 10, 15, 30]; // ms
      const totalRealMs = tickIntervals.reduce((a, b) => a + b, 0); // 205ms

      // New timer: uses wall clock, so elapsed = totalRealMs / 1000
      const startTime = 0;
      const currentTime = totalRealMs;
      const elapsed = (currentTime - startTime) / 1000;

      expect(elapsed).toBeCloseTo(totalRealMs / 1000, 5);

      // Old timer: 10 ticks × 0.01 = 0.1s regardless of real time
      const oldElapsed = tickIntervals.length * 0.01;
      expect(oldElapsed).toBeCloseTo(0.1, 5);
      // Old timer shows 0.1s when real time was 0.205s — almost 2x error
      expect(oldElapsed / elapsed).toBeLessThan(0.5);
    });
  });

  describe('Time limit enforcement', () => {
    it('new timer correctly detects when time limit is reached', () => {
      const timeLimit = 60; // 60 second limit
      const actualInterval = 30; // slow device

      // After 2000 ticks at 30ms = 60 seconds real time
      const tickCount = (timeLimit * 1000) / actualInterval;
      const elapsed = runNewTimer(tickCount, actualInterval);

      expect(elapsed).toBeGreaterThanOrEqual(timeLimit);
    });

    it('old timer would NOT reach time limit when it should on slow device', () => {
      const timeLimit = 60;
      const actualInterval = 30;

      // At 30ms intervals, 60 real seconds = 2000 ticks
      const tickCount = (timeLimit * 1000) / actualInterval;
      const oldElapsed = runOldTimer(tickCount, actualInterval);

      // Old timer only shows 20s when 60s have really passed!
      expect(oldElapsed).toBeCloseTo(20, 0);
      expect(oldElapsed).toBeLessThan(timeLimit);
      // Player gets 60 real seconds but timer shows only 20 — unfair!
    });
  });

  describe('Source code verification', () => {
    it('QuizScreen.tsx uses performance.now() not accumulator', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const filePath = path.resolve(__dirname, '../components/screens/QuizScreen.tsx');
      const source = fs.readFileSync(filePath, 'utf-8');

      // Should use performance.now() for timing
      expect(source).toContain('performance.now()');
      // Should NOT have the old accumulator pattern
      expect(source).not.toContain('prev + 0.01');
      expect(source).not.toMatch(/prev\s*\+\s*0\.01/);
    });

    it('MultiplayerQuizScreen.tsx uses performance.now() not accumulator', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const filePath = path.resolve(__dirname, '../components/screens/MultiplayerQuizScreen.tsx');
      const source = fs.readFileSync(filePath, 'utf-8');

      // Should use performance.now() for timing
      expect(source).toContain('performance.now()');
      // Should NOT have the old accumulator pattern
      expect(source).not.toContain('prev + 0.01');
      expect(source).not.toMatch(/prev\s*\+\s*0\.01/);
    });
  });
});
