import { Request, Response } from "express";
import { getRoom, deleteRoom } from "./room-store";
import { getPusher } from "./pusher";

export default async function handler(req: Request, res: Response) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { roomId, odId, odName } = req.body;

    if (!roomId || !odId) {
      return res.status(400).json({ error: "roomId and odId are required" });
    }

    const room = getRoom(roomId);
    if (!room) {
      return res.status(404).json({ error: "Room not found" });
    }

    // Find the leaving player
    const leavingPlayer = room.players.find(p => p.id === odId);
    if (!leavingPlayer) {
      return res.status(404).json({ error: "Player not in room" });
    }

    // Remove player from room
    room.players = room.players.filter(p => p.id !== odId);

    // Notify other players that this player left
    const pusher = getPusher();
    await pusher.trigger(`room-${roomId}`, "player-left", {
      playerId: odId,
      playerName: odName || leavingPlayer.name,
    });

    console.log(`[LeaveRoom] Player ${odId} (${odName}) left room ${roomId}`);

    // If room is now empty, delete it
    if (room.players.length === 0) {
      deleteRoom(roomId);
      console.log(`[LeaveRoom] Room ${roomId} deleted (empty)`);
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("[LeaveRoom] Error:", error);
    return res.status(500).json({ error: "Failed to leave room" });
  }
}
