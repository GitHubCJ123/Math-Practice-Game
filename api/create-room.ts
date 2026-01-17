import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPusher } from "./pusher";
import { createRoom } from "./room-store";

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
    const { odId, odName } = req.body;

    if (!odId || !odName) {
      return res.status(400).json({ error: "Player ID and name are required" });
    }

    const room = createRoom(odId, odName.substring(0, 20), false);

    // Generate the join URL
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
  } catch (error) {
    console.error("Error creating room:", error);
    return res.status(500).json({ error: "Failed to create room" });
  }
}
