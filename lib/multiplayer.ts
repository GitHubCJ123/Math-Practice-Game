import Pusher from "pusher-js";

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

// API helper for multiplayer endpoints
// Use empty string - Vite proxy handles /api/* -> localhost:3001
const API_BASE = "";

export async function createRoom(playerId: string, playerName: string): Promise<{
  success: boolean;
  roomId?: string;
  roomCode?: string;
  joinUrl?: string;
  room?: any;
  error?: string;
}> {
  const response = await fetch(`${API_BASE}/api/create-room`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ odId: playerId, odName: playerName }),
  });
  return response.json();
}

export async function joinRoom(roomCode: string, playerId: string, playerName: string): Promise<{
  success: boolean;
  roomId?: string;
  room?: any;
  error?: string;
}> {
  const response = await fetch(`${API_BASE}/api/join-room`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ roomCode, odId: playerId, odName: playerName }),
  });
  return response.json();
}

export async function updateRoomSettings(roomId: string, playerId: string, settings: any): Promise<{
  success: boolean;
  settings?: any;
  error?: string;
}> {
  const response = await fetch(`${API_BASE}/api/update-room-settings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ roomId, odId: playerId, settings }),
  });
  return response.json();
}

export async function startGame(roomId: string, playerId: string): Promise<{
  success: boolean;
  error?: string;
}> {
  const response = await fetch(`${API_BASE}/api/start-game`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ roomId, odId: playerId }),
  });
  return response.json();
}

export async function startReadyPhase(roomId: string, playerId: string, settings: any): Promise<{
  success: boolean;
  error?: string;
}> {
  const response = await fetch(`${API_BASE}/api/start-ready-phase`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ roomId, odId: playerId, settings }),
  });
  return response.json();
}

export async function updateProgress(roomId: string, playerId: string, currentQuestion: number): Promise<void> {
  await fetch(`${API_BASE}/api/update-progress`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ roomId, odId: playerId, currentQuestion }),
  });
}

export async function submitMultiplayerAnswers(
  roomId: string,
  playerId: string,
  answers: string[],
  score: number
): Promise<{
  success: boolean;
  bothFinished: boolean;
  finishTime?: number;
  error?: string;
}> {
  const response = await fetch(`${API_BASE}/api/submit-multiplayer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ roomId, odId: playerId, answers, score }),
  });
  return response.json();
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
  console.log('[Frontend QuickMatch] Fetching:', `${API_BASE}/api/quick-match`);
  try {
    const response = await fetch(`${API_BASE}/api/quick-match`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ odId: playerId, odName: playerName, operation }),
    });
    console.log('[Frontend QuickMatch] Response status:', response.status);
    const data = await response.json();
    console.log('[Frontend QuickMatch] Response data:', data);
    return data;
  } catch (error) {
    console.error('[Frontend QuickMatch] Error:', error);
    throw error;
  }
}

export async function cancelQuickMatch(playerId: string): Promise<void> {
  await fetch(`${API_BASE}/api/quick-match`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ odId: playerId }),
  });
}

export async function leaveRoom(roomId: string, playerId: string, playerName: string): Promise<void> {
  await fetch(`${API_BASE}/api/leave-room`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ roomId, odId: playerId, odName: playerName }),
  });
}

export async function requestRematch(roomId: string, playerId: string, playerName: string): Promise<{
  success: boolean;
  error?: string;
}> {
  const response = await fetch(`${API_BASE}/api/rematch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ roomId, odId: playerId, odName: playerName, action: "request" }),
  });
  return response.json();
}

export async function acceptRematch(roomId: string, playerId: string, playerName: string): Promise<{
  success: boolean;
  newRoomId?: string;
  newRoomCode?: string;
  error?: string;
}> {
  const response = await fetch(`${API_BASE}/api/rematch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ roomId, odId: playerId, odName: playerName, action: "accept" }),
  });
  return response.json();
}

export async function declineRematch(roomId: string, playerId: string, playerName: string): Promise<void> {
  await fetch(`${API_BASE}/api/rematch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ roomId, odId: playerId, odName: playerName, action: "decline" }),
  });
}

export async function notifyDisconnect(roomId: string, playerId: string): Promise<void> {
  await fetch(`${API_BASE}/api/player-disconnect`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ roomId, odId: playerId }),
  });
}

export async function setReady(roomId: string, playerId: string, isReady: boolean): Promise<{
  success: boolean;
  allReady: boolean;
  error?: string;
}> {
  const response = await fetch(`${API_BASE}/api/set-ready`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ roomId, odId: playerId, isReady }),
  });
  return response.json();
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
