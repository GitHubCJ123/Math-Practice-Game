import { describe, it, expect } from 'vitest';
import {
  validate,
  ScoreActionSchema,
  FeedbackSchema,
  ExplanationRequestSchema,
  MultiplayerActionSchema,
} from '../validation.js';
import { ApiError } from '../errors.js';

describe('validate', () => {
  it('returns the parsed data on success', () => {
    const data = validate(FeedbackSchema, { type: 'bug', message: 'It broke' });
    expect(data).toEqual({ type: 'bug', message: 'It broke' });
  });

  it('throws ApiError(400) with flattened details on failure', () => {
    let thrown: unknown;
    try {
      validate(FeedbackSchema, { type: 'nope', message: '' });
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(ApiError);
    expect((thrown as ApiError).status).toBe(400);
    expect((thrown as ApiError).details).toBeDefined();
  });
});

describe('ScoreActionSchema', () => {
  const sessionId = '6f1c1d2e-8a4b-4c3d-9e2f-0a1b2c3d4e5f';

  it('parses a start action and coerces numeric strings', () => {
    const parsed = validate(ScoreActionSchema, {
      action: 'start',
      operationType: 'multiplication',
      selectedNumbers: ['1', '2', 3],
      questionCount: '10',
    });
    expect(parsed).toEqual({
      action: 'start',
      operationType: 'multiplication',
      selectedNumbers: [1, 2, 3],
      questionCount: 10,
    });
  });

  it('parses finish and submit actions', () => {
    expect(validate(ScoreActionSchema, { action: 'finish', sessionId, answers: ['56', ''], timeMs: '8491' }))
      .toEqual({ action: 'finish', sessionId, answers: ['56', ''], timeMs: 8491 });
    expect(validate(ScoreActionSchema, { action: 'submit', sessionId, playerName: '  Alice ' }))
      .toEqual({ action: 'submit', sessionId, playerName: 'Alice' });
  });

  it('strips a client-supplied score from submit', () => {
    const parsed = validate(ScoreActionSchema, { action: 'submit', sessionId, playerName: 'Alice', score: 450 });
    expect(parsed).not.toHaveProperty('score');
  });

  it('rejects the legacy raw-score payload', () => {
    expect(() =>
      validate(ScoreActionSchema, {
        playerName: 'I also code ;)',
        score: 450,
        operationType: 'multiplication',
        questionCount: 10,
        selectedNumbersCount: 12,
        allNumbersSelected: true,
      })
    ).toThrow(ApiError);
  });

  it('rejects malformed session ids, names, times, and operations', () => {
    expect(() => validate(ScoreActionSchema, { action: 'submit', sessionId: 'abc', playerName: 'Alice' })).toThrow(ApiError);
    expect(() => validate(ScoreActionSchema, { action: 'submit', sessionId, playerName: '' })).toThrow(ApiError);
    expect(() => validate(ScoreActionSchema, { action: 'submit', sessionId, playerName: 'x'.repeat(51) })).toThrow(ApiError);
    expect(() => validate(ScoreActionSchema, { action: 'finish', sessionId, answers: [], timeMs: -1 })).toThrow(ApiError);
    expect(() =>
      validate(ScoreActionSchema, { action: 'start', operationType: 'calculus', selectedNumbers: [], questionCount: 10 })
    ).toThrow(ApiError);
  });
});

describe('ExplanationRequestSchema', () => {
  it('requires num2 for binary operations', () => {
    expect(() =>
      validate(ExplanationRequestSchema, { num1: 7, operation: 'multiplication', answer: 56 })
    ).toThrow(ApiError);
  });

  it('accepts binary operations when num2 is present', () => {
    const parsed = validate(ExplanationRequestSchema, {
      num1: 7,
      num2: 8,
      operation: 'multiplication',
      answer: 56,
    });
    expect(parsed.num2).toBe(8);
  });

  it('does not require num2 for unary operations like squares', () => {
    const parsed = validate(ExplanationRequestSchema, { num1: 9, operation: 'squares', answer: 81 });
    expect(parsed.num1).toBe(9);
  });
});

describe('MultiplayerActionSchema (discriminated union)', () => {
  it('accepts a valid create-room action', () => {
    const parsed = validate(MultiplayerActionSchema, {
      action: 'create-room',
      playerId: 'p1',
      playerName: 'Alice',
    });
    expect(parsed.action).toBe('create-room');
  });

  it('accepts a valid join-room action', () => {
    const parsed = validate(MultiplayerActionSchema, {
      action: 'join-room',
      roomCode: 'ABCD2345',
      playerId: 'p1',
      playerName: 'Alice',
    });
    expect(parsed.action).toBe('join-room');
  });

  it('rejects an unknown action', () => {
    expect(() => validate(MultiplayerActionSchema, { action: 'self-destruct' })).toThrow(ApiError);
  });

  it('rejects a known action missing a required field', () => {
    expect(() => validate(MultiplayerActionSchema, { action: 'create-room', playerId: 'p1' })).toThrow(ApiError);
  });
});
