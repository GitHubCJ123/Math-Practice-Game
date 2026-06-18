import type { VercelRequest, VercelResponse } from "@vercel/node";
import { apiError, handleApiError } from "../lib/api/errors.js";
import { MultiplayerActionSchema, validate } from "../lib/api/validation.js";
import type { MultiplayerActionInput } from "../lib/api/validation.js";
import { getPusher } from "../lib/api/pusher.js";
import {
  createRoom as createRoomInStore,
  joinRoom as joinRoomInStore,
  getRoom,
  updateRoom,
  deleteRoom,
  updateRoomSettings as updateRoomSettingsInStore,
  startGame as startGameInStore,
  setGamePlaying,
  submitPlayerAnswers,
  updatePlayerProgress,
  playerDisconnected,
  addToQuickMatchQueue,
  removeFromQuickMatchQueue,
  findQuickMatchOpponent,
  setPlayerReady,
  assignPlayerToTeam as assignPlayerToTeamInStore,
  assignRandomTeams,
} from "../lib/api/room-store.js";
import { createAIPlayer } from "../lib/api/ai-player.js";
import { generateQuestions } from "../shared/questions.js";
import type { Operation, MultiplayerResult, TeamResult, AIDifficulty, RoomEventName, RoomEventPayloads, Room } from "../shared/types.js";

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

/**
 * Build the final ranked results (and team results in team mode) for a finished
 * room. Shared by the submit and disconnect end-of-game paths so both emit an
 * identical, fully-ranked payload (FFA rank + teamId + team winner).
 */
function buildGameResults(room: Room): { results: MultiplayerResult[]; teamResults?: TeamResult[] } {
  const rankedStates = [...room.playerStates].sort((a, b) => {
    // Sort by score descending, then by time ascending
    if (b.score !== a.score) return b.score - a.score;
    return (a.finishTime ?? Infinity) - (b.finishTime ?? Infinity);
  });

  const getPlayerTeamId = (pid: string): string | undefined => {
    const player = room.players.find(p => p.id === pid);
    if (player?.teamId) return player.teamId;
    for (const team of room.teams) {
      if (team.playerIds.includes(pid)) return team.id;
    }
    return undefined;
  };

  const results: MultiplayerResult[] = rankedStates.map((ps, index) => ({
    playerId: ps.playerId,
    playerName: ps.playerName,
    score: ps.score,
    totalQuestions: room.questions.length,
    timeTaken: ps.finishTime || 0,
    answers: ps.answers,
    questions: room.questions,
    teamId: getPlayerTeamId(ps.playerId),
    rank: index + 1,
  }));

  let teamResults: TeamResult[] | undefined;

  // Safety check: ensure teams exist if in team mode
  if (room.settings.gameMode === "teams" && room.teams.length === 0) {
    assignRandomTeams(room);
  }

  if (room.settings.gameMode === "teams" && room.teams.length > 0) {
    teamResults = room.teams.map(team => {
      // Use team.playerIds directly instead of relying on player.teamId
      const teamPlayerStates = room.playerStates.filter(ps =>
        team.playerIds.includes(ps.playerId)
      );

      const totalScore = teamPlayerStates.reduce((sum, ps) => sum + ps.score, 0);
      const totalTime = teamPlayerStates.reduce((sum, ps) => sum + (ps.finishTime || 0), 0);
      const playerCount = teamPlayerStates.length || 1;

      return {
        teamId: team.id,
        teamName: team.name,
        playerIds: team.playerIds,
        averageScore: totalScore / playerCount,
        averageTime: totalTime / playerCount,
        totalScore,
        totalTime,
        isWinner: false, // Will be set below
      };
    });

    // Determine winner (higher average score wins, tiebreaker: lower average time)
    if (teamResults.length === 2) {
      const [teamA, teamB] = teamResults;
      if (teamA.averageScore > teamB.averageScore) {
        teamA.isWinner = true;
      } else if (teamB.averageScore > teamA.averageScore) {
        teamB.isWinner = true;
      } else if (teamA.averageTime < teamB.averageTime) {
        teamA.isWinner = true;
      } else if (teamB.averageTime < teamA.averageTime) {
        teamB.isWinner = true;
      }
      // Else it's a draw, no winner
    }
  }

  return { results, teamResults };
}

