import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPusher } from "./pusher";
import { getRoom, submitPlayerAnswers } from "./room-store";
import { MultiplayerResult } from "../types";

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
    const { roomId, odId, answers, score } = req.body;

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

    // Notify opponent that this player finished
    await pusher.trigger(`room-${roomId}`, "opponent-finished", {
      type: "opponent-finished",
      odId,
      finishTime: playerState?.finishTime,
    });

    // If both players finished, send final results
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
  } catch (error) {
    console.error("Error submitting answers:", error);
    return res.status(500).json({ error: "Failed to submit answers" });
  }
}
