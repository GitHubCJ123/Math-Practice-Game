import { Room, Player, RoomSettings, Question, PlayerGameState, Team } from "../../types.js";
import { generateRoomCode, generatePlayerId } from "./pusher.js";

// In-memory room storage (for production, use Supabase)
// Rooms auto-expire after 1 hour of inactivity
const rooms: Map<string, Room> = new Map();
const roomsByCode: Map<string, string> = new Map(); // code -> roomId
const quickMatchQueue: Map<string, { odId: string; odName: string; operation: string; timestamp: number }> = new Map();

const ROOM_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

// Cleanup expired rooms periodically
setInterval(() => {
  const now = Date.now();
  for (const [roomId, room] of rooms.entries()) {
    if (now - room.createdAt > ROOM_EXPIRY_MS) {
      rooms.delete(roomId);
      roomsByCode.delete(room.code);
    }
  }
  // Cleanup old queue entries (5 minutes)
  for (const [odId, entry] of quickMatchQueue.entries()) {
    if (now - entry.timestamp > 5 * 60 * 1000) {
      quickMatchQueue.delete(odId);
    }
  }
}, 60000); // Check every minute

export function createRoom(hostId: string, hostName: string, isQuickMatch: boolean = false): Room {
  const roomId = generatePlayerId();
  const code = generateRoomCode();
  
  const room: Room = {
    id: roomId,
    code,
    hostId,
    players: [{
      id: hostId,
      name: hostName,
      isHost: true,
      isReady: false,
      connected: true,
    }],
    teams: [],
    settings: {
      operation: "multiplication",
      selectedNumbers: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      questionCount: 10,
      timeLimit: 0,
      maxPlayers: 2,
      gameMode: "ffa",
    },
    questions: [],
    gameState: "waiting",
    gameStartTime: null,
    playerStates: [],
    createdAt: Date.now(),
    isQuickMatch,
  };

  rooms.set(roomId, room);
  roomsByCode.set(code, roomId);
  
  return room;
}

export function getRoom(roomId: string): Room | undefined {
  return rooms.get(roomId);
}

export function getRoomByCode(code: string): Room | undefined {
  const roomId = roomsByCode.get(code.toUpperCase());
  return roomId ? rooms.get(roomId) : undefined;
}

export function joinRoom(code: string, odId: string, odName: string): { success: boolean; room?: Room; error?: string } {
  const room = getRoomByCode(code);
  
  if (!room) {
    return { success: false, error: "Room not found" };
  }
  
  if (room.gameState !== "waiting") {
    return { success: false, error: "Game already in progress" };
  }
  
  const maxPlayers = room.settings.maxPlayers || 2;
  if (room.players.length >= maxPlayers) {
    return { success: false, error: "Room is full" };
  }
  
  // Check if player already in room
  const existingPlayer = room.players.find(p => p.id === odId);
  if (existingPlayer) {
    existingPlayer.connected = true;
    return { success: true, room };
  }
  
  room.players.push({
    id: odId,
    name: odName,
    isHost: false,
    isReady: false,
    connected: true,
  });
  
  return { success: true, room };
}

export function updateRoomSettings(roomId: string, settings: Partial<RoomSettings>): Room | undefined {
  const room = rooms.get(roomId);
  if (room) {
    room.settings = { ...room.settings, ...settings };
  }
  return room;
}

export function setPlayerReady(roomId: string, odId: string, ready: boolean): Room | undefined {
  const room = rooms.get(roomId);
  if (room) {
    const player = room.players.find(p => p.id === odId);
    if (player) {
      player.isReady = ready;
    }
  }
  return room;
}

export function updateRoom(room: Room): void {
  rooms.set(room.id, room);
}

export function startGame(roomId: string, questions: Question[]): Room | undefined {
  const room = rooms.get(roomId);
  if (room && room.players.length >= 2) {
    room.questions = questions;
    room.gameState = "countdown";
    
    // Assign teams if in team mode and teams aren't already assigned
    if (room.settings.gameMode === "teams" && room.teams.length === 0) {
      assignRandomTeams(room);
    }
    
    room.playerStates = room.players.map(p => ({
      odId: p.id,
      odName: p.name,
      answers: [],
      currentQuestion: 0,
      finished: false,
      finishTime: null,
      score: 0,
    }));
  }
  return room;
}

// Randomly assign players to Team A and Team B
export function assignRandomTeams(room: Room): void {
  const playerIds = room.players.map(p => p.id);
  
  // Shuffle players randomly
  for (let i = playerIds.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [playerIds[i], playerIds[j]] = [playerIds[j], playerIds[i]];
  }
  
  // Split into two teams
  const halfPoint = Math.ceil(playerIds.length / 2);
  const teamAPlayerIds = playerIds.slice(0, halfPoint);
  const teamBPlayerIds = playerIds.slice(halfPoint);
  
  room.teams = [
    { id: 'team-a', name: 'Team A', playerIds: teamAPlayerIds },
    { id: 'team-b', name: 'Team B', playerIds: teamBPlayerIds },
  ];
  
  // Update player teamId references
  for (const player of room.players) {
    if (teamAPlayerIds.includes(player.id)) {
      player.teamId = 'team-a';
    } else {
      player.teamId = 'team-b';
    }
  }
}

