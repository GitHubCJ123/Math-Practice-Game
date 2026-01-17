import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPusher } from "../lib/api/pusher";
import {
  createRoom as createRoomInStore,
  joinRoom as joinRoomInStore,
  getRoom,
  getRoomByCode,
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
} from "../lib/api/room-store";
import { Question, Operation, MultiplayerResult } from "../types";

// Question generation logic
function generateQuestions(
  operation: Operation,
  selectedNumbers: number[],
  count: number
): Question[] {
  const questions: Question[] = [];
  const usedQuestions = new Set<string>();
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
      case "fraction-to-decimal": {
        const fractionNum = num1;
        const fractionDen = num2 === 0 ? 1 : num2;
        const decimal = fractionNum / fractionDen;
        question = {
          num1: fractionNum,
          num2: fractionDen,
          operation,
          answer: Number.isInteger(decimal) ? decimal : parseFloat(decimal.toFixed(4)),
          display: `${fractionNum}/${fractionDen}`,
        };
        break;
      }
      case "decimal-to-fraction": {
        const fractionNum2 = num1;
        const fractionDen2 = num2 === 0 ? 1 : num2;
        const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
        const divisor = gcd(Math.abs(fractionNum2), Math.abs(fractionDen2));
        const simplifiedNum = fractionNum2 / divisor;
        const simplifiedDen = fractionDen2 / divisor;
        const decimal2 = fractionNum2 / fractionDen2;
        question = {
          num1: fractionNum2,
          num2: fractionDen2,
          operation,
          answer: simplifiedDen === 1 ? `${simplifiedNum}` : `${simplifiedNum}/${simplifiedDen}`,
          display: Number.isInteger(decimal2) ? `${decimal2}` : decimal2.toFixed(4).replace(/\.?0+$/, ""),
        };
        break;
      }
      case "fraction-to-percent": {
        const fractionNum3 = num1;
        const fractionDen3 = num2 === 0 ? 1 : num2;
        const percent = (fractionNum3 / fractionDen3) * 100;
        question = {
          num1: fractionNum3,
          num2: fractionDen3,
          operation,
          answer: Number.isInteger(percent) ? percent : parseFloat(percent.toFixed(2)),
          display: `${fractionNum3}/${fractionDen3}`,
        };
        break;
      }
      case "percent-to-fraction": {
        const percentVal = num1;
        const gcd2 = (a: number, b: number): number => (b === 0 ? a : gcd2(b, a % b));
        const divisor2 = gcd2(Math.abs(percentVal), 100);
        const simplifiedNum2 = percentVal / divisor2;
        const simplifiedDen2 = 100 / divisor2;
        question = {
          num1: percentVal,
          operation,
          answer: simplifiedDen2 === 1 ? `${simplifiedNum2}` : `${simplifiedNum2}/${simplifiedDen2}`,
          display: `${percentVal}%`,
        };
        break;
      }
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

// Action handlers
async function handleCreateRoom(body: any, res: VercelResponse) {
  const { odId, odName } = body;

  if (!odId || !odName) {
    return res.status(400).json({ error: "Player ID and name are required" });
  }

  const room = createRoomInStore(odId, odName.substring(0, 20), false);

  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : process.env.BASE_URL || "http://localhost:3000";
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

async function handleJoinRoom(body: any, res: VercelResponse) {
  const { roomCode, odId, odName } = body;

  if (!roomCode || !odId || !odName) {
    return res.status(400).json({ error: "Room code, player ID, and name are required" });
  }

  const result = joinRoomInStore(roomCode.toUpperCase(), odId, odName.substring(0, 20));

  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }

  const room = result.room!;
  const pusher = getPusher();

  await pusher.trigger(`room-${room.id}`, "player-joined", {
    type: "player-joined",
    player: room.players.find(p => p.id === odId),
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
    },
  });
}

