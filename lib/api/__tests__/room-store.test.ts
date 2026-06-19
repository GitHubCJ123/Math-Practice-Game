import { describe, it, expect, afterAll } from 'vitest';
import {
  createRoom,
  getRoom,
  joinRoom,
  setPlayerReady,
  startGame,
  submitPlayerAnswers,
  leaveRoom,
  claimQuickMatch,
  removeFromQuickMatchQueue,
} from '../room-store.js';
import type { RoomSettings, Question } from '../../../shared/types.js';

/**
 * The room store is now backed by Supabase Postgres functions (see
 * migrations/schema/multiplayer-functions.sql), so these are INTEGRATION tests:
 * they run only when real Supabase credentials are present in the environment
 * (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY). Without them the whole suite is
 * skipped, so the default `npm test` (CI included) stays green. The pure
 * ranking/team logic is covered without a database in game-results.test.ts.
 */
const HAS_DB = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
const suite = HAS_DB ? describe : describe.skip;

const SETTINGS: RoomSettings = {
  operation: 'multiplication',
  selectedNumbers: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  questionCount: 1,
  timeLimit: 0,
  maxPlayers: 4,
  gameMode: 'ffa',
};

const QUESTIONS: Question[] = [{ num1: 2, num2: 3, operation: 'multiplication', answer: 6 }];

suite('room-store (Supabase integration)', () => {
  const createdRoomIds: string[] = [];
  const queuedPlayerIds: string[] = [];

  afterAll(async () => {
    // Best-effort cleanup: empty rooms delete themselves; drop any queue entries.
    for (const id of createdRoomIds) {
      const room = await getRoom(id);
      if (room) {
        for (const p of room.players) await leaveRoom(id, p.id);
      }
    }
    for (const pid of queuedPlayerIds) await removeFromQuickMatchQueue(pid);
  });

  async function freshRoom(hostId: string, hostName: string) {
    const room = await createRoom(hostId, hostName, false, SETTINGS);
    createdRoomIds.push(room.id);
    return room;
  }

  it('creates a waiting room with the host inside', async () => {
    const room = await freshRoom('host-1', 'Ada');
    expect(room.gameState).toBe('waiting');
    expect(room.code).toHaveLength(8);
    expect(room.players).toHaveLength(1);
    expect(room.players[0]).toMatchObject({ id: 'host-1', isHost: true });
  });

  it('joins additional players and rejects a full room', async () => {
    const room = await freshRoom('host-2', 'Ada');
    const join = await joinRoom(room.code, 'p2', 'Grace');
    expect(join.ok).toBe(true);
    expect(join.room?.players).toHaveLength(2);

    await joinRoom(room.code, 'p3', 'Linus');
    await joinRoom(room.code, 'p4', 'Mae');
    const full = await joinRoom(room.code, 'p5', 'Nim');
    expect(full.ok).toBe(false);
    expect(full.error).toMatch(/full/i);
  });

  it('starts when everyone is ready and ends when everyone submits', async () => {
    const room = await freshRoom('host-3', 'Ada');
    await joinRoom(room.code, 'p2', 'Grace');

    await setPlayerReady(room.id, 'host-3', true);
    const ready = await setPlayerReady(room.id, 'p2', true);
    expect(ready.allReady).toBe(true);

    const start = await startGame(room.id, QUESTIONS);
    expect(start.started).toBe(true);
    expect(start.room?.gameState).toBe('playing');

    const first = await submitPlayerAnswers(room.id, 'host-3', ['6'], 100);
    expect(first.allFinished).toBe(false);

    const second = await submitPlayerAnswers(room.id, 'p2', ['6'], 90);
    expect(second.allFinished).toBe(true);
    expect(second.room?.gameState).toBe('finished');
  });

  it('atomically pairs two quick-match players for the same operation', async () => {
    queuedPlayerIds.push('q1', 'q2');
    const first = await claimQuickMatch('q1', 'One', 'multiplication');
    expect(first.matched).toBe(false);

    const second = await claimQuickMatch('q2', 'Two', 'multiplication');
    expect(second.matched).toBe(true);
    expect(second.opponent?.playerId).toBe('q1');
  });
});
