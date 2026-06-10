import Pusher from "pusher-js";
import type {
  RoomSettings,
  GameMode,
  AIDifficulty,
  Operation,
  MultiplayerAction,
  MultiplayerApiResponse,
} from "@shared/types";
import { logger } from "./logger";

let pusherClient: Pusher | null = null;

export function getPusherClient(): Pusher {
  if (!pusherClient) {
    const key = import.meta.env.VITE_PUSHER_KEY;
    const cluster = import.meta.env.VITE_PUSHER_CLUSTER;

    if (!key || !cluster) {
      throw new Error("VITE_PUSHER_KEY and VITE_PUSHER_CLUSTER environment variables are required");
    }

    pusherClient = new Pusher(key, {
      cluster,
      authEndpoint: "/api/pusher-auth",
    });
  }
  return pusherClient;
}

// API helper - all multiplayer calls go to single endpoint with action parameter
const API_BASE = "";

async function multiplayerApi<TAction extends MultiplayerAction>(
  action: TAction,
  data: Record<string, unknown> = {},
  method: string = "POST"
): Promise<MultiplayerApiResponse<TAction>> {
  const response = await fetch(`${API_BASE}/api/multiplayer`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...data }),
  });
  return response.json() as Promise<MultiplayerApiResponse<TAction>>;
}

export async function createRoom(
  playerId: string,
  playerName: string,
  maxPlayers: number = 2,
  gameMode: GameMode = 'ffa'
): Promise<MultiplayerApiResponse<"create-room">> {
  return multiplayerApi("create-room", { 
    playerId,
    playerName,
    maxPlayers,
    gameMode,
  });
}

export async function joinRoom(roomCode: string, playerId: string, playerName: string): Promise<MultiplayerApiResponse<"join-room">> {
  return multiplayerApi("join-room", { roomCode, playerId, playerName });
}

export async function updateRoomSettings(
  roomId: string,
  playerId: string,
  settings: Partial<RoomSettings>
): Promise<MultiplayerApiResponse<"update-room-settings">> {
  return multiplayerApi("update-room-settings", { roomId, playerId, settings });
}

export async function startGame(roomId: string, playerId: string): Promise<MultiplayerApiResponse<"start-game">> {
  return multiplayerApi("start-game", { roomId, playerId });
}

export async function startReadyPhase(
  roomId: string,
  playerId: string,
  settings: Partial<RoomSettings>
): Promise<MultiplayerApiResponse<"start-ready-phase">> {
  return multiplayerApi("start-ready-phase", { roomId, playerId, settings });
}

export async function updateProgress(roomId: string, playerId: string, currentQuestion: number): Promise<void> {
  await multiplayerApi("update-progress", { roomId, playerId, currentQuestion });
}

export async function submitMultiplayerAnswers(
  roomId: string,
  playerId: string,
  answers: string[],
  score: number
): Promise<MultiplayerApiResponse<"submit-multiplayer">> {
  return multiplayerApi("submit-multiplayer", { roomId, playerId, answers, score });
}

export async function quickMatch(playerId: string, playerName: string, operation: Operation): Promise<MultiplayerApiResponse<"quick-match">> {
  logger.log('[Frontend QuickMatch] Starting quick match request:', { playerId, playerName, operation });
  return multiplayerApi("quick-match", { playerId, playerName, operation });
}

export async function cancelQuickMatch(playerId: string): Promise<void> {
  await multiplayerApi("quick-match", { playerId }, "DELETE");
}

export async function leaveRoom(roomId: string, playerId: string, playerName: string): Promise<void> {
  await multiplayerApi("leave-room", { roomId, playerId, playerName });
}

export async function requestRematch(
  roomId: string,
  playerId: string,
  playerName: string,
  keepTeams: boolean = false
): Promise<MultiplayerApiResponse<"rematch">> {
  return multiplayerApi("rematch", { 
    roomId, 
    playerId,
    playerName,
    rematchAction: "request",
    keepTeams,
  });
}

export async function acceptRematch(
  roomId: string,
  playerId: string,
  playerName: string,
  keepTeams: boolean = false
): Promise<MultiplayerApiResponse<"rematch">> {
  return multiplayerApi("rematch", { 
    roomId, 
    playerId,
    playerName,
    rematchAction: "accept",
    keepTeams,
  });
}

export async function declineRematch(roomId: string, playerId: string, playerName: string): Promise<void> {
  await multiplayerApi("rematch", { roomId, playerId, playerName, rematchAction: "decline" });
}

export async function notifyDisconnect(roomId: string, playerId: string): Promise<void> {
  await multiplayerApi("player-disconnect", { roomId, playerId });
}

export async function setReady(roomId: string, playerId: string, isReady: boolean): Promise<MultiplayerApiResponse<"set-ready">> {
  return multiplayerApi("set-ready", { roomId, playerId, isReady });
}

export async function assignPlayerToTeam(
  roomId: string,
  hostPlayerId: string,
  targetPlayerId: string,
  teamId: string
): Promise<MultiplayerApiResponse<"assign-team">> {
  return multiplayerApi("assign-team", { 
    roomId, 
    playerId: hostPlayerId, 
    targetPlayerId, 
    teamId,
  });
}

// Generate a unique player ID (stored in sessionStorage for per-tab uniqueness)
// This allows testing multiplayer in two browser tabs
export function getOrCreatePlayerId(): string {
  const stored = sessionStorage.getItem("mathWhizPlayerId");
  if (stored) return stored;
  
  const newId = `player_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  sessionStorage.setItem("mathWhizPlayerId", newId);
  return newId;
}

// Create an AI game - immediately starts a game against an AI opponent
export async function createAIGame(
  playerId: string,
  playerName: string,
  aiDifficulty: AIDifficulty,
  settings: {
    operation: Operation;
    selectedNumbers: number[];
    questionCount: number;
    timeLimit: number;
  }
): Promise<MultiplayerApiResponse<"create-ai-game">> {
  return multiplayerApi("create-ai-game", {
    playerId,
    playerName,
    aiDifficulty,
    settings,
  });
}
