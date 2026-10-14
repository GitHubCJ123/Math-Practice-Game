import { describe, it, expect } from 'vitest';
import {
  LATENCY_ALLOWANCE_MS,
  MIN_MS_PER_QUESTION,
  QUIZ_SESSION_TTL_MS,
  verifyRunTiming,
} from '../quiz-session.js';
import { INTRO_COUNTDOWN_TOTAL_MS } from '../../../shared/types.js';

const ISSUED = 1_000_000;
/** Server-side receipt time for a run whose real quiz took `quizMs`, plus `latencyMs`. */
const finishedAfter = (quizMs: number, latencyMs = 300) => ISSUED + INTRO_COUNTDOWN_TOTAL_MS + quizMs + latencyMs;

describe('verifyRunTiming', () => {
  it('uses the client time for an honest run within the latency allowance', () => {
    const verdict = verifyRunTiming({
      operation: 'multiplication',
      clientMs: 8491,
      issuedAtMs: ISSUED,
      finishedAtMs: finishedAfter(8491, 400),
      questionCount: 10,
    });
    expect(verdict).toEqual({ ok: true, scoreMs: 8491, serverMs: 8891 });
  });

  it('accepts the fastest legit record on file (2.71s for 10 questions)', () => {
    const verdict = verifyRunTiming({
      operation: 'multiplication',
      clientMs: 2710,
      issuedAtMs: ISSUED,
      finishedAtMs: finishedAfter(2710),
      questionCount: 10,
    });
    expect(verdict.ok && verdict.scoreMs).toBe(2710);
  });

  it('rejects a faked 0.45s run sent right after the quiz was issued (the Oct 12 attack)', () => {
    const verdict = verifyRunTiming({
      operation: 'multiplication',
      clientMs: 450,
      issuedAtMs: ISSUED,
      finishedAtMs: ISSUED + 150,
      questionCount: 10,
    });
    expect(verdict).toMatchObject({ ok: false, reason: 'too-fast' });
  });

  it('ignores an understated client time and falls back to the server window', () => {
    // Played for 12s, claims 450ms → recorded as server window minus the allowance.
    const verdict = verifyRunTiming({
      operation: 'multiplication',
      clientMs: 450,
      issuedAtMs: ISSUED,
      finishedAtMs: finishedAfter(12_000, 0),
      questionCount: 10,
    });
    expect(verdict).toEqual({ ok: true, scoreMs: 12_000 - LATENCY_ALLOWANCE_MS, serverMs: 12_000 });
  });

  it('never accepts anything under the per-question floor, however long the script waits', () => {
    const floor = MIN_MS_PER_QUESTION.multiplication * 10;
    const justUnder = verifyRunTiming({
      operation: 'multiplication',
      clientMs: 0,
      issuedAtMs: ISSUED,
      finishedAtMs: ISSUED + INTRO_COUNTDOWN_TOTAL_MS + floor + LATENCY_ALLOWANCE_MS - 1,
      questionCount: 10,
    });
    expect(justUnder).toMatchObject({ ok: false, reason: 'too-fast' });

    const atFloor = verifyRunTiming({
      operation: 'multiplication',
      clientMs: 0,
      issuedAtMs: ISSUED,
      finishedAtMs: ISSUED + INTRO_COUNTDOWN_TOTAL_MS + floor + LATENCY_ALLOWANCE_MS,
      questionCount: 10,
    });
    expect(atFloor).toEqual({ ok: true, scoreMs: floor, serverMs: floor + LATENCY_ALLOWANCE_MS });
  });

  it('keeps a client time that is slower than the server window', () => {
    const verdict = verifyRunTiming({
      operation: 'multiplication',
      clientMs: 30_000,
      issuedAtMs: ISSUED,
      finishedAtMs: finishedAfter(20_000),
      questionCount: 10,
    });
    expect(verdict.ok && verdict.scoreMs).toBe(30_000);
  });

  it('rejects runs finished after the session lifetime', () => {
    const verdict = verifyRunTiming({
      operation: 'multiplication',
      clientMs: 9000,
      issuedAtMs: ISSUED,
      finishedAtMs: ISSUED + QUIZ_SESSION_TTL_MS + 1,
      questionCount: 10,
    });
    expect(verdict).toMatchObject({ ok: false, reason: 'expired' });
  });
});

describe('MIN_MS_PER_QUESTION', () => {
  it('sits below every legit Hall of Fame record so real champions still count', () => {
    const recordsMs: Record<keyof typeof MIN_MS_PER_QUESTION, number> = {
      multiplication: 2710,
      division: 3620,
      squares: 4080,
      'square-roots': 3100,
      'negative-numbers': 9400,
      'fraction-to-decimal': 3870,
      'decimal-to-fraction': 6780,
      'fraction-to-percent': 5440,
      'percent-to-fraction': 7760,
    };
    for (const [operation, recordMs] of Object.entries(recordsMs)) {
      const floorMs = MIN_MS_PER_QUESTION[operation as keyof typeof recordsMs] * 10;
      expect(floorMs).toBeLessThan(recordMs);
    }
  });

  it('rejects a scripted 2.0s conversion run that a multiplication run could reach', () => {
    const verdict = verifyRunTiming({
      operation: 'fraction-to-percent',
      clientMs: 2000,
      issuedAtMs: ISSUED,
      finishedAtMs: ISSUED + INTRO_COUNTDOWN_TOTAL_MS + 3000,
      questionCount: 10,
    });
    expect(verdict).toMatchObject({ ok: false, reason: 'too-fast' });
  });
});