async function handleLeaveRoom(body: any, res: VercelResponse) {
  const { roomId, odId, odName } = body;

  if (!roomId || !odId) {
    return res.status(400).json({ error: "roomId and odId are required" });
  }

  const room = getRoom(roomId);
  if (!room) {
    return res.status(404).json({ error: "Room not found" });
  }

  const leavingPlayer = room.players.find(p => p.id === odId);
  if (!leavingPlayer) {
    return res.status(404).json({ error: "Player not in room" });
  }

  room.players = room.players.filter(p => p.id !== odId);

  const pusher = getPusher();
  await pusher.trigger(`room-${roomId}`, "player-left", {
    playerId: odId,
    playerName: odName || leavingPlayer.name,
  });

  console.log(`[LeaveRoom] Player ${odId} (${odName}) left room ${roomId}`);

  if (room.players.length === 0) {
    deleteRoom(roomId);
    console.log(`[LeaveRoom] Room ${roomId} deleted (empty)`);
  }

  return res.status(200).json({ success: true });
}

async function handleQuickMatch(body: any, method: string, res: VercelResponse) {
  if (method === "DELETE") {
    const { odId } = body;
    if (odId) {
      removeFromQuickMatchQueue(odId);
    }
    return res.status(200).json({ success: true });
  }

  const { odId, odName, operation } = body;

  if (!odId || !odName || !operation) {
    return res.status(400).json({ error: "Player ID, name, and operation are required" });
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
      operation: operation as any,
      selectedNumbers: allNumbers,
      questionCount: 10,
      timeLimit: 0,
    };

    joinRoomInStore(room.code, odId, odName.substring(0, 20));

    const pusher = getPusher();
    await pusher.trigger(`quickmatch-${opponent.odId}`, "match-found", {
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

async function handleSetReady(body: any, res: VercelResponse) {
  const { roomId, odId, isReady } = body;

  if (!roomId || !odId || typeof isReady !== "boolean") {
    return res.status(400).json({ error: "Room ID, player ID, and isReady status are required" });
  }

  const room = getRoom(roomId);
  if (!room) {
    return res.status(404).json({ error: "Room not found" });
  }

  const playerIndex = room.players.findIndex((p) => p.id === odId);
  if (playerIndex === -1) {
    return res.status(404).json({ error: "Player not in room" });
  }

  room.players[playerIndex].isReady = isReady;
  updateRoom(room);

  const pusher = getPusher();

  await pusher.trigger(`room-${roomId}`, "player-ready", {
    odId,
    isReady,
  });

  const allReady = room.players.length === 2 && room.players.every((p) => p.isReady);
  console.log(`[SetReady] Room ${roomId}: Player ${odId} isReady=${isReady}, allReady=${allReady}`);

  if (allReady) {
    console.log(`[SetReady] All players ready! Starting game for room ${roomId}`);
    const questions = generateQuestions(
      room.settings.operation,
      room.settings.selectedNumbers,
      room.settings.questionCount
    );
    console.log(`[SetReady] Generated ${questions.length} questions`);

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

    console.log(`[SetReady] Triggering game-starting event`);
    await pusher.trigger(`room-${roomId}`, "game-starting", {
      questions,
    });
    console.log(`[SetReady] game-starting event sent`);
  }

  return res.status(200).json({
    success: true,
    allReady,
  });
}

async function handleStartReadyPhase(body: any, res: VercelResponse) {
  const { roomId, odId, settings } = body;

  if (!roomId || !odId) {
    return res.status(400).json({ error: "roomId and odId are required" });
  }

  const room = getRoom(roomId);
  if (!room) {
    return res.status(404).json({ error: "Room not found" });
  }

  const player = room.players.find(p => p.id === odId);
  if (!player?.isHost) {
    return res.status(403).json({ error: "Only host can start ready phase" });
  }

  if (room.players.length < 2) {
    return res.status(400).json({ error: "Need 2 players to start" });
  }

  if (settings) {
    updateRoomSettingsInStore(roomId, settings);
  }

  for (const p of room.players) {
    setPlayerReady(roomId, p.id, false);
  }

  const pusher = getPusher();
  await pusher.trigger(`room-${roomId}`, "ready-phase", {});

  console.log(`[StartReadyPhase] Room ${roomId} entering ready phase`);

  return res.status(200).json({ success: true });
}

async function handleUpdateRoomSettings(body: any, res: VercelResponse) {
  const { roomId, odId, settings } = body;

  if (!roomId || !odId || !settings) {
    return res.status(400).json({ error: "Room ID, player ID, and settings are required" });
  }

  const room = getRoom(roomId);
  if (!room) {
    return res.status(404).json({ error: "Room not found" });
  }

  if (room.hostId !== odId) {
    return res.status(403).json({ error: "Only the host can update settings" });
  }

  if (room.gameState !== "waiting") {
    return res.status(400).json({ error: "Cannot update settings while game is in progress" });
  }

  const updatedRoom = updateRoomSettingsInStore(roomId, settings);

  if (updatedRoom) {
    const pusher = getPusher();
    await pusher.trigger(`room-${roomId}`, "settings-updated", {
      type: "settings-updated",
      settings: updatedRoom.settings,
    });
  }

  return res.status(200).json({
    success: true,
    settings: updatedRoom?.settings,
  });
}

async function handleStartGame(body: any, res: VercelResponse) {
  const { roomId, odId } = body;

  if (!roomId || !odId) {
    return res.status(400).json({ error: "Room ID and player ID are required" });
  }

  const room = getRoom(roomId);
  if (!room) {
    return res.status(404).json({ error: "Room not found" });
  }

  if (!room.isQuickMatch && room.hostId !== odId) {
    return res.status(403).json({ error: "Only the host can start the game" });
  }

  if (room.players.length < 2) {
    return res.status(400).json({ error: "Need 2 players to start" });
  }

  if (room.gameState !== "waiting") {
    return res.status(400).json({ error: "Game already started" });
  }

  const questions = generateQuestions(
    room.settings.operation,
    room.settings.selectedNumbers,
    room.settings.questionCount
  );

  startGameInStore(roomId, questions);

  const pusher = getPusher();

  await pusher.trigger(`room-${roomId}`, "game-starting", {
    type: "game-starting",
    countdown: 3,
    questions,
  });

  setTimeout(async () => {
    const updatedRoom = setGamePlaying(roomId);
    if (updatedRoom) {
      await pusher.trigger(`room-${roomId}`, "game-started", {
        type: "game-started",
        startTime: updatedRoom.gameStartTime,
      });
    }
  }, 3000);

  return res.status(200).json({
    success: true,
    message: "Game starting",
  });
}

async function handleUpdateProgress(body: any, res: VercelResponse) {
  const { roomId, odId, currentQuestion } = body;

  if (!roomId || !odId || currentQuestion === undefined) {
    return res.status(400).json({ error: "Room ID, player ID, and current question are required" });
  }

  const room = getRoom(roomId);
  if (!room) {
    return res.status(404).json({ error: "Room not found" });
  }

  if (room.gameState !== "playing") {
    return res.status(400).json({ error: "Game not in progress" });
  }

  updatePlayerProgress(roomId, odId, currentQuestion);

  const pusher = getPusher();
  await pusher.trigger(`room-${roomId}`, "opponent-progress", {
    type: "opponent-progress",
    odId,
    currentQuestion,
  });

  return res.status(200).json({ success: true });
}

async function handleSubmitMultiplayer(body: any, res: VercelResponse) {
  const { roomId, odId, answers, score } = body;

  if (!roomId || !odId || !answers || score === undefined) {
    return res.status(400).json({ error: "Room ID, player ID, answers, and score are required" });
  }

  const room = getRoom(roomId);
  if (!room) {
    return res.status(404).json({ error: "Room not found" });
  }

  const { room: updatedRoom, bothFinished } = submitPlayerAnswers(roomId, odId, answers, score);

  if (!updatedRoom) {
    return res.status(500).json({ error: "Failed to submit answers" });
  }

  const pusher = getPusher();
  const playerState = updatedRoom.playerStates.find(p => p.odId === odId);

  await pusher.trigger(`room-${roomId}`, "opponent-finished", {
    type: "opponent-finished",
    odId,
    finishTime: playerState?.finishTime,
  });

  if (bothFinished) {
    const results: MultiplayerResult[] = updatedRoom.playerStates.map(ps => ({
      odId: ps.odId,
      odName: ps.odName,
      score: ps.score,
      totalQuestions: updatedRoom.questions.length,
      timeTaken: ps.finishTime || 0,
      answers: ps.answers,
      questions: updatedRoom.questions,
    }));

    await pusher.trigger(`room-${roomId}`, "game-ended", {
      type: "game-ended",
      results,
    });
  }

  return res.status(200).json({
    success: true,
    bothFinished,
    finishTime: playerState?.finishTime,
  });
}

async function handleRematch(body: any, res: VercelResponse) {
  const { roomId, odId, odName, action } = body;

  if (!roomId || !odId || !odName || !action) {
    return res.status(400).json({ error: "Room ID, player ID, name, and action are required" });
  }

  const room = getRoom(roomId);
  if (!room) {
    return res.status(404).json({ error: "Room not found" });
  }

  const pusher = getPusher();
  const player = room.players.find(p => p.id === odId);

  if (!player) {
    return res.status(403).json({ error: "Player not in room" });
  }

  if (action === "request") {
    await pusher.trigger(`room-${roomId}`, "rematch-requested", {
      type: "rematch-requested",
      fromPlayerId: odId,
      fromPlayerName: odName,
    });

    return res.status(200).json({ success: true, message: "Rematch request sent" });
  }

  if (action === "accept") {
    const opponent = room.players.find(p => p.id !== odId);
    if (!opponent) {
      return res.status(400).json({ error: "No opponent to rematch with" });
    }

    const newRoom = createRoomInStore(opponent.id, opponent.name, room.isQuickMatch);
    newRoom.settings = { ...room.settings };
    
    joinRoomInStore(newRoom.code, odId, odName);

    await pusher.trigger(`room-${roomId}`, "rematch-accepted", {
      type: "rematch-accepted",
      newRoomCode: newRoom.code,
      newRoomId: newRoom.id,
      isQuickMatch: room.isQuickMatch,
      settings: newRoom.settings,
      players: newRoom.players,
    });

    return res.status(200).json({
      success: true,
      newRoomId: newRoom.id,
      newRoomCode: newRoom.code,
      isQuickMatch: room.isQuickMatch,
      settings: newRoom.settings,
      players: newRoom.players,
    });
  }

  if (action === "decline") {
    await pusher.trigger(`room-${roomId}`, "rematch-declined", {
      type: "rematch-declined",
    });

    return res.status(200).json({ success: true, message: "Rematch declined" });
  }

  return res.status(400).json({ error: "Invalid action" });
}

async function handlePlayerDisconnect(body: any, res: VercelResponse) {
  const { roomId, odId } = body;

  if (!roomId || !odId) {
    return res.status(400).json({ error: "Room ID and player ID are required" });
  }

  const room = playerDisconnected(roomId, odId);

  if (room) {
    const pusher = getPusher();
    
    await pusher.trigger(`room-${roomId}`, "player-disconnected", {
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

      await pusher.trigger(`room-${roomId}`, "game-ended", {
        type: "game-ended",
        results,
      });
    }
  }

  return res.status(200).json({ success: true });
}

// Main handler - routes by action parameter
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Enable CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST" && req.method !== "DELETE") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { action, ...rest } = req.body;

    if (!action) {
      return res.status(400).json({ error: "Action is required" });
    }

    switch (action) {
      case "create-room":
        return handleCreateRoom(rest, res);
      case "join-room":
        return handleJoinRoom(rest, res);
      case "leave-room":
        return handleLeaveRoom(rest, res);
      case "quick-match":
        return handleQuickMatch(rest, req.method, res);
      case "set-ready":
        return handleSetReady(rest, res);
      case "start-ready-phase":
        return handleStartReadyPhase(rest, res);
      case "update-room-settings":
        return handleUpdateRoomSettings(rest, res);
      case "start-game":
        return handleStartGame(rest, res);
      case "update-progress":
        return handleUpdateProgress(rest, res);
      case "submit-multiplayer":
        return handleSubmitMultiplayer(rest, res);
      case "rematch":
        return handleRematch(rest, res);
      case "player-disconnect":
        return handlePlayerDisconnect(rest, res);
      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }
  } catch (error: any) {
    console.error("Multiplayer error:", error);
    return res.status(500).json({ 
      error: "Internal server error", 
      message: error?.message || String(error)
    });
  }
}
