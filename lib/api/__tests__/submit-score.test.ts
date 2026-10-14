import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { QuizSessionRow } from '../quiz-session-store.js';
import { INTRO_COUNTDOWN_TOTAL_MS } from '../../../shared/types.js';

/**
 * Handler-level tests for api/submit-score.ts with the Supabase-backed stores
 * swapped for in-memory fakes. These replay the October 2026 attack (raw
 * score POSTs) and the obvious follow-ups a cheater would try next.
 */

const store = vi.hoisted(() => ({ sessions: new Map<string, QuizSessionRow>(), nextId: 1 }));

vi.mock('../rate-limit.js', () => ({
  rateLimitHit: vi.fn(async () => true),
  getClientKey: () => '203.0.113.7',
}));

vi.mock('../leaderboard-store.js', () => ({
  isTopFiveScore: vi.fn(async () => true),
  saveBestScore: vi.fn(async () => 'inserted'),
}));

vi.mock('../quiz-session-store.js', async () => {
  const { QUIZ_SESSION_TTL_MS } = await import('../quiz-session.js');
  return {
    createQuizSession: vi.fn(async (operation, questions, issuedAtMs: number) => {
      const id = `00000000-0000-4000-8000-${String(store.nextId++).padStart(12, '0')}`;
      store.sessions.set(id, {
        id,
        operation_type: operation,
        questions,
        issued_at_ms: issuedAtMs,
        finished_at_ms: null,
        score_ms: null,
        submitted_at: null,
        expires_at: new Date(issuedAtMs + QUIZ_SESSION_TTL_MS).toISOString(),
      });
      return id;
    }),
    getQuizSession: vi.fn(async (id: string) => {
      const row = store.sessions.get(id);
      return row ? { ...row } : null;
    }),
    markQuizSessionFinished: vi.fn(async (id: string, finishedAtMs: number, scoreMs: number | null) => {
      const row = store.sessions.get(id);
      if (!row || row.finished_at_ms !== null) return false;
      row.finished_at_ms = finishedAtMs;
      row.score_ms = scoreMs;
      return true;
    }),
    claimQuizSessionForSubmit: vi.fn(async (id: string) => {
      const row = store.sessions.get(id);
      if (!row || row.submitted_at !== null || row.score_ms === null) return false;
      if (Date.parse(row.expires_at) <= Date.now()) return false;
      row.submitted_at = new Date().toISOString();
      return true;
    }),
    releaseQuizSessionClaim: vi.fn(async (id: string) => {
      const row = store.sessions.get(id);
      if (row) row.submitted_at = null;
    }),
    purgeExpiredQuizSessions: vi.fn(async () => {}),
  };
});

const { default: handler } = await import('../../../api/submit-score.js');
const leaderboardStore = await import('../leaderboard-store.js');

const ALL_12 = Array.from({ length: 12 }, (_, i) => i + 1);

interface MockResponse {
  statusCode: number;
  body: Record<string, unknown>;
}

async function call(body: unknown, method = 'POST'): Promise<MockResponse> {
  const result: MockResponse = { statusCode: 0, body: {} };
  const res = {
    status(code: number) {
      result.statusCode = code;
      return this;
    },
    json(payload: Record<string, unknown>) {
      result.body = payload;
      return this;
    },
  } as unknown as VercelResponse;
  await handler({ method, body, headers: {} } as unknown as VercelRequest, res);
  return result;
}

async function startQuiz() {
  const res = await call({ action: 'start', operationType: 'multiplication', selectedNumbers: ALL_12, questionCount: 10 });
  expect(res.statusCode).toBe(201);
  const sessionId = res.body.sessionId as string;
  const questions = res.body.questions as Array<{ answer: number | string }>;
  return { sessionId, answers: questions.map((q) => String(q.answer)) };
}

