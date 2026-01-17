import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPusher } from "./pusher";
import { getRoom, playerDisconnected } from "./room-store";

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
    const { roomId, odId } = req.body;

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

      // If game was in progress and both are now finished, send results
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
  } catch (error) {
    console.error("Error handling disconnect:", error);
    return res.status(500).json({ error: "Failed to handle disconnect" });
  }
}
