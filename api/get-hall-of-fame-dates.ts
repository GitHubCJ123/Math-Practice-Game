import { getSupabase } from "../lib/api/db-pool.js";
import { apiError, handleApiError } from "../lib/api/errors.js";
import { logger } from "../lib/api/logger.js";
import { GetHallOfFameDatesQuerySchema, validate } from "../lib/api/validation.js";
import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "GET") {
      return apiError(res, 405, "Method Not Allowed");
    }

    validate(GetHallOfFameDatesQuerySchema, req.query);

    logger.log("[api/get-hall-of-fame-dates] Fetching from database...");
    const supabase = getSupabase();

    const { data, error } = await supabase
      .from("hall_of_fame")
      .select("year, month")
      .order("year", { ascending: false })
      .order("month", { ascending: false });

    if (error) {
      throw error;
    }

    const seen = new Set<string>();
    const grouped = (data || []).reduce<Record<number, number[]>>((acc, row) => {
      const key = `${row.year}-${row.month}`;
      if (seen.has(key)) return acc;
      seen.add(key);

      const year = row.year as number;
      const month = row.month as number;
      if (!acc[year]) {
        acc[year] = [];
      }
      acc[year].push(month);
      return acc;
    }, {});

    return res.status(200).json(grouped);
  } catch (error) {
    return handleApiError(res, "api/get-hall-of-fame-dates", "Validation/DB hall of fame dates retrieval failed", error);
  }
}
