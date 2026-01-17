import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPusher } from "./pusher";
import { updateRoomSettings, getRoom } from "./room-store";

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
    const { roomId, odId, settings } = req.body;

    if (!roomId || !odId || !settings) {
      return res.status(400).json({ error: "Room ID, player ID, and settings are required" });
    }

    const room = getRoom(roomId);
    if (!room) {
      return res.status(404).json({ error: "Room not found" });
    }

    // Only host can update settings
    if (room.hostId !== odId) {
      return res.status(403).json({ error: "Only the host can update settings" });
    }

    if (room.gameState !== "waiting") {
      return res.status(400).json({ error: "Cannot update settings while game is in progress" });
    }

    const updatedRoom = updateRoomSettings(roomId, settings);

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
  } catch (error) {
    console.error("Error updating settings:", error);
    return res.status(500).json({ error: "Failed to update settings" });
  }
}
