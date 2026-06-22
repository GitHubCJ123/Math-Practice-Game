import type { VercelRequest, VercelResponse } from "@vercel/node";
import { apiError, handleApiError } from "../lib/api/errors.js";
import { MultiplayerActionSchema, validate } from "../lib/api/validation.js";
import type { MultiplayerActionInput } from "../lib/api/validation.js";
import { getPusher } from "../lib/api/pusher.js";
import {
  createRoom,
  joinRoom,
  getRoom,
  leaveRoom,
  updateRoomSettings,
  startReadyPhase,
  startGame,
  submitPlayerAnswers,
  playerDisconnected,
  removeFromQuickMatchQueue,
  claimQuickMatch,
  setPlayerReady,
  assignPlayerToTeam,
  kickPlayer,
  rematch,
} from "../lib/api/room-store.js";
import { buildGameResults } from "../lib/api/game-results.js";
import { generateQuestions } from "../shared/questions.js";
import type { RoomSettings, MultiplayerResult, TeamResult, RoomEventName, RoomEventPayloads } from "../shared/types.js";

const DEFAULT_ROOM_SETTINGS: RoomSettings = {
  operation: "multiplication",
  selectedNumbers: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  questionCount: 10,
  timeLimit: 0,
  maxPlayers: 2,
  gameMode: "ffa",
};

type ActionBody<TAction extends MultiplayerActionInput["action"]> = Extract<MultiplayerActionInput, { action: TAction }>;

async function triggerPusher(channel: string, event: string, data: unknown): Promise<void> {
  try {
    await getPusher().trigger(channel, event, data);
  } catch (error) {
    console.error(`[api/multiplayer] Pusher trigger failed (${event} on ${channel}):`, error);
    throw error;
  }
}

/**
 * Typed wrapper around {@link triggerPusher} for room-channel events. The payload
 * is checked against {@link RoomEventPayloads} for the given event name, so the
 * server can't emit a shape that drifts from what the client handlers read.
 */
async function triggerRoomEvent<E extends RoomEventName>(
  roomId: string,
  event: E,
  data: RoomEventPayloads[E]
): Promise<void> {
  await triggerPusher(`room-${roomId}`, event, data);
}

// Action handlers
async function handleCreateRoom(body: ActionBody<"create-room">, res: VercelResponse) {
  const { playerId, playerName } = body;

  if (!playerId || !playerName) {
    return apiError(res, 400, "Player ID and name are required");
  }

  const room = await createRoom(playerId, playerName.substring(0, 20), false, DEFAULT_ROOM_SETTINGS);

  // Use BASE_URL if set (for custom domains), otherwise fall back to VERCEL_URL or localhost
  const baseUrl = process.env.BASE_URL 
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  const joinUrl = `${baseUrl}/join/${room.code}`;

  return res.status(200).json({
    success: true,
    roomId: room.id,
    roomCode: room.code,
    joinUrl,
    room: {
      id: room.id,
      code: room.code,
      players: room.players,
      settings: room.settings,
      gameState: room.gameState,
    },
  });
}

async function handleJoinRoom(body: ActionBody<"join-room">, res: VercelResponse) {
  const { roomCode, playerId, playerName } = body;

  if (!roomCode || !playerId || !playerName) {
    return apiError(res, 400, "Room code, player ID, and name are required");
  }

  const result = await joinRoom(roomCode.toUpperCase(), playerId, playerName.substring(0, 20));

  if (!result.ok || !result.room) {
    return apiError(res, 400, result.error ?? "Unable to join room");
  }

  const room = result.room;
  const newPlayer = room.players.find(p => p.id === playerId);
  if (!newPlayer) {
    return apiError(res, 500, "Player not found after joining room");
  }

  // Teams are assigned server-side in mp_join_room; broadcast the result.
  if (room.settings.gameMode === "teams" && room.teams.length > 0) {
    await triggerRoomEvent(room.id, "teams-updated", {
      teams: room.teams,
      players: room.players,
    });
  }

  await triggerRoomEvent(room.id, "player-joined", {
    player: newPlayer,
  });

  return res.status(200).json({
    success: true,
    roomId: room.id,
    room: {
      id: room.id,
      code: room.code,
      players: room.players,
      settings: room.settings,
      gameState: room.gameState,
      hostId: room.hostId,
      teams: room.teams,
    },
  });
}

