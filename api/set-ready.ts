import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPusher } from "./pusher";
import { getRoom, updateRoom, startGame as startGameInStore, setGamePlaying } from "./room-store";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Enable CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { roomId, odId, isReady } = req.body;

    if (!roomId || !odId || typeof isReady !== "boolean") {
      return res.status(400).json({ error: "Room ID, player ID, and isReady status are required" });
    }

    const room = getRoom(roomId);
    if (!room) {
      return res.status(404).json({ error: "Room not found" });
    }

    // Update player ready status
    const playerIndex = room.players.findIndex((p) => p.id === odId);
    if (playerIndex === -1) {
      return res.status(404).json({ error: "Player not in room" });
    }

    room.players[playerIndex].isReady = isReady;
    updateRoom(room);

    const pusher = getPusher();

    // Notify all players of ready status change
    await pusher.trigger(`room-${roomId}`, "player-ready", {
      odId,
      isReady,
    });

    // Check if all players are ready (2 players)
    const allReady = room.players.length === 2 && room.players.every((p) => p.isReady);
    console.log(`[SetReady] Room ${roomId}: Player ${odId} isReady=${isReady}, allReady=${allReady}, players:`, room.players.map(p => ({ id: p.id, isReady: p.isReady })));

    if (allReady) {
      console.log(`[SetReady] All players ready! Starting game for room ${roomId}`);
      // Generate questions and start the game
      const { generateQuestions } = await import("./start-game");
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
  } catch (error) {
    console.error("Error setting ready status:", error);
    return res.status(500).json({ error: "Failed to set ready status" });
  }
}
