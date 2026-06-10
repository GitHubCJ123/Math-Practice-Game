import { describe, it, expect } from 'vitest';
import {
  validate,
  SubmitScoreSchema,
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

describe('SubmitScoreSchema', () => {
  const valid = {
    playerName: 'Alice',
    score: 1234,
    operationType: 'multiplication',
    questionCount: 10,
    selectedNumbersCount: 12,
    allNumbersSelected: true,
  };

  it('coerces string numbers and booleans from form/query input', () => {
    const parsed = validate(SubmitScoreSchema, {
      ...valid,
      score: '1234',
      questionCount: '10',
      selectedNumbersCount: '12',
      allNumbersSelected: 'true',
    });
    expect(parsed.score).toBe(1234);
    expect(parsed.questionCount).toBe(10);
    expect(parsed.selectedNumbersCount).toBe(12);
    expect(parsed.allNumbersSelected).toBe(true);
  });

  it('coerces the string "false" to boolean false', () => {
    const parsed = validate(SubmitScoreSchema, { ...valid, allNumbersSelected: 'false' });
    expect(parsed.allNumbersSelected).toBe(false);
  });

  it('rejects an empty name', () => {
    expect(() => validate(SubmitScoreSchema, { ...valid, playerName: '' })).toThrow(ApiError);
  });

  it('rejects a name longer than 50 characters', () => {
    expect(() => validate(SubmitScoreSchema, { ...valid, playerName: 'x'.repeat(51) })).toThrow(ApiError);
  });

  it('rejects a negative score', () => {
    expect(() => validate(SubmitScoreSchema, { ...valid, score: -1 })).toThrow(ApiError);
  });

  it('rejects an unknown operation type', () => {
    expect(() => validate(SubmitScoreSchema, { ...valid, operationType: 'calculus' })).toThrow(ApiError);
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
