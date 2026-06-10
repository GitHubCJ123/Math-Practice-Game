import { describe, it, expect, afterEach } from 'vitest';
import {
  createRoom,
  getRoom,
  getRoomByCode,
  joinRoom,
  updateRoomSettings,
  setPlayerReady,
  startGame,
  assignRandomTeams,
  assignPlayerToTeam,
  setGamePlaying,
  updatePlayerProgress,
  submitPlayerAnswers,
  playerDisconnected,
  deleteRoom,
  addToQuickMatchQueue,
  removeFromQuickMatchQueue,
  findQuickMatchOpponent,
  getQuickMatchQueueSize,
} from '../room-store.js';
import type { Question } from '../../../shared/types.js';

// The store keeps module-level singleton Maps, so clean up everything we create.
const createdRoomIds: string[] = [];
const queuedPlayerIds: string[] = [];

function makeRoom(hostId = 'host-1', hostName = 'Host') {
  const room = createRoom(hostId, hostName);
  createdRoomIds.push(room.id);
  return room;
}

function queue(playerId: string, name: string, operation: string) {
  addToQuickMatchQueue(playerId, name, operation);
  queuedPlayerIds.push(playerId);
}

const SAMPLE_QUESTIONS: Question[] = [
  { num1: 2, num2: 3, operation: 'multiplication', answer: 6 },
];

afterEach(() => {
  for (const id of createdRoomIds) deleteRoom(id);
  createdRoomIds.length = 0;
  for (const pid of queuedPlayerIds) removeFromQuickMatchQueue(pid);
  queuedPlayerIds.length = 0;
});

describe('createRoom', () => {
  it('creates a waiting FFA room with sensible defaults and the host inside', () => {
    const room = makeRoom('host-1', 'Ada');
    expect(room.gameState).toBe('waiting');
    expect(room.settings.gameMode).toBe('ffa');
    expect(room.settings.operation).toBe('multiplication');
    expect(room.settings.maxPlayers).toBe(2);
    expect(room.settings.selectedNumbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(room.players).toHaveLength(1);
    expect(room.players[0]).toMatchObject({ id: 'host-1', name: 'Ada', isHost: true, connected: true });
    expect(room.code).toHaveLength(8);
  });
});

describe('getRoom / getRoomByCode', () => {
  it('looks rooms up by id and by code (case-insensitively)', () => {
    const room = makeRoom();
    expect(getRoom(room.id)?.id).toBe(room.id);
    expect(getRoomByCode(room.code)?.id).toBe(room.id);
    expect(getRoomByCode(room.code.toLowerCase())?.id).toBe(room.id);
  });

  it('returns undefined for unknown ids/codes', () => {
    expect(getRoom('nope')).toBeUndefined();
    expect(getRoomByCode('ZZZZZZZZ')).toBeUndefined();
  });
});

describe('joinRoom', () => {
  it('adds a new player to a waiting room', () => {
    const room = makeRoom();
    const result = joinRoom(room.code, 'p2', 'Grace');
    expect(result.success).toBe(true);
    expect(result.room?.players).toHaveLength(2);
    expect(result.room?.players.find(p => p.id === 'p2')?.isHost).toBe(false);
  });

  it('fails when the room does not exist', () => {
    const result = joinRoom('ZZZZZZZZ', 'p2', 'Grace');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not found/i);
  });

  it('fails when the room is full', () => {
    const room = makeRoom(); // maxPlayers defaults to 2
    joinRoom(room.code, 'p2', 'Grace');
    const third = joinRoom(room.code, 'p3', 'Linus');
    expect(third.success).toBe(false);
    expect(third.error).toMatch(/full/i);
  });

  it('fails when the game is already in progress', () => {
    const room = makeRoom();
    joinRoom(room.code, 'p2', 'Grace');
    startGame(room.id, SAMPLE_QUESTIONS); // gameState → countdown
    const late = joinRoom(room.code, 'p3', 'Linus');
    expect(late.success).toBe(false);
    expect(late.error).toMatch(/in progress/i);
  });

  it('marks an existing player reconnected instead of duplicating them', () => {
    const room = makeRoom();
    // Leave headroom: joinRoom checks capacity before the reconnect branch, so a
    // full room would reject even an existing player trying to rejoin.
    updateRoomSettings(room.id, { maxPlayers: 4 });
    joinRoom(room.code, 'p2', 'Grace');
    playerDisconnected(room.id, 'p2');
    const rejoin = joinRoom(room.code, 'p2', 'Grace');
    expect(rejoin.success).toBe(true);
    expect(rejoin.room?.players).toHaveLength(2);
    expect(rejoin.room?.players.find(p => p.id === 'p2')?.connected).toBe(true);
  });
});

