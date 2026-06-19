import type { VercelRequest } from "@vercel/node";
import { getSupabase } from "./db-pool.js";

/**
 * Postgres-backed fixed-window rate limiter (`rate_limit_hit` in
 * migrations/schema/multiplayer-functions.sql). State lives in the shared
 * `rate_limits` table, so the limit now holds across all serverless instances —
 * unlike the old per-instance in-memory counter. Fails OPEN (allows the request)
 * if the database is unreachable, so a transient DB problem can't lock everyone
 * out of a kids' game.
 *
 * @param key      caller identity, namespaced per endpoint (e.g. `broadcast:1.2.3.4`)
 * @param max      maximum hits allowed within the window
 * @param windowMs window length in milliseconds
 * @returns true if the request is allowed
 */
export async function rateLimitHit(key: string, max: number, windowMs: number): Promise<boolean> {
  try {
    const windowSecs = Math.max(1, Math.round(windowMs / 1000));
    const { data, error } = await getSupabase().rpc("rate_limit_hit", {
      p_key: key,
      p_max: max,
      p_window_secs: windowSecs,
    });
    if (error) {
      console.error("[lib/api/rate-limit] rate_limit_hit rpc failed; allowing request:", error);
      return true; // fail open
    }
    return data === true;
  } catch (err) {
    console.error("[lib/api/rate-limit] rate_limit_hit threw; allowing request:", err);
    return true; // fail open
  }
}

/** Best-effort client identity for rate limiting (first X-Forwarded-For IP). */
export function getClientKey(req: VercelRequest): string {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.length > 0) {
    return xff.split(",")[0].trim();
  }
  return req.socket?.remoteAddress || "unknown";
}
