import { getSupabase } from "../lib/api/db-pool.js";
import { apiError, handleApiError } from "../lib/api/errors.js";
import { FeedbackSchema, validate } from "../lib/api/validation.js";
import { logger } from "../lib/api/logger.js";
import { rateLimitHit, getClientKey } from "../lib/api/rate-limit.js";
import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  logger.log("[api/submit-feedback] Function invoked.");

  try {
    if (req.method !== "POST") {
      return apiError(res, 405, "Method Not Allowed");
    }

    const { type, message } = validate(FeedbackSchema, req.body);

    const clientKey = getClientKey(req);
    if (!(await rateLimitHit(`submit-feedback:${clientKey}`, 5, 60_000))) {
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
