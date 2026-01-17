import { Request, Response } from "express";
import { getRoom, updateRoomSettings, setPlayerReady } from "./room-store";
import { getPusher } from "./pusher";

export default async function handler(req: Request, res: Response) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { roomId, odId, settings } = req.body;

    if (!roomId || !odId) {
      return res.status(400).json({ error: "roomId and odId are required" });
    }

    const room = getRoom(roomId);
    if (!room) {
      return res.status(404).json({ error: "Room not found" });
    }

    // Only host can start ready phase
    const player = room.players.find(p => p.id === odId);
    if (!player?.isHost) {
      return res.status(403).json({ error: "Only host can start ready phase" });
    }

    if (room.players.length < 2) {
      return res.status(400).json({ error: "Need 2 players to start" });
    }

    // Update settings if provided
    if (settings) {
      updateRoomSettings(roomId, settings);
    }

    // Reset ready status for all players
    for (const p of room.players) {
      setPlayerReady(roomId, p.id, false);
    }

    // Notify all players to enter ready phase
    const pusher = getPusher();
    await pusher.trigger(`room-${roomId}`, "ready-phase", {});

    console.log(`[StartReadyPhase] Room ${roomId} entering ready phase`);

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("[StartReadyPhase] Error:", error);
    return res.status(500).json({ error: "Failed to start ready phase" });
  }
}
