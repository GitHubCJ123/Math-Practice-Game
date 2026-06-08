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
import type { Question, Operation, MultiplayerResult, TeamResult, AIDifficulty } from "../shared/types.js";

type ActionBody<TAction extends MultiplayerActionInput["action"]> = Extract<MultiplayerActionInput, { action: TAction }>;

// Conversion data for fraction/decimal/percent operations
interface Conversion {
  numerator: number;
  denominator: number;
  decimal: number;
  fractionString: string;
  decimalString: string;
}

const conversions: Conversion[] = [
  { numerator: 1, denominator: 2, decimal: 0.5, fractionString: '1/2', decimalString: '0.5' },
  { numerator: 1, denominator: 3, decimal: 0.333, fractionString: '1/3', decimalString: '0.333' },
  { numerator: 2, denominator: 3, decimal: 0.666, fractionString: '2/3', decimalString: '0.666' },
  { numerator: 1, denominator: 4, decimal: 0.25, fractionString: '1/4', decimalString: '0.25' },
  { numerator: 3, denominator: 4, decimal: 0.75, fractionString: '3/4', decimalString: '0.75' },
  { numerator: 1, denominator: 5, decimal: 0.2, fractionString: '1/5', decimalString: '0.2' },
  { numerator: 2, denominator: 5, decimal: 0.4, fractionString: '2/5', decimalString: '0.4' },
  { numerator: 3, denominator: 5, decimal: 0.6, fractionString: '3/5', decimalString: '0.6' },
  { numerator: 4, denominator: 5, decimal: 0.8, fractionString: '4/5', decimalString: '0.8' },
  { numerator: 1, denominator: 6, decimal: 0.166, fractionString: '1/6', decimalString: '0.166' },
  { numerator: 5, denominator: 6, decimal: 0.833, fractionString: '5/6', decimalString: '0.833' },
  { numerator: 1, denominator: 8, decimal: 0.125, fractionString: '1/8', decimalString: '0.125' },
  { numerator: 3, denominator: 8, decimal: 0.375, fractionString: '3/8', decimalString: '0.375' },
  { numerator: 5, denominator: 8, decimal: 0.625, fractionString: '5/8', decimalString: '0.625' },
  { numerator: 7, denominator: 8, decimal: 0.875, fractionString: '7/8', decimalString: '0.875' },
  { numerator: 1, denominator: 9, decimal: 0.111, fractionString: '1/9', decimalString: '0.111' },
  { numerator: 2, denominator: 9, decimal: 0.222, fractionString: '2/9', decimalString: '0.222' },
  { numerator: 4, denominator: 9, decimal: 0.444, fractionString: '4/9', decimalString: '0.444' },
  { numerator: 5, denominator: 9, decimal: 0.555, fractionString: '5/9', decimalString: '0.555' },
  { numerator: 7, denominator: 9, decimal: 0.777, fractionString: '7/9', decimalString: '0.777' },
  { numerator: 8, denominator: 9, decimal: 0.888, fractionString: '8/9', decimalString: '0.888' },
  { numerator: 1, denominator: 10, decimal: 0.1, fractionString: '1/10', decimalString: '0.1' },
  { numerator: 3, denominator: 10, decimal: 0.3, fractionString: '3/10', decimalString: '0.3' },
  { numerator: 7, denominator: 10, decimal: 0.7, fractionString: '7/10', decimalString: '0.7' },
  { numerator: 9, denominator: 10, decimal: 0.9, fractionString: '9/10', decimalString: '0.9' },
];

const formatPercentString = (decimal: number): string => {
  const percentValue = Number((decimal * 100).toFixed(1));
  if (Number.isInteger(percentValue)) {
    return `${percentValue.toFixed(0)}%`;
  }
  return `${percentValue.toFixed(1)}%`;
};

