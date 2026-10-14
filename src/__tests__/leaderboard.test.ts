import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  finishLeaderboardQuiz,
  startLeaderboardQuiz,
  submitLeaderboardScore,
} from '../lib/leaderboard';

const SESSION_ID = '6f1c1d2e-8a4b-4c3d-9e2f-0a1b2c3d4e5f';
const fetchMock = vi.fn();

const reply = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));

const sentBody = () => JSON.parse(fetchMock.mock.calls[0][1].body as string);

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('startLeaderboardQuiz', () => {
  it('posts a start action and returns the server-issued session', async () => {
    const questions = [{ num1: 7, num2: 8, operation: 'multiplication', answer: 56 }];
    fetchMock.mockReturnValueOnce(reply(201, { sessionId: SESSION_ID, questions }));

    const session = await startLeaderboardQuiz('multiplication', [1, 2, 3], 10);

    expect(session).toEqual({ sessionId: SESSION_ID, questions });
    expect(fetchMock.mock.calls[0][0]).toBe('/api/submit-score');
    expect(sentBody()).toEqual({
      action: 'start',
      operationType: 'multiplication',
      selectedNumbers: [1, 2, 3],
      questionCount: 10,
    });
  });

  it('returns null on an error status or malformed payload', async () => {
    fetchMock.mockReturnValueOnce(reply(400, { error: 'nope' }));
    expect(await startLeaderboardQuiz('multiplication', [], 10)).toBeNull();

    fetchMock.mockReturnValueOnce(reply(201, { sessionId: SESSION_ID, questions: [] }));
    expect(await startLeaderboardQuiz('multiplication', [], 10)).toBeNull();
  });

  it('returns null when the network fails', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('offline'));
    expect(await startLeaderboardQuiz('multiplication', [], 10)).toBeNull();
  });

  it('gives up after 8 seconds so a slow server never blocks the quiz', async () => {
    vi.useFakeTimers();
    try {
      fetchMock.mockImplementationOnce(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
          })
      );
      const pending = startLeaderboardQuiz('multiplication', [], 10);
      await vi.advanceTimersByTimeAsync(8000);
      expect(await pending).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('finishLeaderboardQuiz', () => {
  it('posts answers + client time and returns the server verdict', async () => {
    fetchMock.mockReturnValueOnce(reply(200, { verified: true, scoreMs: 8491, isTopScore: true }));

    const verdict = await finishLeaderboardQuiz(SESSION_ID, ['56'], 8491);

    expect(verdict).toEqual({ verified: true, scoreMs: 8491, isTopScore: true });
    expect(sentBody()).toEqual({ action: 'finish', sessionId: SESSION_ID, answers: ['56'], timeMs: 8491 });
  });

  it('reports an unverified run', async () => {
    fetchMock.mockReturnValueOnce(reply(200, { verified: false, isTopScore: false }));
    expect(await finishLeaderboardQuiz(SESSION_ID, [], 450)).toMatchObject({ verified: false, isTopScore: false });
  });

  it('returns null on an error status or network failure', async () => {
    fetchMock.mockReturnValueOnce(reply(409, { error: 'already graded' }));
    expect(await finishLeaderboardQuiz(SESSION_ID, [], 9000)).toBeNull();

    fetchMock.mockRejectedValueOnce(new TypeError('offline'));
    expect(await finishLeaderboardQuiz(SESSION_ID, [], 9000)).toBeNull();
  });
});

describe('submitLeaderboardScore', () => {
  it('sends only the session id and name (never a score)', async () => {
    fetchMock.mockReturnValueOnce(reply(201, { message: 'Score submitted successfully!' }));

    await submitLeaderboardScore(SESSION_ID, 'Kady');

    expect(sentBody()).toEqual({ action: 'submit', sessionId: SESSION_ID, playerName: 'Kady' });
  });

  it('throws the server error message', async () => {
    fetchMock.mockReturnValueOnce(reply(400, { error: 'Inappropriate name detected. Please choose another.' }));
    await expect(submitLeaderboardScore(SESSION_ID, 'x')).rejects.toThrow('Inappropriate name detected');
  });

  it('falls back to a generic message', async () => {
    fetchMock.mockReturnValueOnce(Promise.resolve(new Response('oops', { status: 500 })));
    await expect(submitLeaderboardScore(SESSION_ID, 'x')).rejects.toThrow('An error occurred.');
  });
});