// Action handlers
async function handleCreateRoom(body: ActionBody<"create-room">, res: VercelResponse) {
  const { playerId, playerName } = body;

  if (!playerId || !playerName) {
    return apiError(res, 400, "Player ID and name are required");
  }

  const room = createRoomInStore(playerId, playerName.substring(0, 20), false);

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

  const result = joinRoomInStore(roomCode.toUpperCase(), playerId, playerName.substring(0, 20));

  if (!result.success) {
    return apiError(res, 400, result.error ?? "Unable to join room");
  }

  const room = result.room!;
  const newPlayer = room.players.find(p => p.id === playerId);
  if (!newPlayer) {
    return apiError(res, 500, "Player not found after joining room");
  }

  // Handle team assignment for the new player if in team mode
  if (room.settings.gameMode === "teams") {
    if (room.teams.length === 0) {
      // Teams not initialized yet (e.g., 2nd player just joined). Initialize if we have enough players.
      if (room.players.length >= 2) {
        assignRandomTeams(room);
        await triggerRoomEvent(room.id, "teams-updated", {
          teams: room.teams,
          players: room.players,
        });
      }
    } else {
      // Teams exist, assign to the smaller team
      const teamACount = room.teams[0].playerIds.length;
      const teamBCount = room.teams[1].playerIds.length;
      const targetTeam = teamACount <= teamBCount ? room.teams[0] : room.teams[1];
      
      targetTeam.playerIds.push(playerId);
      newPlayer.teamId = targetTeam.id;
      
      // Notify about team update
      await triggerRoomEvent(room.id, "teams-updated", {
        teams: room.teams,
        players: room.players,
      });
    }
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

  const room = getRoom(roomId);
  if (!room) {
    return apiError(res, 404, "Room not found");
  }

  const leavingPlayer = room.players.find(p => p.id === playerId);
  if (!leavingPlayer) {
    return apiError(res, 404, "Player not in room");
  }

  room.players = room.players.filter(p => p.id !== playerId);

  await triggerRoomEvent(roomId, "player-left", {
    playerId,
    playerName: playerName || leavingPlayer.name,
  });


  if (room.players.length === 0) {
    deleteRoom(roomId);
  }

  return res.status(200).json({ success: true });
}

async function handleQuickMatch(body: ActionBody<"quick-match">, method: string, res: VercelResponse) {
  if (method === "DELETE") {
    const { playerId } = body;
    if (playerId) {
      removeFromQuickMatchQueue(playerId);
    }
    return res.status(200).json({ success: true });
  }

  const { playerId, playerName, operation } = body;

  if (!playerId || !playerName || !operation) {
    return apiError(res, 400, "Player ID, name, and operation are required");
  }

  const opponent = findQuickMatchOpponent(playerId, operation);

  if (opponent) {
    const room = createRoomInStore(opponent.playerId, opponent.playerName, true);
    
    const allNumbers = operation === "squares" || operation === "square-roots"
      ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]
      : operation === "negative-numbers"
      ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
      : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

    room.settings = {
      operation,
      selectedNumbers: allNumbers,
      questionCount: 10,
      timeLimit: 0,
      maxPlayers: 2,
      gameMode: "ffa",
    };

    joinRoomInStore(room.code, playerId, playerName.substring(0, 20));

    await triggerPusher(`quickmatch-${opponent.playerId}`, "match-found", {
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
      opponent: { id: opponent.playerId, name: opponent.playerName },
    });
  } else {
    addToQuickMatchQueue(playerId, playerName, operation);

    return res.status(200).json({
      success: true,
      matched: false,
      message: "Added to queue, waiting for opponent",
    });
  }
}

async function handleSetReady(body: ActionBody<"set-ready">, res: VercelResponse) {
  const { roomId, playerId, isReady } = body;

  if (!roomId || !playerId || typeof isReady !== "boolean") {
    return apiError(res, 400, "Room ID, player ID, and isReady status are required");
  }

  const room = getRoom(roomId);
  if (!room) {
    return apiError(res, 404, "Room not found");
  }

  const playerIndex = room.players.findIndex((p) => p.id === playerId);
  if (playerIndex === -1) {
    return apiError(res, 404, "Player not in room");
  }

  room.players[playerIndex].isReady = isReady;
  updateRoom(room);


  await triggerRoomEvent(roomId, "player-ready", {
    playerId,
    isReady,
  });

  const minPlayers = 2; // Min 2 players to start
  const allReady = room.players.length >= minPlayers && room.players.every((p) => p.isReady);

  if (allReady) {
    const questions = generateQuestions(
      room.settings.operation,
      room.settings.selectedNumbers,
      room.settings.questionCount
    );

    // Assign teams if in team mode and not already assigned
    if (room.settings.gameMode === "teams" && room.teams.length === 0) {
      assignRandomTeams(room);
    }

    room.gameState = "playing";
    room.questions = questions;
    room.gameStartTime = Date.now();
    room.playerStates = room.players.map(p => ({
      playerId: p.id,
      playerName: p.name,
      answers: [],
      currentQuestion: 0,
      finished: false,
      finishTime: null,
      score: 0,
    }));
    updateRoom(room);

    await triggerRoomEvent(roomId, "game-starting", {
      questions,
      teams: room.teams,
      players: room.players,
    });
  }

  return res.status(200).json({
    success: true,
    allReady,
  });
}

