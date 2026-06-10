import { getSupabase } from "../lib/api/db-pool.js";
import { apiError, handleApiError } from "../lib/api/errors.js";
import { logger } from "../lib/api/logger.js";
import { getCurrentEasternMonthBounds } from "../lib/api/time-utils.js";
import { GetLeaderboardQuerySchema, validate } from "../lib/api/validation.js";
import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  logger.log("[api/get-leaderboard] Function invoked.");
  try {
    if (req.method !== "GET") {
      return apiError(res, 405, "Method Not Allowed");
    }

    const { operationType } = validate(GetLeaderboardQuerySchema, req.query);

    logger.log(`[api/get-leaderboard] Fetching from database for ${operationType}...`);
    const { startUtc, endUtc } = getCurrentEasternMonthBounds();
    const supabase = getSupabase();

    const { data, error } = await supabase
      .from("leaderboard_scores")
      .select("player_name, score")
      .eq("operation_type", operationType)
      .gte("created_at", startUtc.toISOString())
      .lt("created_at", endUtc.toISOString())
      .order("score", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(5);

    if (error) {
      throw error;
    }

    const leaderboard = (data || []).map((row) => ({
      playerName: row.player_name,
      score: row.score,
    }));

    return res.status(200).json(leaderboard);
  } catch (error) {
    return handleApiError(res, "api/get-leaderboard", "Validation/DB leaderboard retrieval failed", error);
  }
}
