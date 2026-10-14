import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QUIZ_SESSION_TTL_MS } from '../quiz-session.js';

/**
 * Store-level tests with a recording fake of the Supabase query builder. They
 * pin the filters that make sessions single-use (finish once, submit once).
 */

type Result = { data?: unknown; error?: unknown; count?: number | null };

const fake = vi.hoisted(() => ({
  calls: [] as Array<[string, unknown[]]>,
  results: [] as Result[],
}));

vi.mock('../db-pool.js', () => {
  const builder: Record<string, unknown> = new Proxy(
    {},
    {
      get(_target, prop: string) {
        if (prop === 'then') {
          const result = fake.results.shift() ?? { data: null, error: null };
          return (resolve: (v: unknown) => void) => resolve({ data: null, error: null, ...result });
        }
        return (...args: unknown[]) => {
          fake.calls.push([prop, args]);
          return builder;
        };
      },
    }
  );
  return {
    getSupabase: () => ({
      from: (table: string) => {
        fake.calls.push(['from', [table]]);
        return builder;
      },
    }),
  };
});

const sessions = await import('../quiz-session-store.js');
const leaderboard = await import('../leaderboard-store.js');

const called = (method: string) => fake.calls.filter(([m]) => m === method).map(([, args]) => args);

beforeEach(() => {
  fake.calls.length = 0;
  fake.results.length = 0;
});

describe('quiz-session-store', () => {
  it('creates a session that expires after the TTL', async () => {
    fake.results.push({ data: { id: 'abc' } });
    const id = await sessions.createQuizSession('multiplication', [], 1_000);

    expect(id).toBe('abc');
    expect(called('from')).toEqual([['quiz_sessions']]);
    expect(called('insert')[0][0]).toEqual({
      operation_type: 'multiplication',
      questions: [],
      issued_at_ms: 1_000,
      expires_at: new Date(1_000 + QUIZ_SESSION_TTL_MS).toISOString(),
    });
  });

  it('surfaces database errors', async () => {
    fake.results.push({ error: new Error('boom') });
    await expect(sessions.createQuizSession('multiplication', [], 1)).rejects.toThrow('boom');
  });

  it('reads a session, coercing BIGINT columns to numbers', async () => {
    fake.results.push({
      data: { id: 'abc', issued_at_ms: '1000', finished_at_ms: '5000', score_ms: 4000 },
    });
    const row = await sessions.getQuizSession('abc');
    expect(row).toMatchObject({ id: 'abc', issued_at_ms: 1000, finished_at_ms: 5000 });
    expect(called('eq')).toEqual([['id', 'abc']]);

    fake.results.push({ data: null });
    expect(await sessions.getQuizSession('missing')).toBeNull();
  });

  it('only finishes a session that has not been finished yet', async () => {
    fake.results.push({ data: [{ id: 'abc' }] });
    expect(await sessions.markQuizSessionFinished('abc', 9_000, 4_000)).toBe(true);
    expect(called('update')[0][0]).toEqual({ finished_at_ms: 9_000, score_ms: 4_000 });
    expect(called('is')).toContainEqual(['finished_at_ms', null]);

    fake.results.push({ data: [] });
    expect(await sessions.markQuizSessionFinished('abc', 9_500, 3_000)).toBe(false);
  });

  it('claims only verified, unexpired, unsubmitted sessions', async () => {
    fake.results.push({ data: [{ id: 'abc' }] });
    expect(await sessions.claimQuizSessionForSubmit('abc')).toBe(true);
    expect(called('is')).toContainEqual(['submitted_at', null]);
    expect(called('not')).toContainEqual(['score_ms', 'is', null]);
    expect(called('gt')[0][0]).toBe('expires_at');

    fake.results.push({ data: [] });
    expect(await sessions.claimQuizSessionForSubmit('abc')).toBe(false);
  });

  it('releases a claim and purges expired sessions', async () => {
    await sessions.releaseQuizSessionClaim('abc');
    expect(called('update')[0][0]).toEqual({ submitted_at: null });

    await sessions.purgeExpiredQuizSessions();
    expect(called('delete')).toHaveLength(1);
    expect(called('lt')[0][0]).toBe('expires_at');

    fake.results.push({ error: new Error('nope') });
    await expect(sessions.purgeExpiredQuizSessions()).rejects.toThrow('nope');
  });
});

describe('leaderboard-store', () => {
  it('counts strictly faster scores this month to decide top 5', async () => {
    fake.results.push({ count: 4 });
    expect(await leaderboard.isTopFiveScore('multiplication', 9_000)).toBe(true);
    expect(called('eq')).toContainEqual(['operation_type', 'multiplication']);
    expect(called('lt')).toContainEqual(['score', 9_000]);

    fake.results.push({ count: 5 });
    expect(await leaderboard.isTopFiveScore('multiplication', 9_000)).toBe(false);
  });

  it('inserts a first score for a player', async () => {
    fake.results.push({ data: [] }, { data: null });
    expect(await leaderboard.saveBestScore('Kady', 'division', 9_000)).toBe('inserted');
    expect(called('insert')[0][0]).toMatchObject({ player_name: 'Kady', score: 9_000, operation_type: 'division' });
  });

  it('keeps a better existing score and replaces a worse one', async () => {
    fake.results.push({ data: [{ id: 7, score: 8_000 }] });
    expect(await leaderboard.saveBestScore('Kady', 'division', 9_000)).toBe('kept');
    expect(called('update')).toHaveLength(0);

    fake.results.push({ data: [{ id: 7, score: 10_000 }] }, { data: null });
    expect(await leaderboard.saveBestScore('Kady', 'division', 9_000)).toBe('updated');
    expect(called('update')[0][0]).toMatchObject({ score: 9_000 });
  });
});