describe('updateRoomSettings', () => {
  it('merges partial settings', () => {
    const room = makeRoom();
    const updated = updateRoomSettings(room.id, { maxPlayers: 4, gameMode: 'teams' });
    expect(updated?.settings.maxPlayers).toBe(4);
    expect(updated?.settings.gameMode).toBe('teams');
    // Untouched fields are preserved.
    expect(updated?.settings.operation).toBe('multiplication');
  });
});

describe('setPlayerReady', () => {
  it('toggles a player ready flag', () => {
    const room = makeRoom();
    setPlayerReady(room.id, 'host-1', true);
    expect(getRoom(room.id)?.players[0].isReady).toBe(true);
    setPlayerReady(room.id, 'host-1', false);
    expect(getRoom(room.id)?.players[0].isReady).toBe(false);
  });
});

describe('startGame', () => {
  it('does nothing with fewer than two players', () => {
    const room = makeRoom();
    const result = startGame(room.id, SAMPLE_QUESTIONS);
    expect(result?.gameState).toBe('waiting');
    expect(result?.playerStates).toHaveLength(0);
  });

  it('moves to countdown and seeds zeroed player states for each player', () => {
    const room = makeRoom();
    joinRoom(room.code, 'p2', 'Grace');
    const result = startGame(room.id, SAMPLE_QUESTIONS);
    expect(result?.gameState).toBe('countdown');
    expect(result?.questions).toEqual(SAMPLE_QUESTIONS);
    expect(result?.playerStates).toHaveLength(2);
    for (const ps of result!.playerStates) {
      expect(ps).toMatchObject({ currentQuestion: 0, finished: false, finishTime: null, score: 0 });
    }
  });

  it('assigns teams when starting a team-mode game', () => {
    const room = makeRoom();
    joinRoom(room.code, 'p2', 'Grace');
    updateRoomSettings(room.id, { gameMode: 'teams' });
    const result = startGame(room.id, SAMPLE_QUESTIONS);
    expect(result?.teams).toHaveLength(2);
  });
});

describe('team assignment', () => {
  it('splits all players across team A and B with balanced sizes', () => {
    const room = makeRoom();
    updateRoomSettings(room.id, { maxPlayers: 4, gameMode: 'teams' });
    joinRoom(room.code, 'p2', 'B');
    joinRoom(room.code, 'p3', 'C');
    assignRandomTeams(room);

    expect(room.teams.map(t => t.id).sort()).toEqual(['team-a', 'team-b']);
    const assigned = room.teams.flatMap(t => t.playerIds);
    expect(assigned.sort()).toEqual(['host-1', 'p2', 'p3'].sort());
    // 3 players → 2 + 1.
    const sizes = room.teams.map(t => t.playerIds.length).sort();
    expect(sizes).toEqual([1, 2]);
    for (const player of room.players) {
      expect(['team-a', 'team-b']).toContain(player.teamId);
    }
  });

  it('reassigns a player to a specific team', () => {
    const room = makeRoom();
    updateRoomSettings(room.id, { maxPlayers: 4, gameMode: 'teams' });
    joinRoom(room.code, 'p2', 'B');
    assignRandomTeams(room);

    assignPlayerToTeam(room.id, 'p2', 'team-a');
    const fresh = getRoom(room.id)!;
    expect(fresh.players.find(p => p.id === 'p2')?.teamId).toBe('team-a');
    expect(fresh.teams.find(t => t.id === 'team-a')?.playerIds).toContain('p2');
    expect(fresh.teams.find(t => t.id === 'team-b')?.playerIds).not.toContain('p2');
  });
});

