import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPusher } from "./pusher";
import { getRoom, updatePlayerProgress } from "./room-store";

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
    const { roomId, odId, currentQuestion } = req.body;

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
  } catch (error) {
    console.error("Error updating progress:", error);
    return res.status(500).json({ error: "Failed to update progress" });
  }
}
