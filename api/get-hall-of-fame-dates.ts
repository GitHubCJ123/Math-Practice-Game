import { getSupabase } from "../lib/api/db-pool.js";
import { apiError, handleApiError } from "../lib/api/errors.js";
import { GetHallOfFameDatesQuerySchema, validate } from "../lib/api/validation.js";
import type { VercelRequest, VercelResponse } from "@vercel/node";

const CACHE_TTL_MS = 60 * 1000;
const CACHE_CONTROL_HEADER = "public, max-age=60";

let cache: { expiresAt: number; payload: Record<number, number[]> } | null = null;

export function clearHallOfFameDatesCache() {
  cache = null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "GET") {
      return apiError(res, 405, "Method Not Allowed");
    }

    validate(GetHallOfFameDatesQuerySchema, req.query);

    const now = Date.now();
    if (cache && cache.expiresAt > now) {
      console.log("[api/get-hall-of-fame-dates] Serving from cache.");
      res.setHeader("Cache-Control", CACHE_CONTROL_HEADER);
      return res.status(200).json(cache.payload);
    }

    console.log("[api/get-hall-of-fame-dates] Fetching from database...");
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

    cache = {
      expiresAt: now + CACHE_TTL_MS,
      payload: grouped,
    };

    res.setHeader("Cache-Control", CACHE_CONTROL_HEADER);
    return res.status(200).json(grouped);
  } catch (error) {
    return handleApiError(res, "api/get-hall-of-fame-dates", "Validation/DB hall of fame dates retrieval failed", error);
  }
}