async function handleLeaveRoom(body: ActionBody<"leave-room">, res: VercelResponse) {
  const { roomId, playerId, playerName } = body;

  if (!roomId || !playerId) {
    return apiError(res, 400, "roomId and playerId are required");
  }

  const result = await leaveRoom(roomId, playerId);
  if (!result.ok) {
    return apiError(res, 404, result.error ?? "Unable to leave room");
  }

  await triggerRoomEvent(roomId, "player-left", {
    playerId,
    playerName: playerName || result.playerName || "Player",
  });

  return res.status(200).json({ success: true });
}

async function handleQuickMatch(body: ActionBody<"quick-match">, method: string, res: VercelResponse) {
  if (method === "DELETE") {
    const { playerId } = body;
    if (playerId) {
      await removeFromQuickMatchQueue(playerId);
    }
    return res.status(200).json({ success: true });
  }

  const { playerId, playerName, operation } = body;

  if (!playerId || !playerName || !operation) {
    return apiError(res, 400, "Player ID, name, and operation are required");
  }

  const claim = await claimQuickMatch(playerId, playerName.substring(0, 20), operation);

  if (claim.matched && claim.opponent) {
    const allNumbers = operation === "squares" || operation === "square-roots"
      ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]
      : operation === "negative-numbers"
      ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
      : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

    const settings: RoomSettings = {
      operation,
      selectedNumbers: allNumbers,
      questionCount: 10,
      timeLimit: 0,
      maxPlayers: 2,
      gameMode: "ffa",
    };

    const room = await createRoom(claim.opponent.playerId, claim.opponent.playerName, true, settings);
    await joinRoom(room.code, playerId, playerName.substring(0, 20));

    await triggerPusher(`quickmatch-${claim.opponent.playerId}`, "match-found", {
      roomId: room.id,
      roomCode: room.code,
      opponent: { id: playerId, name: playerName },
      operation: operation,
    });

    return res.status(200).json({
      success: true,
      matched: true,
      roomId: room.id,
      roomCode: room.code,
      opponent: { id: claim.opponent.playerId, name: claim.opponent.playerName },
    });
  }

  return res.status(200).json({
    success: true,
    matched: false,
    message: "Added to queue, waiting for opponent",
  });
}

async function handleSetReady(body: ActionBody<"set-ready">, res: VercelResponse) {
  const { roomId, playerId, isReady } = body;

  if (!roomId || !playerId || typeof isReady !== "boolean") {
    return apiError(res, 400, "Room ID, player ID, and isReady status are required");
  }

  const ready = await setPlayerReady(roomId, playerId, isReady);
  if (!ready.room) {
    return apiError(res, 404, "Room not found");
  }

  await triggerRoomEvent(roomId, "player-ready", {
    playerId,
    isReady,
  });

  if (ready.allReady) {
    const questions = generateQuestions(
      ready.room.settings.operation,
      ready.room.settings.selectedNumbers,
      ready.room.settings.questionCount
    );

    const start = await startGame(roomId, questions);

    if (start.started && start.room) {
      await triggerRoomEvent(roomId, "game-starting", {
        questions: start.room.questions,
        teams: start.room.teams,
        players: start.room.players,
      });
    }
  }

  return res.status(200).json({
    success: true,
    allReady: ready.allReady,
  });
}

