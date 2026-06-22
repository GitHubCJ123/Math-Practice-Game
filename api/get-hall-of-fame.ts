import { getSupabase } from "../lib/api/db-pool.js";
import { apiError, handleApiError } from "../lib/api/errors.js";
import { logger } from "../lib/api/logger.js";
import {
  GetHallOfFameQuerySchema,
  GetHallOfFameDatesQuerySchema,
  validate,
} from "../lib/api/validation.js";
import type { VercelRequest, VercelResponse } from "@vercel/node";

/**
 * Hall of Fame reads. Two views share ONE serverless function (to stay within
 * Vercel's Hobby-plan 12-function limit):
 *   GET /api/get-hall-of-fame?view=dates                  -> { [year]: number[] }
 *   GET /api/get-hall-of-fame?operationType=&year=&month= -> [{ playerName, score }]
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "GET") {
      return apiError(res, 405, "Method Not Allowed");
    }

    const supabase = getSupabase();

    // View: which year/month buckets have champions (powers the date picker).
    if (req.query.view === "dates") {
      validate(GetHallOfFameDatesQuerySchema, req.query);
      logger.log("[api/get-hall-of-fame] Fetching available dates...");

      const { data, error } = await supabase
        .from("hall_of_fame")
        .select("year, month")
        .order("year", { ascending: false })
        .order("month", { ascending: false });
      if (error) throw error;

      const seen = new Set<string>();
      const grouped = (data || []).reduce<Record<number, number[]>>((acc, row) => {
        const key = `${row.year}-${row.month}`;
        if (seen.has(key)) return acc;
        seen.add(key);
        const year = row.year as number;
        const month = row.month as number;
        if (!acc[year]) acc[year] = [];
        acc[year].push(month);
        return acc;
      }, {});

      return res.status(200).json(grouped);
    }

    // Default view: champions for a specific operation/year/month.
    const { operationType, year, month } = validate(GetHallOfFameQuerySchema, req.query);

    const { data, error } = await supabase
      .from("hall_of_fame")
      .select("player_name, score")
      .eq("operation_type", operationType)
      .eq("year", year)
      .eq("month", month)
      .order("score", { ascending: true });
    if (error) throw error;

    const hallOfFame = (data || []).map((row) => ({
      playerName: row.player_name,
      score: row.score,
    }));

    return res.status(200).json(hallOfFame);
  } catch (error) {
    return handleApiError(res, "api/get-hall-of-fame", "Validation/DB hall of fame retrieval failed", error);
  }
}
