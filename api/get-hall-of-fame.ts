import { getSupabase } from "../lib/api/db-pool.js";
import { apiError, handleApiError } from "../lib/api/errors.js";
import { GetHallOfFameQuerySchema, validate } from "../lib/api/validation.js";
import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "GET") {
      return apiError(res, 405, "Method Not Allowed");
    }

    const { operationType, year, month } = validate(GetHallOfFameQuerySchema, req.query);
    const supabase = getSupabase();

    const { data, error } = await supabase
      .from("hall_of_fame")
      .select("player_name, score")
      .eq("operation_type", operationType)
      .eq("year", year)
      .eq("month", month)
      .order("score", { ascending: true });

    if (error) {
      throw error;
    }

    const hallOfFame = (data || []).map((row) => ({
      playerName: row.player_name,
      score: row.score,
    }));

    return res.status(200).json(hallOfFame);
  } catch (error) {
    return handleApiError(res, "api/get-hall-of-fame", "Validation/DB hall of fame retrieval failed", error);
  }
}