/** Moves the server clock forward by the intro + `quizMs` + some network latency. */
function playFor(quizMs: number, latencyMs = 300) {
  vi.setSystemTime(Date.now() + INTRO_COUNTDOWN_TOTAL_MS + quizMs + latencyMs);
}

beforeEach(() => {
  store.sessions.clear();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-12T21:50:55Z'));
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.mocked(leaderboardStore.saveBestScore).mockClear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('api/submit-score — the original attack', () => {
  it('rejects a raw { score } POST like the one that put 0.450s on the board', async () => {
    const res = await call({
      playerName: 'I also code ;)',
      score: 450,
      operationType: 'multiplication',
      questionCount: 10,
      selectedNumbersCount: 12,
      allNumbersSelected: true,
    });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/refresh the page/i);
    expect(leaderboardStore.saveBestScore).not.toHaveBeenCalled();
  });

  it('rejects non-POST methods', async () => {
    expect((await call({}, 'GET')).statusCode).toBe(405);
  });
});

describe('api/submit-score — start', () => {
  it('issues 10 server-generated questions for an eligible setup', async () => {
    const res = await call({ action: 'start', operationType: 'multiplication', selectedNumbers: ALL_12, questionCount: 10 });
    expect(res.statusCode).toBe(201);
    expect(res.body.sessionId).toEqual(expect.any(String));
    expect(res.body.questions).toHaveLength(10);
  });

  it('refuses ineligible setups', async () => {
    const partial = await call({ action: 'start', operationType: 'multiplication', selectedNumbers: [2, 3], questionCount: 10 });
    expect(partial.statusCode).toBe(400);
    const tooMany = await call({ action: 'start', operationType: 'multiplication', selectedNumbers: ALL_12, questionCount: 20 });
    expect(tooMany.statusCode).toBe(400);
  });
});

describe('api/submit-score — finish', () => {
  it('verifies an honest perfect run using the client timer', async () => {
    const { sessionId, answers } = await startQuiz();
    playFor(8491);
    const res = await call({ action: 'finish', sessionId, answers, timeMs: 8491 });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ verified: true, scoreMs: 8491, isTopScore: true });
  });

  it('rejects a perfect run that claims 0.45s and arrives instantly', async () => {
    const { sessionId, answers } = await startQuiz();
    vi.setSystemTime(Date.now() + 150);
    const res = await call({ action: 'finish', sessionId, answers, timeMs: 450 });
    expect(res.body).toEqual({ verified: false, isTopScore: false });
    expect(console.warn).toHaveBeenCalled();
  });

  it('rejects an instant finish that claims a believable time it never waited for', async () => {
    const { sessionId, answers } = await startQuiz();
    vi.setSystemTime(Date.now() + 120);
    const res = await call({ action: 'finish', sessionId, answers, timeMs: 2500 });
    expect(res.body).toEqual({ verified: false, isTopScore: false });
  });

  it('replaces an understated time with the server-measured window', async () => {
    const { sessionId, answers } = await startQuiz();
    playFor(12_000, 0);
    const res = await call({ action: 'finish', sessionId, answers, timeMs: 450 });
    expect(res.body).toMatchObject({ verified: true, scoreMs: 11_000 });
  });

  it('does not verify a run with a wrong answer', async () => {
    const { sessionId, answers } = await startQuiz();
    playFor(9000);
    answers[3] = '-1';
    const res = await call({ action: 'finish', sessionId, answers, timeMs: 9000 });
    expect(res.body).toEqual({ verified: false, isTopScore: false });
  });

  it('grades a session once; retries get the stored result, not a re-grade', async () => {
    const { sessionId, answers } = await startQuiz();
    playFor(9000);
    const first = await call({ action: 'finish', sessionId, answers, timeMs: 9000 });
    expect(first.body).toMatchObject({ verified: true, scoreMs: 9000 });

    const replay = await call({ action: 'finish', sessionId, answers, timeMs: 3000 });
    expect(replay.statusCode).toBe(200);
    expect(replay.body).toMatchObject({ verified: true, scoreMs: 9000 });
  });

  it('cannot turn a rejected run into a verified one by retrying', async () => {
    const { sessionId, answers } = await startQuiz();
    vi.setSystemTime(Date.now() + 150);
    await call({ action: 'finish', sessionId, answers, timeMs: 450 });

    playFor(9000);
    const retry = await call({ action: 'finish', sessionId, answers, timeMs: 9000 });
    expect(retry.body).toEqual({ verified: false, isTopScore: false });
  });

  it('rejects a script that waits out the window but claims an impossible conversion time', async () => {
    const res = await call({ action: 'start', operationType: 'fraction-to-percent', selectedNumbers: [], questionCount: 10 });
    const sessionId = res.body.sessionId as string;
    const answers = (res.body.questions as Array<{ answer: string }>).map((q) => q.answer);
    playFor(2000, 0);
    const finish = await call({ action: 'finish', sessionId, answers, timeMs: 2000 });
    expect(finish.body).toEqual({ verified: false, isTopScore: false });
  });

  it('returns 404 for an unknown session', async () => {
    const res = await call({
      action: 'finish',
      sessionId: '11111111-1111-4111-8111-111111111111',
      answers: [],
      timeMs: 9000,
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('api/submit-score — submit', () => {
  it('stores the server-verified score, ignoring any client-supplied score', async () => {
    const { sessionId, answers } = await startQuiz();
    playFor(8491);
    await call({ action: 'finish', sessionId, answers, timeMs: 8491 });

    const res = await call({ action: 'submit', sessionId, playerName: 'Kady', score: 1 });
    expect(res.statusCode).toBe(201);
    expect(leaderboardStore.saveBestScore).toHaveBeenCalledWith('Kady', 'multiplication', 8491);
  });

  it('allows only one submission per run', async () => {
    const { sessionId, answers } = await startQuiz();
    playFor(9000);
    await call({ action: 'finish', sessionId, answers, timeMs: 9000 });
    await call({ action: 'submit', sessionId, playerName: 'Kady' });

    const second = await call({ action: 'submit', sessionId, playerName: 'Someone else' });
    expect(second.statusCode).toBe(409);
    expect(leaderboardStore.saveBestScore).toHaveBeenCalledTimes(1);
  });

  it('refuses sessions that were never verified', async () => {
    const { sessionId, answers } = await startQuiz();
    const unfinished = await call({ action: 'submit', sessionId, playerName: 'Kady' });
    expect(unfinished.statusCode).toBe(400);

    vi.setSystemTime(Date.now() + 100);
    await call({ action: 'finish', sessionId, answers, timeMs: 450 });
    const rejected = await call({ action: 'submit', sessionId, playerName: 'Kady' });
    expect(rejected.statusCode).toBe(400);
    expect(leaderboardStore.saveBestScore).not.toHaveBeenCalled();
  });

  it('rejects profane names before touching the session', async () => {
    const { sessionId, answers } = await startQuiz();
    playFor(9000);
    await call({ action: 'finish', sessionId, answers, timeMs: 9000 });
    const res = await call({ action: 'submit', sessionId, playerName: 'damn' });
    expect(res.statusCode).toBe(400);

    const retry = await call({ action: 'submit', sessionId, playerName: 'Kady' });
    expect(retry.statusCode).toBe(201);
  });

  it('releases the claim when the leaderboard write fails so the player can retry', async () => {
    const { sessionId, answers } = await startQuiz();
    playFor(9000);
    await call({ action: 'finish', sessionId, answers, timeMs: 9000 });

    vi.mocked(leaderboardStore.saveBestScore).mockRejectedValueOnce(new Error('db down'));
    const failed = await call({ action: 'submit', sessionId, playerName: 'Kady' });
    expect(failed.statusCode).toBe(500);

    const retry = await call({ action: 'submit', sessionId, playerName: 'Kady' });
    expect(retry.statusCode).toBe(201);
  });
});
