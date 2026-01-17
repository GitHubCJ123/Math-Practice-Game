import { getSupabase } from "./db-pool.js";
import { getCurrentEasternMonthBounds } from "./time-utils.js";

const CACHE_TTL_MS = 60 * 1000; // 1 minute
const CACHE_CONTROL_HEADER = "public, max-age=60";
let leaderboardCache: Record<string, { expiresAt: number; payload: any[] }> = {};

/**
 * Clears the leaderboard cache. Can be called with a specific operationType
 * to clear just that board, or with no argument to clear all boards.
 */
export function clearLeaderboardCache(operationType?: string) {
  if (operationType) {
    console.log(`[Cache] Invalidating leaderboard cache for: ${operationType}`);
    delete leaderboardCache[operationType];
  } else {
    console.log('[Cache] Invalidating all leaderboard caches.');
    leaderboardCache = {};
  }
}

export default async function handler(req, res) {
  console.log("[api/get-leaderboard] Function invoked.");
  if (req.method !== "GET") {
    return res.status(405).json({ message: "Method Not Allowed" });
  }

  const { operationType } = req.query;

  if (!operationType || typeof operationType !== "string") {
    return res.status(400).json({ message: "operationType query parameter is required" });
  }

  try {
    const now = Date.now();
    const cached = leaderboardCache[operationType];
    if (cached && cached.expiresAt > now) {
      console.log(`[api/get-leaderboard] Serving from cache for ${operationType}.`);
      res.setHeader('Cache-Control', CACHE_CONTROL_HEADER);
      return res.status(200).json(cached.payload);
    }
    
    console.log(`[api/get-leaderboard] Fetching from database for ${operationType}...`);
    const { startUtc, endUtc } = getCurrentEasternMonthBounds();
    const supabase = getSupabase();

    const { data, error } = await supabase
      .from('leaderboard_scores')
      .select('player_name, score')
      .eq('operation_type', operationType)
      .gte('created_at', startUtc.toISOString())
      .lt('created_at', endUtc.toISOString())
      .order('score', { ascending: true })
      .order('created_at', { ascending: true })
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

    res.setHeader('Cache-Control', CACHE_CONTROL_HEADER);
    return res.status(200).json(leaderboard);
  } catch (error) {
    console.error("[api/get-leaderboard] Error handling request", error);
    return res.status(500).json({ message: "Error retrieving leaderboard", error: error.message });
  }
}
