import { getSupabase } from "../lib/api/db-pool.js";
import { apiError, handleApiError } from "../lib/api/errors.js";
import { getCurrentEasternMonthBounds } from "../lib/api/time-utils.js";
import { GetLeaderboardQuerySchema, validate } from "../lib/api/validation.js";
import type { VercelRequest, VercelResponse } from "@vercel/node";

const CACHE_TTL_MS = 60 * 1000;
const CACHE_CONTROL_HEADER = "public, max-age=60";
interface LeaderboardEntry {
  playerName: string;
  score: number;
}

let leaderboardCache: Record<string, { expiresAt: number; payload: LeaderboardEntry[] }> = {};

export function clearLeaderboardCache(operationType?: string) {
  if (operationType) {
    console.log(`[Cache] Invalidating leaderboard cache for: ${operationType}`);
    delete leaderboardCache[operationType];
  } else {
    console.log("[Cache] Invalidating all leaderboard caches.");
    leaderboardCache = {};
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  console.log("[api/get-leaderboard] Function invoked.");
  try {
    if (req.method !== "GET") {
      return apiError(res, 405, "Method Not Allowed");
    }

    const { operationType } = validate(GetLeaderboardQuerySchema, req.query);
    const now = Date.now();
    const cached = leaderboardCache[operationType];
    if (cached && cached.expiresAt > now) {
      console.log(`[api/get-leaderboard] Serving from cache for ${operationType}.`);
      res.setHeader("Cache-Control", CACHE_CONTROL_HEADER);
      return res.status(200).json(cached.payload);
    }

    console.log(`[api/get-leaderboard] Fetching from database for ${operationType}...`);
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

    leaderboardCache[operationType] = {
      expiresAt: now + CACHE_TTL_MS,
      payload: leaderboard,
    };

    res.setHeader("Cache-Control", CACHE_CONTROL_HEADER);
    return res.status(200).json(leaderboard);
  } catch (error) {
    return handleApiError(res, "api/get-leaderboard", "Validation/DB leaderboard retrieval failed", error);
  }
}
