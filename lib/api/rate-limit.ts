import type { VercelRequest } from "@vercel/node";

interface RateLimitOptions {
  windowMs: number;
  max: number;
}

/**
 * Creates a per-key fixed-window rate limiter. State is in-memory and therefore
 * per-serverless-instance — adequate as light abuse protection, not a hard
 * guarantee across distributed instances.
 */
export function createRateLimiter({ windowMs, max }: RateLimitOptions) {
  const buckets = new Map<string, { count: number; resetAt: number }>();
  return function allow(key: string): boolean {
    const now = Date.now();
    const entry = buckets.get(key);
    if (!entry || entry.resetAt < now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return true;
    }
    if (entry.count >= max) {
      return false;
    }
    entry.count += 1;
    return true;
  };
}

/** Best-effort client identity for rate limiting (first X-Forwarded-For IP). */
export function getClientKey(req: VercelRequest): string {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.length > 0) {
    return xff.split(",")[0].trim();
  }
  return req.socket?.remoteAddress || "unknown";
}