async function handleStartReadyPhase(body: ActionBody<"start-ready-phase">, res: VercelResponse) {
  const { roomId, playerId, settings } = body;

  if (!roomId || !playerId) {
    return apiError(res, 400, "roomId and playerId are required");
  }

  const result = await startReadyPhase(roomId, playerId, settings);
  if (!result.ok || !result.room) {
    const status = result.error === "Room not found" ? 404 : 400;
    return apiError(res, status, result.error ?? "Unable to start ready phase");
  }

  await triggerRoomEvent(roomId, "ready-phase", {
    settings: result.room.settings,
  });

  return res.status(200).json({ success: true });
}

async function handleUpdateRoomSettings(body: ActionBody<"update-room-settings">, res: VercelResponse) {
  const { roomId, playerId, settings } = body;

  if (!roomId || !playerId || !settings) {
    return apiError(res, 400, "Room ID, player ID, and settings are required");
  }

  const result = await updateRoomSettings(roomId, playerId, settings);
  if (!result.ok || !result.room) {
    const status = result.error === "Room not found" ? 404
      : result.error === "Only the host can update settings" ? 403
      : 400;
    return apiError(res, status, result.error ?? "Unable to update settings");
  }

  const updatedRoom = result.room;

  await triggerRoomEvent(roomId, "settings-updated", {
    settings: updatedRoom.settings,
  });

  // mp_update_settings applies team assignment/clearing server-side; mirror it
  // to clients whenever the game mode is part of the change.
  if (settings.gameMode === "teams" || settings.gameMode === "ffa") {
    await triggerRoomEvent(roomId, "teams-updated", {
      teams: updatedRoom.teams,
      players: updatedRoom.players,
    });
  }

  return res.status(200).json({
    success: true,
    settings: updatedRoom.settings,
    teams: updatedRoom.teams,
    players: updatedRoom.players,
  });
}

async function handleStartGame(body: ActionBody<"start-game">, res: VercelResponse) {
  const { roomId, playerId } = body;

  if (!roomId || !playerId) {
    return apiError(res, 400, "Room ID and player ID are required");
  }

  const room = await getRoom(roomId);
  if (!room) {
    return apiError(res, 404, "Room not found");
  }

  if (!room.isQuickMatch && room.hostId !== playerId) {
    return apiError(res, 403, "Only the host can start the game");
  }

  if (room.players.length < 2) {
    return apiError(res, 400, "Need at least 2 players to start");
  }

  if (room.gameState !== "waiting") {
    return apiError(res, 400, "Game already started");
  }

  const questions = generateQuestions(
    room.settings.operation,
    room.settings.selectedNumbers,
    room.settings.questionCount
  );

  const start = await startGame(roomId, questions);
  const startedRoom = start.room ?? room;

  await triggerRoomEvent(roomId, "game-starting", {
    countdown: 3,
    questions,
    teams: startedRoom.teams,
    players: startedRoom.players,
  });

  setTimeout(async () => {
    try {
      await triggerRoomEvent(roomId, "game-started", {
        startTime: startedRoom.gameStartTime,
      });
    } catch (error) {
      console.error(`[api/multiplayer] Delayed game-started emit failed for room ${roomId}:`, error);
    }
  }, 3000);

  return res.status(200).json({
    success: true,
    message: "Game starting",
  });
}

async function handleUpdateProgress(body: ActionBody<"update-progress">, res: VercelResponse) {
  const { roomId, playerId, currentQuestion } = body;

  if (!roomId || !playerId || currentQuestion === undefined) {
    return apiError(res, 400, "Room ID, player ID, and current question are required");
  }

  // Progress pings are ephemeral UI hints: relay over Pusher only, never the DB.
  // This keeps the hottest in-game message path off the database and avoids write
  // contention on the room row at tournament scale.
  await triggerRoomEvent(roomId, "opponent-progress", {
    playerId,
    currentQuestion,
  });

  return res.status(200).json({ success: true });
}

