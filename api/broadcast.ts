import { apiError, handleApiError } from "../lib/api/errors.js";
import { BroadcastSchema, validate } from "../lib/api/validation.js";
import { getPusher } from "../lib/api/pusher.js";
import { logger } from "../lib/api/logger.js";
import {
  GLOBAL_BROADCAST_CHANNEL,
  GLOBAL_BROADCAST_EVENT,
  type BroadcastMessage,
} from "../shared/types.js";
import type { VercelRequest, VercelResponse } from "@vercel/node";

/**
 * Authorized admin codes. Prefer setting `ADMIN_CODES` (comma-separated) in the
 * environment so codes never live in committed source. The fallback list keeps
 * the feature working out of the box and must stay in sync with the client gate
 * in `src/contexts/AdminContext.tsx`.
 */
const FALLBACK_ADMIN_CODES = ["sigma67eli", "coderjacobcj67!"];

function getAdminCodes(): string[] {
  const fromEnv = process.env.ADMIN_CODES;
  if (fromEnv && fromEnv.trim()) {
    return fromEnv
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);
  }
  return FALLBACK_ADMIN_CODES;
}

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 20;
const rateLimit = new Map<string, { count: number; resetAt: number }>();

function allowRequest(key: string) {
  const now = Date.now();
  const entry = rateLimit.get(key);
  if (!entry || entry.resetAt < now) {
    rateLimit.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) {
    return false;
  }
  entry.count += 1;
  return true;
}

function getClientKey(req: VercelRequest): string {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.length > 0) {
    return xff.split(",")[0].trim();
  }
  return req.socket?.remoteAddress || "unknown";
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  logger.log("[api/broadcast] Function invoked.");

  try {
    if (req.method !== "POST") {
      return apiError(res, 405, "Method Not Allowed");
    }

    const { code, message } = validate(BroadcastSchema, req.body);

    const clientKey = getClientKey(req);
    if (!allowRequest(clientKey)) {
      return apiError(res, 429, "Too many requests. Please slow down.");
    }

    // Server-side authorization: the privileged action is gated here, not just
    // in the client UI.
    if (!getAdminCodes().includes(code)) {
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