// Allow host to manually reassign a player to a different team
export function assignPlayerToTeam(roomId: string, playerId: string, teamId: string): Room | undefined {
  const room = rooms.get(roomId);
  if (!room || room.settings.gameMode !== "teams") {
    return room;
  }
  
  // Initialize teams if not already done
  if (room.teams.length === 0) {
    room.teams = [
      { id: 'team-a', name: 'Team A', playerIds: [] },
      { id: 'team-b', name: 'Team B', playerIds: [] },
    ];
  }
  
  // Remove player from current team
  for (const team of room.teams) {
    team.playerIds = team.playerIds.filter(id => id !== playerId);
  }
  
  // Add player to new team
  const targetTeam = room.teams.find(t => t.id === teamId);
  if (targetTeam) {
    targetTeam.playerIds.push(playerId);
  }
  
  // Update player's teamId
  const player = room.players.find(p => p.id === playerId);
  if (player) {
    player.teamId = teamId;
  }
  
  return room;
}

// Re-randomize teams for rematch
export function reshuffleTeams(room: Room): void {
  assignRandomTeams(room);
}

export function setGamePlaying(roomId: string): Room | undefined {
  const room = rooms.get(roomId);
  if (room) {
    room.gameState = "playing";
    room.gameStartTime = Date.now();
  }
  return room;
}

export function updatePlayerProgress(roomId: string, odId: string, currentQuestion: number): Room | undefined {
  const room = rooms.get(roomId);
  if (room) {
    const playerState = room.playerStates.find(p => p.odId === odId);
    if (playerState) {
      playerState.currentQuestion = currentQuestion;
    }
  }
  return room;
}

export function submitPlayerAnswers(
  roomId: string,
  odId: string,
  answers: string[],
  score: number
): { room?: Room; allFinished: boolean } {
  const room = rooms.get(roomId);
  if (!room) {
    return { allFinished: false };
  }

  const playerState = room.playerStates.find(p => p.odId === odId);
  if (playerState && !playerState.finished) {
    playerState.answers = answers;
    playerState.finished = true;
    playerState.finishTime = Date.now() - (room.gameStartTime || Date.now());
    playerState.score = score;
  }

  const allFinished = room.playerStates.every(p => p.finished);
  if (allFinished) {
    room.gameState = "finished";
  }

  return { room, allFinished };
}

export function playerDisconnected(roomId: string, odId: string): Room | undefined {
  const room = rooms.get(roomId);
  if (room) {
    const player = room.players.find(p => p.id === odId);
    if (player) {
      player.connected = false;
    }
    
    // If game is in progress and a player disconnects, they lose
    if (room.gameState === "playing" || room.gameState === "countdown") {
      const playerState = room.playerStates.find(p => p.odId === odId);
      if (playerState && !playerState.finished) {
        playerState.finished = true;
        playerState.finishTime = Date.now() - (room.gameStartTime || Date.now());
        playerState.score = 0; // Disconnected = 0 score
      }
      
      // Check if game should end (all players finished)
      const allFinished = room.playerStates.every(p => p.finished);
      if (allFinished) {
        room.gameState = "finished";
      }
    }
  }
  return room;
}

export function deleteRoom(roomId: string): void {
  const room = rooms.get(roomId);
  if (room) {
    roomsByCode.delete(room.code);
    rooms.delete(roomId);
  }
}

// Quick Match Queue Functions
export function addToQuickMatchQueue(odId: string, odName: string, operation: string): void {
  console.log(`[QuickMatch] Adding to queue: ${odId} for ${operation}`);
  console.log(`[QuickMatch] Queue before add:`, Array.from(quickMatchQueue.entries()));
  quickMatchQueue.set(odId, { odId, odName, operation, timestamp: Date.now() });
  console.log(`[QuickMatch] Queue after add:`, Array.from(quickMatchQueue.entries()));
}

export function removeFromQuickMatchQueue(odId: string): void {
  console.log(`[QuickMatch] Removing from queue: ${odId}`);
  quickMatchQueue.delete(odId);
}

export function findQuickMatchOpponent(odId: string, operation: string): { odId: string; odName: string } | null {
  console.log(`[QuickMatch] Finding opponent for ${odId}, operation: ${operation}`);
  console.log(`[QuickMatch] Current queue:`, Array.from(quickMatchQueue.entries()));
  for (const [queuedId, entry] of quickMatchQueue.entries()) {
    console.log(`[QuickMatch] Checking queue entry: ${queuedId}, operation: ${entry.operation}`);
    if (queuedId !== odId && entry.operation === operation) {
      console.log(`[QuickMatch] Found match! ${queuedId}`);
      quickMatchQueue.delete(queuedId);
      return { odId: entry.odId, odName: entry.odName };
    }
  }
  console.log(`[QuickMatch] No match found`);
  return null;
}

export function getQuickMatchQueueSize(operation: string): number {
  let count = 0;
  for (const entry of quickMatchQueue.values()) {
    if (entry.operation === operation) {
      count++;
    }
  }
  return count;
}