async function handleSubmitMultiplayer(body: ActionBody<"submit-multiplayer">, res: VercelResponse) {
  const { roomId, playerId, answers, score } = body;

  if (!roomId || !playerId || !answers || score === undefined) {
    return apiError(res, 400, "Room ID, player ID, answers, and score are required");
  }

  const submit = await submitPlayerAnswers(roomId, playerId, answers, score);
  if (!submit.room) {
    return apiError(res, 404, "Room not found");
  }

  await triggerRoomEvent(roomId, "opponent-finished", {
    playerId,
    finishTime: submit.finishTime ?? null,
  });

  let results: MultiplayerResult[] | undefined;
  let teamResults: TeamResult[] | undefined;

  if (submit.allFinished) {
    ({ results, teamResults } = buildGameResults(submit.room));

    await triggerRoomEvent(roomId, "game-ended", {
      results,
      teamResults,
    });
  }

  // Return the full results in the HTTP response too. If this submit was the one
  // that completed the game, the finishing client can navigate to results from
  // this authoritative response even if the `game-ended` broadcast is missed.
  return res.status(200).json({
    success: true,
    allFinished: submit.allFinished,
    finishTime: submit.finishTime ?? undefined,
    results,
    teamResults,
  });
}

async function handleRematch(body: ActionBody<"rematch">, res: VercelResponse) {
  const { roomId, playerId, playerName, rematchAction, keepTeams } = body;

  if (!roomId || !playerId || !playerName || !rematchAction) {
    return apiError(res, 400, "Room ID, player ID, name, and rematchAction are required");
  }

  const result = await rematch(roomId, playerId, playerName, keepTeams || false, rematchAction);
  if (!result.ok) {
    const status = result.error === "Room not found" ? 404
      : result.error === "Player not in room" ? 403
      : 400;
    return apiError(res, status, result.error ?? "Rematch failed");
  }

  if (rematchAction === "request") {
    await triggerRoomEvent(roomId, "rematch-requested", {
      fromPlayerId: playerId,
      fromPlayerName: playerName,
      keepTeams: keepTeams || false,
      totalNeeded: result.totalNeeded ?? 0,
    });
    return res.status(200).json({ success: true, message: "Rematch request sent", totalNeeded: result.totalNeeded });
  }

  if (rematchAction === "decline") {
    await triggerRoomEvent(roomId, "rematch-declined", {
      declinedBy: result.declinedBy ?? playerName,
    });
    return res.status(200).json({ success: true, message: "Rematch declined" });
  }

  // accept
  if (!result.allAccepted) {
    await triggerRoomEvent(roomId, "rematch-player-accepted", {
      playerId,
      playerName,
      acceptedCount: result.acceptedCount ?? 0,
      totalNeeded: result.totalNeeded ?? 0,
    });
    return res.status(200).json({
      success: true,
      message: "Acceptance recorded, waiting for other players",
      acceptedCount: result.acceptedCount,
      totalNeeded: result.totalNeeded,
    });
  }

  const newRoom = result.newRoom;
  if (!newRoom) {
    return apiError(res, 500, "Rematch room was not created");
  }

  await triggerRoomEvent(roomId, "rematch-accepted", {
    newRoomCode: newRoom.code,
    newRoomId: newRoom.id,
    isQuickMatch: newRoom.isQuickMatch,
    settings: newRoom.settings,
    players: newRoom.players,
    teams: newRoom.teams,
    keepTeams: keepTeams || false,
  });

  return res.status(200).json({
    success: true,
    newRoomId: newRoom.id,
    newRoomCode: newRoom.code,
    isQuickMatch: newRoom.isQuickMatch,
    settings: newRoom.settings,
    players: newRoom.players,
    teams: newRoom.teams,
  });
}

