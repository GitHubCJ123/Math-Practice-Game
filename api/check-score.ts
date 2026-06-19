import { getSupabase } from "../lib/api/db-pool.js";
import { apiError, handleApiError } from "../lib/api/errors.js";
import { isScoreEligible } from "../lib/api/score-eligibility.js";
import { getCurrentEasternMonthBounds } from "../lib/api/time-utils.js";
import { CheckScoreSchema, validate } from "../lib/api/validation.js";
import { logger } from "../lib/api/logger.js";
import { rateLimitHit, getClientKey } from "../lib/api/rate-limit.js";
import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  logger.log("[api/check-score] Function invoked.");
  try {
    if (req.method !== "GET") {
      return apiError(res, 405, "Method Not Allowed");
    }

    const { operationType, score, questionCount, selectedNumbersCount, allNumbersSelected } = validate(CheckScoreSchema, req.query);

    const clientKey = getClientKey(req);
    if (!(await rateLimitHit(`check-score:${clientKey}`, 30, 60_000))) {
      return apiError(res, 429, "Too many requests. Please slow down.");
    }

    const eligible = isScoreEligible(
      operationType,
      questionCount,
      selectedNumbersCount,
      allNumbersSelected
    );

    if (!eligible) {
      return res.status(200).json({ isTopScore: false, ineligible: true });
    }

    const { startUtc, endUtc } = getCurrentEasternMonthBounds();
    const supabase = getSupabase();

    const { data, error } = await supabase
      .from("leaderboard_scores")
      .select("score")
      .eq("operation_type", operationType)
      .gte("created_at", startUtc.toISOString())
      .lt("created_at", endUtc.toISOString());

    if (error) {
      throw error;
    }

    const scores = data || [];
    const totalScores = scores.length;
    const betterScores = scores.filter((row) => row.score < score).length;

    const isTopScore = totalScores < 5 || betterScores < 5;

    return res.status(200).json({ isTopScore });
  } catch (error) {
    return handleApiError(res, "api/check-score", "Validation/DB score check failed", error);
  }
}
