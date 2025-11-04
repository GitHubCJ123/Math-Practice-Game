import sql from "mssql";
import { getPool } from "./db-pool";
import { getCurrentEasternMonthBounds } from "./time-utils";

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
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
      return res.status(200).json(cached.payload);
    }
    
    console.log(`[api/get-leaderboard] Fetching from database for ${operationType}...`);
    const { startUtc, endUtc } = getCurrentEasternMonthBounds();
    const pool = await getPool();
    const request = pool.request();
    request.input("operationType", sql.NVarChar, operationType);
    request.input("monthStartUtc", sql.DateTime2, startUtc);
    request.input("nextMonthStartUtc", sql.DateTime2, endUtc);

    const query = `
      SELECT TOP 5 PlayerName, Score
      FROM LeaderboardScores
      WHERE OperationType = @operationType
        AND CreatedAt >= @monthStartUtc
        AND CreatedAt < @nextMonthStartUtc
      ORDER BY Score ASC, CreatedAt ASC;
    `;

    const result = await request.query(query);
    const leaderboard = result.recordset.map((row) => ({
      playerName: row.PlayerName,
      score: row.Score,
    }));

    leaderboardCache[operationType] = {
      expiresAt: now + CACHE_TTL_MS,
      payload: leaderboard,
    };

    return res.status(200).json(leaderboard);
  } catch (error) {
    console.error("[api/get-leaderboard] Error handling request", error);
    return res.status(500).json({ message: "Error retrieving leaderboard", error: error.message });
  }
}
