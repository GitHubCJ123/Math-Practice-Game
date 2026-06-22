import type { Room, RoomSettings, Operation, Question } from "../../shared/types.js";
import { getSupabase } from "./db-pool.js";

/**
 * Multiplayer room store backed by Supabase Postgres. Every concurrent mutation
 * runs through an atomic `mp_*` plpgsql function (see
 * migrations/schema/multiplayer-functions.sql), so all serverless instances
 * share one source of truth — fixing the in-memory, per-lambda split-brain that
 * stranded players on "waiting for opponents". The Postgres functions return the
 * full Room object already shaped to match shared/types.ts.
 */

async function callRpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await getSupabase().rpc(fn, args);
  if (error) {
    console.error(`[lib/api/room-store] rpc ${fn} failed:`, error);
    throw new Error(error.message);
  }
  return data as T;
}

// Envelope shapes returned by the mp_* functions.
export interface RoomResult {
  ok: boolean;
  error?: string;
  room: Room | null;
}
export interface LeaveResult {
  ok: boolean;
  error?: string;
  room: Room | null;
  playerName?: string;
  deleted?: boolean;
}
export interface ReadyResult {
  room: Room | null;
  allReady: boolean;
}
export interface StartResult {
  started: boolean;
  room: Room | null;
}
export interface SubmitResult {
  room: Room | null;
  allFinished: boolean;
  finishTime: number | null;
}
export interface DisconnectResult {
  room: Room | null;
  ended: boolean;
}
export interface QuickMatchResult {
  matched: boolean;
  opponent?: { playerId: string; playerName: string };
}
export interface RematchResult {
  ok: boolean;
  error?: string;
  action?: "request" | "accept" | "decline";
  allAccepted?: boolean;
  acceptedCount?: number;
  totalNeeded?: number;
  playerId?: string;
  playerName?: string;
  declinedBy?: string;
  newRoom?: Room | null;
}

export async function getRoom(roomId: string): Promise<Room | null> {
  return callRpc<Room | null>("mp_room_json", { p_room_id: roomId });
}

export async function createRoom(
  hostId: string,
  hostName: string,
  isQuickMatch: boolean,
  settings: RoomSettings
): Promise<Room> {
  const res = await callRpc<{ room: Room }>("mp_create_room", {
    p_host_id: hostId,
    p_name: hostName,
    p_is_quick: isQuickMatch,
    p_settings: settings,
  });
  return res.room;
}

export async function joinRoom(code: string, playerId: string, playerName: string): Promise<RoomResult> {
  return callRpc<RoomResult>("mp_join_room", {
    p_code: code.toUpperCase(),
    p_player_id: playerId,
    p_name: playerName,
  });
}

export async function leaveRoom(roomId: string, playerId: string): Promise<LeaveResult> {
  return callRpc<LeaveResult>("mp_leave_room", { p_room_id: roomId, p_player_id: playerId });
}

export async function kickPlayer(roomId: string, hostId: string, targetPlayerId: string): Promise<LeaveResult> {
  return callRpc<LeaveResult>("mp_kick_player", {
    p_room_id: roomId,
    p_host_id: hostId,
    p_target: targetPlayerId,
  });
}

export async function updateRoomSettings(
  roomId: string,
  playerId: string,
  settings: Partial<RoomSettings>
): Promise<RoomResult> {
  return callRpc<RoomResult>("mp_update_settings", {
    p_room_id: roomId,
    p_player_id: playerId,
    p_settings: settings,
  });
}

export async function assignPlayerToTeam(
  roomId: string,
  playerId: string,
  targetPlayerId: string,
  teamId: string
): Promise<RoomResult> {
  return callRpc<RoomResult>("mp_assign_team", {
    p_room_id: roomId,
    p_player_id: playerId,
    p_target: targetPlayerId,
    p_team: teamId,
  });
}

export async function startReadyPhase(
  roomId: string,
  playerId: string,
  settings: Partial<RoomSettings> | undefined
): Promise<RoomResult> {
  return callRpc<RoomResult>("mp_start_ready_phase", {
    p_room_id: roomId,
    p_player_id: playerId,
    p_settings: settings ?? null,
  });
}

export async function setPlayerReady(roomId: string, playerId: string, isReady: boolean): Promise<ReadyResult> {
  return callRpc<ReadyResult>("mp_set_ready", {
    p_room_id: roomId,
    p_player_id: playerId,
    p_is_ready: isReady,
  });
}

export async function startGame(roomId: string, questions: Question[]): Promise<StartResult> {
  return callRpc<StartResult>("mp_start_game", { p_room_id: roomId, p_questions: questions });
}

export async function submitPlayerAnswers(
  roomId: string,
  playerId: string,
  answers: string[],
  score: number
): Promise<SubmitResult> {
  return callRpc<SubmitResult>("mp_submit_answers", {
    p_room_id: roomId,
    p_player_id: playerId,
    p_answers: answers,
    p_score: score,
  });
}

export async function playerDisconnected(roomId: string, playerId: string): Promise<DisconnectResult> {
  return callRpc<DisconnectResult>("mp_mark_disconnected", { p_room_id: roomId, p_player_id: playerId });
}

export async function rematch(
  roomId: string,
  playerId: string,
  playerName: string,
  keepTeams: boolean,
  action: "request" | "accept" | "decline"
): Promise<RematchResult> {
  return callRpc<RematchResult>("mp_rematch", {
    p_room_id: roomId,
    p_player_id: playerId,
    p_name: playerName,
    p_keep_teams: keepTeams,
    p_action: action,
  });
}

export async function claimQuickMatch(
  playerId: string,
  playerName: string,
  operation: Operation | string
): Promise<QuickMatchResult> {
  return callRpc<QuickMatchResult>("mp_claim_quick_match", {
    p_player_id: playerId,
    p_name: playerName,
    p_operation: operation,
  });
}

export async function removeFromQuickMatchQueue(playerId: string): Promise<void> {
  await callRpc<null>("mp_dequeue", { p_player_id: playerId });
}
