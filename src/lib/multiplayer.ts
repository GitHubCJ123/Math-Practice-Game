import Pusher from "pusher-js";
import type { RoomSettings, GameMode, Team, Player, AIDifficulty, Question } from "../../types";

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

async function multiplayerApi(action: string, data: Record<string, any> = {}, method: string = "POST") {
  const response = await fetch(`${API_BASE}/api/multiplayer`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...data }),
  });
  return response.json();
}

export async function createRoom(
  playerId: string,
  playerName: string,
  maxPlayers: number = 2,
  gameMode: GameMode = 'ffa'
): Promise<{
  success: boolean;
  roomId?: string;
  roomCode?: string;
  joinUrl?: string;
  room?: any;
  error?: string;
}> {
  return multiplayerApi("create-room", { 
    odId: playerId, 
    odName: playerName,
    maxPlayers,
    gameMode,
  });
}

export async function joinRoom(roomCode: string, playerId: string, playerName: string): Promise<{
  success: boolean;
  roomId?: string;
  room?: any;
  error?: string;
}> {
  return multiplayerApi("join-room", { roomCode, odId: playerId, odName: playerName });
}

export async function updateRoomSettings(
  roomId: string,
  playerId: string,
  settings: Partial<RoomSettings>
): Promise<{
  success: boolean;
  settings?: RoomSettings;
  teams?: Team[];
  players?: Player[];
  error?: string;
}> {
  return multiplayerApi("update-room-settings", { roomId, odId: playerId, settings });
}

export async function startGame(roomId: string, playerId: string): Promise<{
  success: boolean;
  error?: string;
}> {
  return multiplayerApi("start-game", { roomId, odId: playerId });
}

export async function startReadyPhase(
  roomId: string,
  playerId: string,
  settings: Partial<RoomSettings>
): Promise<{
  success: boolean;
  error?: string;
}> {
  return multiplayerApi("start-ready-phase", { roomId, odId: playerId, settings });
}

export async function updateProgress(roomId: string, playerId: string, currentQuestion: number): Promise<void> {
  await multiplayerApi("update-progress", { roomId, odId: playerId, currentQuestion });
}

export async function submitMultiplayerAnswers(
  roomId: string,
  playerId: string,
  answers: string[],
  score: number
): Promise<{
  success: boolean;
  allFinished: boolean;
  finishTime?: number;
  error?: string;
}> {
  return multiplayerApi("submit-multiplayer", { roomId, odId: playerId, answers, score });
}

export async function quickMatch(playerId: string, playerName: string, operation: string): Promise<{
  success: boolean;
  matched: boolean;
  roomId?: string;
  roomCode?: string;
  opponent?: { id: string; name: string };
  error?: string;
}> {
  console.log('[Frontend QuickMatch] Starting quick match request:', { playerId, playerName, operation });
  return multiplayerApi("quick-match", { odId: playerId, odName: playerName, operation });
}

export async function cancelQuickMatch(playerId: string): Promise<void> {
  await multiplayerApi("quick-match", { odId: playerId }, "DELETE");
}

export async function leaveRoom(roomId: string, playerId: string, playerName: string): Promise<void> {
  await multiplayerApi("leave-room", { roomId, odId: playerId, odName: playerName });
}

export async function requestRematch(
  roomId: string,
  playerId: string,
  playerName: string,
  keepTeams: boolean = false
): Promise<{
  success: boolean;
  error?: string;
}> {
  return multiplayerApi("rematch", { 
    roomId, 
    odId: playerId, 
    odName: playerName, 
    rematchAction: "request",
    keepTeams,
  });
}

export async function acceptRematch(
  roomId: string,
  playerId: string,
  playerName: string,
  keepTeams: boolean = false
): Promise<{
  success: boolean;
  newRoomId?: string;
  newRoomCode?: string;
  teams?: Team[];
  players?: Player[];
  error?: string;
}> {
  return multiplayerApi("rematch", { 
    roomId, 
    odId: playerId, 
    odName: playerName, 
    rematchAction: "accept",
    keepTeams,
  });
}

export async function declineRematch(roomId: string, playerId: string, playerName: string): Promise<void> {
  await multiplayerApi("rematch", { roomId, odId: playerId, odName: playerName, rematchAction: "decline" });
}

export async function notifyDisconnect(roomId: string, playerId: string): Promise<void> {
  await multiplayerApi("player-disconnect", { roomId, odId: playerId });
}

export async function setReady(roomId: string, playerId: string, isReady: boolean): Promise<{
  success: boolean;
  allReady: boolean;
  error?: string;
}> {
  return multiplayerApi("set-ready", { roomId, odId: playerId, isReady });
}

export async function assignPlayerToTeam(
  roomId: string,
  hostPlayerId: string,
  targetPlayerId: string,
  teamId: string
): Promise<{
  success: boolean;
  teams?: Team[];
  players?: Player[];
  error?: string;
}> {
  return multiplayerApi("assign-team", { 
    roomId, 
    odId: hostPlayerId, 
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
    operation: string;
    selectedNumbers: number[];
    questionCount: number;
    timeLimit: number;
  }
): Promise<{
  success: boolean;
  roomId?: string;
  questions?: Question[];
  players?: Player[];
  error?: string;
}> {
  return multiplayerApi("create-ai-game", {
    odId: playerId,
    odName: playerName,
    aiDifficulty,
    settings,
  });
}
