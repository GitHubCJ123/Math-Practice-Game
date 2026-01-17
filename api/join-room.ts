import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPusher } from "./pusher";
import { joinRoom, getRoomByCode } from "./room-store";

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
    const { roomCode, odId, odName } = req.body;

    if (!roomCode || !odId || !odName) {
      return res.status(400).json({ error: "Room code, player ID, and name are required" });
    }

    const result = joinRoom(roomCode.toUpperCase(), odId, odName.substring(0, 20));

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    const room = result.room!;
    const pusher = getPusher();

    // Notify existing players that someone joined
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
  } catch (error) {
    console.error("Error joining room:", error);
    return res.status(500).json({ error: "Failed to join room" });
  }
}
