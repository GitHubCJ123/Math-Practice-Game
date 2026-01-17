import Pusher from "pusher";

let pusherInstance: Pusher | null = null;

export function getPusher(): Pusher {
  if (!pusherInstance) {
    const appId = process.env.PUSHER_APP_ID;
    const key = process.env.PUSHER_KEY;
    const secret = process.env.PUSHER_SECRET;
    const cluster = process.env.PUSHER_CLUSTER;

    if (!appId || !key || !secret || !cluster) {
      throw new Error(
        "PUSHER_APP_ID, PUSHER_KEY, PUSHER_SECRET, and PUSHER_CLUSTER environment variables are required"
      );
    }

    pusherInstance = new Pusher({
      appId,
      key,
      secret,
      cluster,
      useTLS: true,
    });
  }
  return pusherInstance;
}

// Generate a random 8-character room code
export function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Excluding confusing characters like 0, O, 1, I
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Generate a unique player ID
export function generatePlayerId(): string {
  return `player_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}
