import { getSupabase } from "../lib/api/db-pool.js";
import { apiError, handleApiError } from "../lib/api/errors.js";
import { FeedbackSchema, validate } from "../lib/api/validation.js";
import { logger } from "../lib/api/logger.js";
import type { VercelRequest, VercelResponse } from "@vercel/node";

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 5;
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
  logger.log("[api/submit-feedback] Function invoked.");

  try {
    if (req.method !== "POST") {
      return apiError(res, 405, "Method Not Allowed");
    }

    const { type, message } = validate(FeedbackSchema, req.body);

    const clientKey = getClientKey(req);
    if (!allowRequest(clientKey)) {
      return apiError(res, 429, "Too many requests. Please slow down.");
    }

    const supabase = getSupabase();

    const { error: insertError } = await supabase
      .from("feedback")
      .insert({
        type,
        message,
        created_at: new Date().toISOString(),
      });

    if (insertError) {
      throw insertError;
    }

    logger.log(`[api/submit-feedback] Feedback submitted: type=${type}, message length=${message.length}`);
    return res.status(201).json({ message: "Feedback submitted successfully!" });
  } catch (error) {
    return handleApiError(res, "api/submit-feedback", "Validation/DB feedback submission failed", error);
  }
}