describe('in-game progression', () => {
  function startedRoom() {
    const room = makeRoom();
    joinRoom(room.code, 'p2', 'Grace');
    startGame(room.id, SAMPLE_QUESTIONS);
    setGamePlaying(room.id);
    return room;
  }

  it('setGamePlaying flips to playing and records a start time', () => {
    const room = startedRoom();
    const fresh = getRoom(room.id)!;
    expect(fresh.gameState).toBe('playing');
    expect(typeof fresh.gameStartTime).toBe('number');
  });

  it('updatePlayerProgress records the current question', () => {
    const room = startedRoom();
    updatePlayerProgress(room.id, 'p2', 5);
    expect(getRoom(room.id)?.playerStates.find(p => p.playerId === 'p2')?.currentQuestion).toBe(5);
  });

  it('marks a player finished and ends the game once everyone is done', () => {
    const room = startedRoom();

    const first = submitPlayerAnswers(room.id, 'host-1', ['6'], 100);
    expect(first.allFinished).toBe(false);
    const hostState = first.room?.playerStates.find(p => p.playerId === 'host-1');
    expect(hostState?.finished).toBe(true);
    expect(hostState?.score).toBe(100);
    expect(hostState?.finishTime).toBeGreaterThanOrEqual(0);

    const second = submitPlayerAnswers(room.id, 'p2', ['6'], 200);
    expect(second.allFinished).toBe(true);
    expect(second.room?.gameState).toBe('finished');
  });

  it('ignores a second submission from the same player', () => {
    const room = startedRoom();
    submitPlayerAnswers(room.id, 'host-1', ['6'], 100);
    submitPlayerAnswers(room.id, 'host-1', ['0'], 999);
    const state = getRoom(room.id)?.playerStates.find(p => p.playerId === 'host-1');
    expect(state?.score).toBe(100); // unchanged
  });

  it('treats an in-game disconnect as a finish with score 0', () => {
    const room = startedRoom();
    playerDisconnected(room.id, 'p2');
    const state = getRoom(room.id)?.playerStates.find(p => p.playerId === 'p2');
    expect(state?.finished).toBe(true);
    expect(state?.score).toBe(0);
    expect(getRoom(room.id)?.players.find(p => p.id === 'p2')?.connected).toBe(false);
  });
});

describe('deleteRoom', () => {
  it('removes the room from both the id and code indexes', () => {
    const room = createRoom('host-1', 'Ada');
    deleteRoom(room.id);
    expect(getRoom(room.id)).toBeUndefined();
    expect(getRoomByCode(room.code)).toBeUndefined();
  });
});

describe('quick match queue', () => {
  it('matches two players queued for the same operation', () => {
    queue('q1', 'One', 'multiplication');
    const opponent = findQuickMatchOpponent('q2', 'multiplication');
    expect(opponent).toEqual({ playerId: 'q1', playerName: 'One' });
    // The matched opponent is removed from the queue.
    expect(getQuickMatchQueueSize('multiplication')).toBe(0);
  });

  it('does not match a player with themselves', () => {
    queue('q1', 'One', 'division');
    expect(findQuickMatchOpponent('q1', 'division')).toBeNull();
  });

  it('does not match across different operations', () => {
    queue('q1', 'One', 'squares');
    expect(findQuickMatchOpponent('q2', 'division')).toBeNull();
    expect(getQuickMatchQueueSize('squares')).toBe(1);
  });

  it('removes a player from the queue', () => {
    queue('q1', 'One', 'multiplication');
    removeFromQuickMatchQueue('q1');
    expect(getQuickMatchQueueSize('multiplication')).toBe(0);
  });
});
