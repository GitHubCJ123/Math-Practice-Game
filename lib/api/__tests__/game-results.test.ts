import { describe, it, expect } from 'vitest';
import { buildGameResults, assignRandomTeams } from '../game-results.js';
import type { Room, Player, PlayerGameState, Question, Team } from '../../../shared/types.js';

const SAMPLE_QUESTIONS: Question[] = [
  { num1: 2, num2: 3, operation: 'multiplication', answer: 6 },
];

function player(id: string, teamId?: string): Player {
  return { id, name: id.toUpperCase(), isHost: false, isReady: true, connected: true, teamId };
}

function state(playerId: string, score: number, finishTime: number | null): PlayerGameState {
  return {
    playerId,
    playerName: playerId.toUpperCase(),
    answers: [],
    currentQuestion: 0,
    finished: true,
    finishTime,
    score,
  };
}

function makeRoom(overrides: Partial<Room> = {}): Room {
  return {
    id: 'r1',
    code: 'ABCDEFGH',
    hostId: 'p1',
    players: [],
    teams: [],
    settings: {
      operation: 'multiplication',
      selectedNumbers: [1, 2, 3],
      questionCount: 1,
      timeLimit: 0,
      maxPlayers: 4,
      gameMode: 'ffa',
    },
    questions: SAMPLE_QUESTIONS,
    gameState: 'finished',
    gameStartTime: 0,
    playerStates: [],
    createdAt: 0,
    isQuickMatch: false,
    ...overrides,
  };
}

describe('buildGameResults (FFA)', () => {
  it('ranks by score descending', () => {
    const room = makeRoom({
      players: [player('p1'), player('p2'), player('p3')],
      playerStates: [state('p1', 80, 1000), state('p2', 100, 1000), state('p3', 90, 1000)],
    });
    const { results, teamResults } = buildGameResults(room);
    expect(teamResults).toBeUndefined();
    expect(results.map(r => r.playerId)).toEqual(['p2', 'p3', 'p1']);
    expect(results.map(r => r.rank)).toEqual([1, 2, 3]);
  });

  it('breaks score ties by faster finish time', () => {
    const room = makeRoom({
      players: [player('slow'), player('fast')],
      playerStates: [state('slow', 100, 5000), state('fast', 100, 3000)],
    });
    const { results } = buildGameResults(room);
    expect(results[0].playerId).toBe('fast');
    expect(results[0].rank).toBe(1);
    expect(results[1].playerId).toBe('slow');
  });

  it('carries per-player question count and answers through', () => {
    const room = makeRoom({
      players: [player('p1')],
      playerStates: [{ ...state('p1', 1, 1200), answers: ['6'] }],
    });
    const { results } = buildGameResults(room);
    expect(results[0]).toMatchObject({
      totalQuestions: SAMPLE_QUESTIONS.length,
      timeTaken: 1200,
      answers: ['6'],
    });
  });
});

describe('buildGameResults (teams)', () => {
  const teams: Team[] = [
    { id: 'team-a', name: 'Team A', playerIds: ['p1', 'p2'] },
    { id: 'team-b', name: 'Team B', playerIds: ['p3', 'p4'] },
  ];

  it('declares the higher average-score team the winner', () => {
    const room = makeRoom({
      settings: { ...makeRoom().settings, gameMode: 'teams' },
      teams,
      players: [player('p1', 'team-a'), player('p2', 'team-a'), player('p3', 'team-b'), player('p4', 'team-b')],
      playerStates: [state('p1', 100, 1000), state('p2', 100, 1000), state('p3', 50, 1000), state('p4', 50, 1000)],
    });
    const { teamResults } = buildGameResults(room);
    expect(teamResults).toHaveLength(2);
    expect(teamResults?.find(t => t.teamId === 'team-a')?.isWinner).toBe(true);
    expect(teamResults?.find(t => t.teamId === 'team-b')?.isWinner).toBe(false);
  });

  it('breaks an average-score tie by faster average time', () => {
    const room = makeRoom({
      settings: { ...makeRoom().settings, gameMode: 'teams' },
      teams,
      players: [player('p1', 'team-a'), player('p2', 'team-a'), player('p3', 'team-b'), player('p4', 'team-b')],
      playerStates: [state('p1', 100, 1000), state('p2', 100, 1000), state('p3', 100, 4000), state('p4', 100, 4000)],
    });
    const { teamResults } = buildGameResults(room);
    expect(teamResults?.find(t => t.teamId === 'team-a')?.isWinner).toBe(true);
  });

  it('leaves both teams as non-winners on a true draw', () => {
    const room = makeRoom({
      settings: { ...makeRoom().settings, gameMode: 'teams' },
      teams,
      players: [player('p1', 'team-a'), player('p2', 'team-a'), player('p3', 'team-b'), player('p4', 'team-b')],
      playerStates: [state('p1', 100, 1000), state('p2', 100, 1000), state('p3', 100, 1000), state('p4', 100, 1000)],
    });
    const { teamResults } = buildGameResults(room);
    expect(teamResults?.every(t => !t.isWinner)).toBe(true);
  });
});

describe('assignRandomTeams', () => {
  it('splits all players across two balanced teams', () => {
    const room = makeRoom({
      players: [player('p1'), player('p2'), player('p3')],
    });
    assignRandomTeams(room);

    expect(room.teams.map(t => t.id).sort()).toEqual(['team-a', 'team-b']);
    const assigned = room.teams.flatMap(t => t.playerIds).sort();
    expect(assigned).toEqual(['p1', 'p2', 'p3']);
    // 3 players → 2 + 1.
    expect(room.teams.map(t => t.playerIds.length).sort()).toEqual([1, 2]);
    for (const p of room.players) {
      expect(['team-a', 'team-b']).toContain(p.teamId);
    }
  });
});