// Question generation logic
function generateQuestions(
  operation: Operation,
  selectedNumbers: number[],
  count: number
): Question[] {
  const questions: Question[] = [];
  const usedQuestions = new Set<string>();

  // For conversion operations, use the pre-defined conversions data
  if (
    operation === "fraction-to-decimal" ||
    operation === "decimal-to-fraction" ||
    operation === "fraction-to-percent" ||
    operation === "percent-to-fraction"
  ) {
    const shuffledConversions = [...conversions].sort(() => 0.5 - Math.random());
    const selectedConversions = shuffledConversions.slice(0, Math.min(count, conversions.length));

    for (const conv of selectedConversions) {
      let question: Question;
      switch (operation) {
        case "fraction-to-decimal":
          question = {
            operation,
            display: conv.fractionString,
            answer: conv.decimalString,
            num1: conv.numerator,
            num2: conv.denominator,
          };
          break;
        case "decimal-to-fraction":
          question = {
            operation,
            display: conv.decimalString,
            answer: conv.fractionString,
            num1: conv.decimal,
          };
          break;
        case "fraction-to-percent": {
          const percentString = formatPercentString(conv.decimal);
          question = {
            operation,
            display: conv.fractionString,
            answer: percentString,
            num1: conv.numerator,
            num2: conv.denominator,
          };
          break;
        }
        case "percent-to-fraction": {
          const percentString = formatPercentString(conv.decimal);
          question = {
            operation,
            display: percentString,
            answer: conv.fractionString,
            num1: percentString.endsWith('%') ? parseFloat(percentString.slice(0, -1)) : conv.decimal * 100,
          };
          break;
        }
      }
      questions.push(question);
    }
    return questions;
  }

  // For other operations, generate randomly
  let attempts = 0;
  const maxAttempts = count * 20;

  while (questions.length < count && attempts < maxAttempts) {
    attempts++;
    let question: Question | null = null;

    const num1 = selectedNumbers[Math.floor(Math.random() * selectedNumbers.length)];
    const num2 = selectedNumbers[Math.floor(Math.random() * selectedNumbers.length)];

    switch (operation) {
      case "multiplication":
        question = { num1, num2, operation, answer: num1 * num2 };
        break;
      case "division":
        const product = num1 * num2;
        question = { num1: product, num2, operation, answer: num1 };
        break;
      case "squares":
        question = { num1, operation, answer: num1 * num1 };
        break;
      case "square-roots":
        const squared = num1 * num1;
        question = { num1: squared, operation, answer: num1 };
        break;
      case "negative-numbers": {
        const ops = ["+", "-", "*"];
        const op = ops[Math.floor(Math.random() * ops.length)];
        const n1 = Math.random() < 0.5 ? -num1 : num1;
        const n2 = Math.random() < 0.5 ? -num2 : num2;
        let ans: number;
        switch (op) {
          case "+": ans = n1 + n2; break;
          case "-": ans = n1 - n2; break;
          case "*": ans = n1 * n2; break;
          default: ans = n1 + n2;
        }
        const n2Display = n2 < 0 ? `(${n2})` : `${n2}`;
        question = {
          num1: n1,
          num2: n2,
          operation,
          answer: ans,
          display: `${n1} ${op} ${n2Display}`,
        };
        break;
      }
    }

    if (question) {
      const key = `${question.num1}-${question.num2}-${question.operation}-${question.display || ""}`;
      if (!usedQuestions.has(key)) {
        usedQuestions.add(key);
        questions.push(question);
      }
    }
  }

  return questions;
}

async function triggerPusher(channel: string, event: string, data: unknown): Promise<void> {
  try {
    await getPusher().trigger(channel, event, data);
  } catch (error) {
    console.error(`[api/multiplayer] Pusher trigger failed (${event} on ${channel}):`, error);
    throw error;
  }
}