async function handlePlayerDisconnect(body: ActionBody<"player-disconnect">, res: VercelResponse) {
  const { roomId, playerId } = body;

  if (!roomId || !playerId) {
    return apiError(res, 400, "Room ID and player ID are required");
  }

  const result = await playerDisconnected(roomId, playerId);

  if (result.room) {
    await triggerRoomEvent(roomId, "player-disconnected", {
      playerId,
    });

    if (result.ended) {
      const { results, teamResults } = buildGameResults(result.room);

      await triggerRoomEvent(roomId, "game-ended", {
        results,
        teamResults,
      });
    }
  }

  return res.status(200).json({ success: true });
}

// Handle host assigning a player to a team
async function handleAssignTeam(body: ActionBody<"assign-team">, res: VercelResponse) {
  const { roomId, playerId, targetPlayerId, teamId } = body;

  if (!roomId || !playerId || !targetPlayerId || !teamId) {
    return apiError(res, 400, "Room ID, host player ID, target player ID, and team ID are required");
  }

  const result = await assignPlayerToTeam(roomId, playerId, targetPlayerId, teamId);
  if (!result.ok || !result.room) {
    const status = result.error === "Room not found" ? 404
      : result.error === "Only the host can assign teams" ? 403
      : 400;
    return apiError(res, status, result.error ?? "Unable to assign team");
  }

  await triggerRoomEvent(roomId, "teams-updated", {
    teams: result.room.teams,
    players: result.room.players,
  });

  return res.status(200).json({
    success: true,
    teams: result.room.teams,
    players: result.room.players,
  });
}

// Host kicks another player from the room (lobby/ready phase only).
async function handleKickPlayer(body: ActionBody<"kick-player">, res: VercelResponse) {
  const { roomId, playerId, targetPlayerId } = body;

  if (!roomId || !playerId || !targetPlayerId) {
    return apiError(res, 400, "Room ID, host player ID, and target player ID are required");
  }

  const result = await kickPlayer(roomId, playerId, targetPlayerId);
  if (!result.ok || !result.room) {
    const status = result.error === "Room not found" ? 404
      : result.error === "Only the host can kick players" || result.error === "Host cannot be kicked" ? 403
      : 400;
    return apiError(res, status, result.error ?? "Unable to kick player");
  }

  await triggerRoomEvent(roomId, "player-kicked", {
    playerId: targetPlayerId,
    playerName: result.playerName ?? "Player",
  });

  return res.status(200).json({
    success: true,
    teams: result.room.teams,
    players: result.room.players,
  });
}

// Main handler - routes by action parameter
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    // Enable CORS
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      return res.status(200).end();
    }

    if (req.method !== "POST" && req.method !== "DELETE") {
      return apiError(res, 405, "Method not allowed");
    }

    const body = validate(MultiplayerActionSchema, req.body);
    const { action } = body;

    try {
      switch (action) {
        case "create-room":
          return await handleCreateRoom(body, res);
        case "join-room":
          return await handleJoinRoom(body, res);
        case "leave-room":
          return await handleLeaveRoom(body, res);
        case "quick-match":
          return await handleQuickMatch(body, req.method, res);
        case "set-ready":
          return await handleSetReady(body, res);
        case "start-ready-phase":
          return await handleStartReadyPhase(body, res);
        case "update-room-settings":
          return await handleUpdateRoomSettings(body, res);
        case "start-game":
          return await handleStartGame(body, res);
        case "update-progress":
          return await handleUpdateProgress(body, res);
        case "submit-multiplayer":
          return await handleSubmitMultiplayer(body, res);
        case "rematch":
          return await handleRematch(body, res);
        case "assign-team":
          return await handleAssignTeam(body, res);
        case "kick-player":
          return await handleKickPlayer(body, res);
        case "player-disconnect":
          return await handlePlayerDisconnect(body, res);
        default:
          return apiError(res, 400, `Unknown action: ${action}`);
      }
    } catch (error) {
      return handleApiError(res, "api/multiplayer", `Action "${action}" failed`, error);
    }
  } catch (error) {
    return handleApiError(res, "api/multiplayer", "Validation/routing failed", error);
  }
}
