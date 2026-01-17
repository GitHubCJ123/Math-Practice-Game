import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPusher, generateRoomCode } from "./pusher";
import { getRoom, createRoom, joinRoom } from "./room-store";

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
    const { roomId, odId, odName, action } = req.body;

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
      // Send rematch request to opponent
      await pusher.trigger(`room-${roomId}`, "rematch-requested", {
        type: "rematch-requested",
        fromPlayerId: odId,
        fromPlayerName: odName,
      });

      return res.status(200).json({ success: true, message: "Rematch request sent" });
    }

    if (action === "accept") {
      // Create a new room with same settings
      const opponent = room.players.find(p => p.id !== odId);
      if (!opponent) {
        return res.status(400).json({ error: "No opponent to rematch with" });
      }

      // The person who originally requested the rematch becomes the new host
      const newRoom = createRoom(opponent.id, opponent.name, room.isQuickMatch);
      newRoom.settings = { ...room.settings };
      
      // Add the accepting player
      joinRoom(newRoom.code, odId, odName);

      // Notify both players about the new room
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
  } catch (error) {
    console.error("Error handling rematch:", error);
    return res.status(500).json({ error: "Failed to handle rematch" });
  }
}