async function handleStartReadyPhase(body: ActionBody<"start-ready-phase">, res: VercelResponse) {
  const { roomId, playerId, settings } = body;

  if (!roomId || !playerId) {
    return apiError(res, 400, "roomId and playerId are required");
  }

  const room = getRoom(roomId);
  if (!room) {
    return apiError(res, 404, "Room not found");
  }

  const player = room.players.find(p => p.id === playerId);
  if (!player?.isHost) {
    return apiError(res, 403, "Only host can start ready phase");
  }

  if (room.players.length < 2) {
    return apiError(res, 400, "Need at least 2 players to start");
  }

  // For team mode, validate we have enough players
  if (settings?.gameMode === "teams" && room.players.length < 2) {
    return apiError(res, 400, "Need at least 2 players for team mode");
  }

  if (settings) {
    updateRoomSettingsInStore(roomId, settings);
  }

  for (const p of room.players) {
    setPlayerReady(roomId, p.id, false);
  }

  await triggerRoomEvent(roomId, "ready-phase", {
    settings: room.settings,
  });


  return res.status(200).json({ success: true });
}

async function handleUpdateRoomSettings(body: ActionBody<"update-room-settings">, res: VercelResponse) {
  const { roomId, playerId, settings } = body;

  if (!roomId || !playerId || !settings) {
    return apiError(res, 400, "Room ID, player ID, and settings are required");
  }

  const room = getRoom(roomId);
  if (!room) {
    return apiError(res, 404, "Room not found");
  }

  if (room.hostId !== playerId) {
    return apiError(res, 403, "Only the host can update settings");
  }

  if (room.gameState !== "waiting") {
    return apiError(res, 400, "Cannot update settings while game is in progress");
  }

  const updatedRoom = updateRoomSettingsInStore(roomId, settings);

  if (updatedRoom) {
    // If switching to team mode, assign teams immediately so UI can show them
    if (settings.gameMode === "teams" && updatedRoom.players.length >= 2) {
      assignRandomTeams(updatedRoom);
      // Send both settings and teams update
      await triggerRoomEvent(roomId, "settings-updated", {
        settings: updatedRoom.settings,
      });
      await triggerRoomEvent(roomId, "teams-updated", {
        teams: updatedRoom.teams,
        players: updatedRoom.players,
      });
    } else if (settings.gameMode === "ffa") {
      // If switching to FFA, clear teams
      updatedRoom.teams = [];
      for (const player of updatedRoom.players) {
        player.teamId = undefined;
      }
      await triggerRoomEvent(roomId, "settings-updated", {
        settings: updatedRoom.settings,
      });
      await triggerRoomEvent(roomId, "teams-updated", {
        teams: [],
        players: updatedRoom.players,
      });
    } else {
      await triggerRoomEvent(roomId, "settings-updated", {
        settings: updatedRoom.settings,
      });
    }
  }

  return res.status(200).json({
    success: true,
    settings: updatedRoom?.settings,
    teams: updatedRoom?.teams,
    players: updatedRoom?.players,
  });
}

