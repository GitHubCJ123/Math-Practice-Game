import { apiError, handleApiError } from "../lib/api/errors.js";
import { BroadcastSchema, validate } from "../lib/api/validation.js";
import { getPusher } from "../lib/api/pusher.js";
import { isValidAdminCode } from "../lib/api/admin-auth.js";
import { createRateLimiter, getClientKey } from "../lib/api/rate-limit.js";
import { logger } from "../lib/api/logger.js";
import {
  GLOBAL_BROADCAST_CHANNEL,
  GLOBAL_BROADCAST_EVENT,
  type BroadcastMessage,
} from "../shared/types.js";
import type { VercelRequest, VercelResponse } from "@vercel/node";

const allowRequest = createRateLimiter({ windowMs: 60_000, max: 20 });

export default async function handler(req: VercelRequest, res: VercelResponse) {
  logger.log("[api/broadcast] Function invoked.");

  try {
    if (req.method !== "POST") {
      return apiError(res, 405, "Method Not Allowed");
    }

    const { code, message } = validate(BroadcastSchema, req.body);

    if (!allowRequest(getClientKey(req))) {
      return apiError(res, 429, "Too many requests. Please slow down.");
    }

    // Server-side authorization: the privileged action is gated here, not just
    // in the client UI.
    if (!isValidAdminCode(code)) {
      return apiError(res, 401, "Invalid admin code.");
    }

    const broadcast: BroadcastMessage = {
      id: `bc_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      message,
      sentAt: Date.now(),
    };

    await getPusher().trigger(GLOBAL_BROADCAST_CHANNEL, GLOBAL_BROADCAST_EVENT, broadcast);

    logger.log(`[api/broadcast] Broadcast sent: length=${message.length}`);
    return res.status(201).json({ ok: true, broadcast });
  } catch (error) {
    return handleApiError(res, "api/broadcast", "Broadcast failed", error);
  }
}
