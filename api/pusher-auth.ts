import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPusher } from "../lib/api/pusher.js";
import { apiError, handleApiError } from "../lib/api/errors.js";

// Pusher auth endpoint for presence channels
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    // Enable CORS
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      return res.status(200).end();
    }

    if (req.method !== "POST") {
      return apiError(res, 405, "Method not allowed");
    }

    const { socket_id, channel_name, playerId, playerName } = req.body;

    if (!socket_id || !channel_name) {
      return res.status(400).json({ error: "Socket ID and channel name are required" });
    }

    const pusher = getPusher();

    // For presence channels, include user data
    if (channel_name.startsWith("presence-")) {
      const presenceData = {
        user_id: playerId || `anonymous_${Date.now()}`,
        user_info: {
          name: playerName || "Anonymous",
        },
      };
      const auth = pusher.authorizeChannel(socket_id, channel_name, presenceData);
      return res.status(200).json(auth);
    }

    // For private channels
    if (channel_name.startsWith("private-")) {
      const auth = pusher.authorizeChannel(socket_id, channel_name);
      return res.status(200).json(auth);
    }

    // Public channels don't need auth
    return res.status(200).json({ auth: "" });
  } catch (error) {
    return handleApiError(res, "api/pusher-auth", "Pusher channel authentication failed", error);
  }
}