async function handleStartGame(body: ActionBody<"start-game">, res: VercelResponse) {
  const { roomId, playerId } = body;

  if (!roomId || !playerId) {
    return apiError(res, 400, "Room ID and player ID are required");
  }

  const room = getRoom(roomId);
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

  startGameInStore(roomId, questions);


  await triggerRoomEvent(roomId, "game-starting", {
    countdown: 3,
    questions,
    teams: room.teams,
    players: room.players,
  });

  setTimeout(async () => {
    try {
      const updatedRoom = setGamePlaying(roomId);
      if (updatedRoom) {
        await triggerRoomEvent(roomId, "game-started", {
          startTime: updatedRoom.gameStartTime,
        });
      }
    } catch (error) {
      console.error(`[api/multiplayer] Delayed game-started transition failed for room ${roomId}:`, error);
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

  const room = getRoom(roomId);
  if (!room) {
    return apiError(res, 404, "Room not found");
  }

  if (room.gameState !== "playing") {
    return apiError(res, 400, "Game not in progress");
  }

  updatePlayerProgress(roomId, playerId, currentQuestion);

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

  const room = getRoom(roomId);
  if (!room) {
    return apiError(res, 404, "Room not found");
  }

  const { room: updatedRoom, allFinished } = submitPlayerAnswers(roomId, playerId, answers, score);

  if (!updatedRoom) {
    return apiError(res, 500, "Failed to submit answers");
  }

  const playerState = updatedRoom.playerStates.find(p => p.playerId === playerId);

  await triggerRoomEvent(roomId, "opponent-finished", {
    playerId,
    finishTime: playerState?.finishTime ?? null,
  });

  let results: MultiplayerResult[] | undefined;
  let teamResults: TeamResult[] | undefined;

  if (allFinished) {
    ({ results, teamResults } = buildGameResults(updatedRoom));

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
    allFinished,
    finishTime: playerState?.finishTime ?? undefined,
    results,
    teamResults,
  });
}

async function handleRematch(body: ActionBody<"rematch">, res: VercelResponse) {
  const { roomId, playerId, playerName, rematchAction, keepTeams } = body;

  if (!roomId || !playerId || !playerName || !rematchAction) {
    return apiError(res, 400, "Room ID, player ID, name, and rematchAction are required");
  }

  const room = getRoom(roomId);
  if (!room) {
    return apiError(res, 404, "Room not found");
  }

  const player = room.players.find(p => p.id === playerId);

  if (!player) {
    return apiError(res, 403, "Player not in room");
  }

  const connectedPlayers = room.players.filter(p => p.connected);
  const totalPlayersNeeded = connectedPlayers.length;

  if (rematchAction === "request") {
    // For 2 players, just send request normally
    // For 3+ players, we need everyone to accept
    room.rematchState = {
      requesterId: playerId,
      requesterName: playerName,
      keepTeams: keepTeams || false,
      acceptedPlayerIds: [playerId], // Requester is automatically "accepted"
    };
    
    await triggerRoomEvent(roomId, "rematch-requested", {
      fromPlayerId: playerId,
      fromPlayerName: playerName,
      keepTeams: keepTeams || false,
      totalNeeded: totalPlayersNeeded,
    });

    // For 2 players, we still need the other player to accept
    return res.status(200).json({ success: true, message: "Rematch request sent", totalNeeded: totalPlayersNeeded });
  }

  if (rematchAction === "accept") {
    // Make sure there's an active rematch request
    if (!room.rematchState) {
      return apiError(res, 400, "No pending rematch request");
    }

    // Add this player to accepted list if not already
    if (!room.rematchState.acceptedPlayerIds.includes(playerId)) {
      room.rematchState.acceptedPlayerIds.push(playerId);
    }

    const acceptedCount = room.rematchState.acceptedPlayerIds.length;
    const allAccepted = acceptedCount >= totalPlayersNeeded;

    if (!allAccepted) {
      // Not everyone has accepted yet - notify others
      await triggerRoomEvent(roomId, "rematch-player-accepted", {
        playerId,
        playerName,
        acceptedCount,
        totalNeeded: totalPlayersNeeded,
      });

      return res.status(200).json({ 
        success: true, 
        message: "Acceptance recorded, waiting for other players",
        acceptedCount,
        totalNeeded: totalPlayersNeeded,
      });
    }

    // All players accepted! Create the new room
    const originalHost = room.players.find(p => p.isHost);
    const newRoom = createRoomInStore(
      originalHost?.id || connectedPlayers[0].id,
      originalHost?.name || connectedPlayers[0].name,
      room.isQuickMatch
    );
    newRoom.settings = { ...room.settings };

    // Add all connected players to the new room
    for (const p of connectedPlayers) {
      if (p.id !== newRoom.hostId) {
        joinRoomInStore(newRoom.code, p.id, p.name);
      }
    }

    // If keeping teams and in team mode, restore team assignments
    const shouldKeepTeams = room.rematchState.keepTeams;
    if (room.settings.gameMode === "teams") {
      if (shouldKeepTeams && room.teams.length > 0) {
        // Keep the same teams
        newRoom.teams = room.teams.map(t => ({ ...t }));
        for (const newPlayer of newRoom.players) {
          const oldPlayer = room.players.find(p => p.id === newPlayer.id);
          if (oldPlayer?.teamId) {
            newPlayer.teamId = oldPlayer.teamId;
          }
        }
      } else {
        // Shuffle teams - assign new random teams
        assignRandomTeams(newRoom);
      }
    }

    // Clear rematch state
    room.rematchState = undefined;

    await triggerRoomEvent(roomId, "rematch-accepted", {
      newRoomCode: newRoom.code,
      newRoomId: newRoom.id,
      isQuickMatch: room.isQuickMatch,
      settings: newRoom.settings,
      players: newRoom.players,
      teams: newRoom.teams,
      keepTeams: shouldKeepTeams,
    });

    return res.status(200).json({
      success: true,
      newRoomId: newRoom.id,
      newRoomCode: newRoom.code,
      isQuickMatch: room.isQuickMatch,
      settings: newRoom.settings,
      players: newRoom.players,
      teams: newRoom.teams,
    });
  }

  if (rematchAction === "decline") {
    // Clear rematch state
    room.rematchState = undefined;

    await triggerRoomEvent(roomId, "rematch-declined", {
      declinedBy: playerName,
    });

    return res.status(200).json({ success: true, message: "Rematch declined" });
  }

  return apiError(res, 400, "Invalid rematchAction");
}

async function handlePlayerDisconnect(body: ActionBody<"player-disconnect">, res: VercelResponse) {
  const { roomId, playerId } = body;

  if (!roomId || !playerId) {
    return apiError(res, 400, "Room ID and player ID are required");
  }

  const room = playerDisconnected(roomId, playerId);

  if (room) {
    await triggerRoomEvent(roomId, "player-disconnected", {
      playerId,
    });

    if (room.gameState === "finished") {
      const { results, teamResults } = buildGameResults(room);

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

  const room = getRoom(roomId);
  if (!room) {
    return apiError(res, 404, "Room not found");
  }

  // Only host can assign teams
  if (room.hostId !== playerId) {
    return apiError(res, 403, "Only the host can assign teams");
  }

  if (room.settings.gameMode !== "teams") {
    return apiError(res, 400, "Room is not in team mode");
  }

  // Initialize teams if not already done
  if (room.teams.length === 0) {
    room.teams = [
      { id: 'team-a', name: 'Team A', playerIds: [] },
      { id: 'team-b', name: 'Team B', playerIds: [] },
    ];
    // Assign all current players to teams initially
    room.players.forEach((p, index) => {
      const assignedTeam = index % 2 === 0 ? 'team-a' : 'team-b';
      p.teamId = assignedTeam;
      room.teams.find(t => t.id === assignedTeam)?.playerIds.push(p.id);
    });
  }

  const updatedRoom = assignPlayerToTeamInStore(roomId, targetPlayerId, teamId);

  if (updatedRoom) {
    await triggerRoomEvent(roomId, "teams-updated", {
      teams: updatedRoom.teams,
      players: updatedRoom.players,
    });
  }

  return res.status(200).json({
    success: true,
    teams: updatedRoom?.teams,
    players: updatedRoom?.players,
  });
}

// Handle creating an AI game - creates room with AI player and starts immediately
async function handleCreateAIGame(body: ActionBody<"create-ai-game">, res: VercelResponse) {
  const { playerId, playerName, aiDifficulty, settings } = body;

  if (!playerId || !playerName || !aiDifficulty || !settings) {
    return apiError(res, 400, "Player ID, name, AI difficulty, and settings are required");
  }

  // Validate AI difficulty
  const validDifficulties: AIDifficulty[] = ['easy', 'medium', 'hard', 'expert'];
  if (!validDifficulties.includes(aiDifficulty)) {
    return apiError(res, 400, "Invalid AI difficulty");
  }

  // Create the room
  const room = createRoomInStore(playerId, playerName.substring(0, 20), false);

  // Configure room settings
  room.settings = {
    operation: settings.operation as Operation,
    selectedNumbers: settings.selectedNumbers || [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    questionCount: settings.questionCount || 10,
    timeLimit: settings.timeLimit || 0,
    maxPlayers: 2,
    gameMode: "ffa",
  };

  // Create and add AI player
  const aiPlayer = createAIPlayer(aiDifficulty);
  room.players.push(aiPlayer);

  // Generate questions
  const questions = generateQuestions(
    room.settings.operation,
    room.settings.selectedNumbers,
    room.settings.questionCount
  );

  // Start the game immediately
  room.gameState = "playing";
  room.questions = questions;
  room.gameStartTime = Date.now();
  room.playerStates = room.players.map(p => ({
    playerId: p.id,
    playerName: p.name,
    answers: [],
    currentQuestion: 0,
    finished: false,
    finishTime: null,
    score: 0,
  }));

  updateRoom(room);


  return res.status(200).json({
    success: true,
    roomId: room.id,
    questions: questions,
    players: room.players,
    aiPlayer: aiPlayer,
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
        case "create-ai-game":
          return await handleCreateAIGame(body, res);
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