// Action handlers
async function handleCreateRoom(body: ActionBody<"create-room">, res: VercelResponse) {
  const { odId, odName } = body;

  if (!odId || !odName) {
    return apiError(res, 400, "Player ID and name are required");
  }

  const room = createRoomInStore(odId, odName.substring(0, 20), false);

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
  const { roomCode, odId, odName } = body;

  if (!roomCode || !odId || !odName) {
    return apiError(res, 400, "Room code, player ID, and name are required");
  }

  const result = joinRoomInStore(roomCode.toUpperCase(), odId, odName.substring(0, 20));

  if (!result.success) {
    return apiError(res, 400, result.error ?? "Unable to join room");
  }

  const room = result.room!;
  const newPlayer = room.players.find(p => p.id === odId);

  // Handle team assignment for the new player if in team mode
  if (room.settings.gameMode === "teams" && newPlayer) {
    if (room.teams.length === 0) {
      // Teams not initialized yet (e.g., 2nd player just joined). Initialize if we have enough players.
      if (room.players.length >= 2) {
        assignRandomTeams(room);
        await triggerPusher(`room-${room.id}`, "teams-updated", {
          type: "teams-updated",
          teams: room.teams,
          players: room.players,
        });
      }
    } else {
      // Teams exist, assign to the smaller team
      const teamACount = room.teams[0].playerIds.length;
      const teamBCount = room.teams[1].playerIds.length;
      const targetTeam = teamACount <= teamBCount ? room.teams[0] : room.teams[1];
      
      targetTeam.playerIds.push(odId);
      newPlayer.teamId = targetTeam.id;
      
      // Notify about team update
      await triggerPusher(`room-${room.id}`, "teams-updated", {
        type: "teams-updated",
        teams: room.teams,
        players: room.players,
      });
    }
  }

  await triggerPusher(`room-${room.id}`, "player-joined", {
    type: "player-joined",
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
  const { roomId, odId, odName } = body;

  if (!roomId || !odId) {
    return apiError(res, 400, "roomId and odId are required");
  }

  const room = getRoom(roomId);
  if (!room) {
    return apiError(res, 404, "Room not found");
  }

  const leavingPlayer = room.players.find(p => p.id === odId);
  if (!leavingPlayer) {
    return apiError(res, 404, "Player not in room");
  }

  room.players = room.players.filter(p => p.id !== odId);

  await triggerPusher(`room-${roomId}`, "player-left", {
    playerId: odId,
    playerName: odName || leavingPlayer.name,
  });


  if (room.players.length === 0) {
    deleteRoom(roomId);
  }

  return res.status(200).json({ success: true });
}

async function handleQuickMatch(body: ActionBody<"quick-match">, method: string, res: VercelResponse) {
  if (method === "DELETE") {
    const { odId } = body;
    if (odId) {
      removeFromQuickMatchQueue(odId);
    }
    return res.status(200).json({ success: true });
  }

  const { odId, odName, operation } = body;

  if (!odId || !odName || !operation) {
    return apiError(res, 400, "Player ID, name, and operation are required");
  }

  const opponent = findQuickMatchOpponent(odId, operation);

  if (opponent) {
    const room = createRoomInStore(opponent.odId, opponent.odName, true);
    
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

    joinRoomInStore(room.code, odId, odName.substring(0, 20));

    await triggerPusher(`quickmatch-${opponent.odId}`, "match-found", {
      roomId: room.id,
      roomCode: room.code,
      opponent: { id: odId, name: odName },
      operation: operation,
    });

    return res.status(200).json({
      success: true,
      matched: true,
      roomId: room.id,
      roomCode: room.code,
      opponent: { id: opponent.odId, name: opponent.odName },
    });
  } else {
    addToQuickMatchQueue(odId, odName, operation);

    return res.status(200).json({
      success: true,
      matched: false,
      message: "Added to queue, waiting for opponent",
    });
  }
}

async function handleSetReady(body: ActionBody<"set-ready">, res: VercelResponse) {
  const { roomId, odId, isReady } = body;

  if (!roomId || !odId || typeof isReady !== "boolean") {
    return apiError(res, 400, "Room ID, player ID, and isReady status are required");
  }

  const room = getRoom(roomId);
  if (!room) {
    return apiError(res, 404, "Room not found");
  }

  const playerIndex = room.players.findIndex((p) => p.id === odId);
  if (playerIndex === -1) {
    return apiError(res, 404, "Player not in room");
  }

  room.players[playerIndex].isReady = isReady;
  updateRoom(room);


  await triggerPusher(`room-${roomId}`, "player-ready", {
    odId,
    isReady,
  });

  const minPlayers = room.isQuickMatch ? 2 : 2; // Min 2 players to start
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
      odId: p.id,
      odName: p.name,
      answers: [],
      currentQuestion: 0,
      finished: false,
      finishTime: null,
      score: 0,
    }));
    updateRoom(room);

    await triggerPusher(`room-${roomId}`, "game-starting", {
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
  const { roomId, odId, settings } = body;

  if (!roomId || !odId) {
    return apiError(res, 400, "roomId and odId are required");
  }

  const room = getRoom(roomId);
  if (!room) {
    return apiError(res, 404, "Room not found");
  }

  const player = room.players.find(p => p.id === odId);
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

  await triggerPusher(`room-${roomId}`, "ready-phase", {
    settings: room.settings,
  });


  return res.status(200).json({ success: true });
}

async function handleUpdateRoomSettings(body: ActionBody<"update-room-settings">, res: VercelResponse) {
  const { roomId, odId, settings } = body;

  if (!roomId || !odId || !settings) {
    return apiError(res, 400, "Room ID, player ID, and settings are required");
  }

  const room = getRoom(roomId);
  if (!room) {
    return apiError(res, 404, "Room not found");
  }

  if (room.hostId !== odId) {
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
      await triggerPusher(`room-${roomId}`, "settings-updated", {
        type: "settings-updated",
        settings: updatedRoom.settings,
      });
      await triggerPusher(`room-${roomId}`, "teams-updated", {
        type: "teams-updated",
        teams: updatedRoom.teams,
        players: updatedRoom.players,
      });
    } else if (settings.gameMode === "ffa") {
      // If switching to FFA, clear teams
      updatedRoom.teams = [];
      for (const player of updatedRoom.players) {
        player.teamId = undefined;
      }
      await triggerPusher(`room-${roomId}`, "settings-updated", {
        type: "settings-updated",
        settings: updatedRoom.settings,
      });
      await triggerPusher(`room-${roomId}`, "teams-updated", {
        type: "teams-updated",
        teams: [],
        players: updatedRoom.players,
      });
    } else {
      await triggerPusher(`room-${roomId}`, "settings-updated", {
        type: "settings-updated",
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
  const { roomId, odId } = body;

  if (!roomId || !odId) {
    return apiError(res, 400, "Room ID and player ID are required");
  }

  const room = getRoom(roomId);
  if (!room) {
    return apiError(res, 404, "Room not found");
  }

  if (!room.isQuickMatch && room.hostId !== odId) {
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


  await triggerPusher(`room-${roomId}`, "game-starting", {
    type: "game-starting",
    countdown: 3,
    questions,
    teams: room.teams,
    players: room.players,
  });

  setTimeout(async () => {
    try {
      const updatedRoom = setGamePlaying(roomId);
      if (updatedRoom) {
        await triggerPusher(`room-${roomId}`, "game-started", {
          type: "game-started",
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
  const { roomId, odId, currentQuestion } = body;

  if (!roomId || !odId || currentQuestion === undefined) {
    return apiError(res, 400, "Room ID, player ID, and current question are required");
  }

  const room = getRoom(roomId);
  if (!room) {
    return apiError(res, 404, "Room not found");
  }

  if (room.gameState !== "playing") {
    return apiError(res, 400, "Game not in progress");
  }

  updatePlayerProgress(roomId, odId, currentQuestion);

  await triggerPusher(`room-${roomId}`, "opponent-progress", {
    type: "opponent-progress",
    odId,
    currentQuestion,
  });

  return res.status(200).json({ success: true });
}

async function handleSubmitMultiplayer(body: ActionBody<"submit-multiplayer">, res: VercelResponse) {
  const { roomId, odId, answers, score } = body;

  if (!roomId || !odId || !answers || score === undefined) {
    return apiError(res, 400, "Room ID, player ID, answers, and score are required");
  }

  const room = getRoom(roomId);
  if (!room) {
    return apiError(res, 404, "Room not found");
  }

  const { room: updatedRoom, allFinished } = submitPlayerAnswers(roomId, odId, answers, score);

  if (!updatedRoom) {
    return apiError(res, 500, "Failed to submit answers");
  }

  const playerState = updatedRoom.playerStates.find(p => p.odId === odId);

  await triggerPusher(`room-${roomId}`, "opponent-finished", {
    type: "opponent-finished",
    odId,
    finishTime: playerState?.finishTime,
  });

  if (allFinished) {
    // Calculate rankings for FFA mode
    const rankedStates = [...updatedRoom.playerStates].sort((a, b) => {
      // Sort by score descending, then by time ascending
      if (b.score !== a.score) return b.score - a.score;
      return (a.finishTime || Infinity) - (b.finishTime || Infinity);
    });

    // Get player's teamId - check teams.playerIds array as fallback for player.teamId
    const getPlayerTeamId = (playerId: string): string | undefined => {
      // First check player.teamId
      const player = updatedRoom.players.find(p => p.id === playerId);
      if (player?.teamId) return player.teamId;
      // Fallback: check teams.playerIds arrays
      for (const team of updatedRoom.teams) {
        if (team.playerIds.includes(playerId)) {
          return team.id;
        }
      }
      return undefined;
    };

    const results: MultiplayerResult[] = rankedStates.map((ps, index) => ({
      odId: ps.odId,
      odName: ps.odName,
      score: ps.score,
      totalQuestions: updatedRoom.questions.length,
      timeTaken: ps.finishTime || 0,
      answers: ps.answers,
      questions: updatedRoom.questions,
      teamId: getPlayerTeamId(ps.odId),
      rank: index + 1,
    }));

    // Calculate team results if in team mode
    let teamResults: TeamResult[] | undefined;
    
    // Safety check: ensure teams exist if in team mode
    if (updatedRoom.settings.gameMode === "teams" && updatedRoom.teams.length === 0) {
      assignRandomTeams(updatedRoom);
    }

    if (updatedRoom.settings.gameMode === "teams" && updatedRoom.teams.length > 0) {
      
      teamResults = updatedRoom.teams.map(team => {
        // Use team.playerIds directly instead of relying on player.teamId
        const teamPlayerStates = updatedRoom.playerStates.filter(ps => 
          team.playerIds.includes(ps.odId)
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
        } else {
          // Tiebreaker: lower average time wins
          if (teamA.averageTime < teamB.averageTime) {
            teamA.isWinner = true;
          } else if (teamB.averageTime < teamA.averageTime) {
            teamB.isWinner = true;
          }
          // Else it's a draw, no winner
        }
      }
    }

    await triggerPusher(`room-${roomId}`, "game-ended", {
      type: "game-ended",
      results,
      teamResults,
    });
  }

  return res.status(200).json({
    success: true,
    allFinished,
    finishTime: playerState?.finishTime,
  });
}

async function handleRematch(body: ActionBody<"rematch">, res: VercelResponse) {
  const { roomId, odId, odName, rematchAction, keepTeams } = body;

  if (!roomId || !odId || !odName || !rematchAction) {
    return apiError(res, 400, "Room ID, player ID, name, and rematchAction are required");
  }

  const room = getRoom(roomId);
  if (!room) {
    return apiError(res, 404, "Room not found");
  }

  const player = room.players.find(p => p.id === odId);

  if (!player) {
    return apiError(res, 403, "Player not in room");
  }

  const connectedPlayers = room.players.filter(p => p.connected);
  const totalPlayersNeeded = connectedPlayers.length;

  if (rematchAction === "request") {
    // For 2 players, just send request normally
    // For 3+ players, we need everyone to accept
    room.rematchState = {
      requesterId: odId,
      requesterName: odName,
      keepTeams: keepTeams || false,
      acceptedPlayerIds: [odId], // Requester is automatically "accepted"
    };
    
    await triggerPusher(`room-${roomId}`, "rematch-requested", {
      type: "rematch-requested",
      fromPlayerId: odId,
      fromPlayerName: odName,
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
    if (!room.rematchState.acceptedPlayerIds.includes(odId)) {
      room.rematchState.acceptedPlayerIds.push(odId);
    }

    const acceptedCount = room.rematchState.acceptedPlayerIds.length;
    const allAccepted = acceptedCount >= totalPlayersNeeded;

    if (!allAccepted) {
      // Not everyone has accepted yet - notify others
      await triggerPusher(`room-${roomId}`, "rematch-player-accepted", {
        type: "rematch-player-accepted",
        odId,
        odName,
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

    await triggerPusher(`room-${roomId}`, "rematch-accepted", {
      type: "rematch-accepted",
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

    await triggerPusher(`room-${roomId}`, "rematch-declined", {
      type: "rematch-declined",
      declinedBy: odName,
    });

    return res.status(200).json({ success: true, message: "Rematch declined" });
  }

  return apiError(res, 400, "Invalid rematchAction");
}

async function handlePlayerDisconnect(body: ActionBody<"player-disconnect">, res: VercelResponse) {
  const { roomId, odId } = body;

  if (!roomId || !odId) {
    return apiError(res, 400, "Room ID and player ID are required");
  }

  const room = playerDisconnected(roomId, odId);

  if (room) {
    await triggerPusher(`room-${roomId}`, "player-disconnected", {
      type: "player-disconnected",
      odId,
    });

    if (room.gameState === "finished") {
      const results = room.playerStates.map(ps => ({
        odId: ps.odId,
        odName: ps.odName,
        score: ps.score,
        totalQuestions: room.questions.length,
        timeTaken: ps.finishTime || 0,
        answers: ps.answers,
        questions: room.questions,
      }));

      await triggerPusher(`room-${roomId}`, "game-ended", {
        type: "game-ended",
        results,
      });
    }
  }

  return res.status(200).json({ success: true });
}

// Handle host assigning a player to a team
async function handleAssignTeam(body: ActionBody<"assign-team">, res: VercelResponse) {
  const { roomId, odId, targetPlayerId, teamId } = body;

  if (!roomId || !odId || !targetPlayerId || !teamId) {
    return apiError(res, 400, "Room ID, host player ID, target player ID, and team ID are required");
  }

  const room = getRoom(roomId);
  if (!room) {
    return apiError(res, 404, "Room not found");
  }

  // Only host can assign teams
  if (room.hostId !== odId) {
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
      await triggerPusher(`room-${roomId}`, "teams-updated", {
      type: "teams-updated",
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
  const { odId, odName, aiDifficulty, settings } = body;

  if (!odId || !odName || !aiDifficulty || !settings) {
    return apiError(res, 400, "Player ID, name, AI difficulty, and settings are required");
  }

  // Validate AI difficulty
  const validDifficulties: AIDifficulty[] = ['easy', 'medium', 'hard', 'expert'];
  if (!validDifficulties.includes(aiDifficulty)) {
    return apiError(res, 400, "Invalid AI difficulty");
  }

  // Create the room
  const room = createRoomInStore(odId, odName.substring(0, 20), false);

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
    odId: p.id,
    odName: p.name,
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
