import { getSupabase } from "../lib/api/db-pool.js";

const CACHE_TTL_MS = 60 * 1000; // 1 minute
const CACHE_CONTROL_HEADER = "public, max-age=60";

let cache: { expiresAt: number; payload: Record<number, number[]> } | null = null;

export function clearHallOfFameDatesCache() {
  cache = null;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const now = Date.now();
  if (cache && cache.expiresAt > now) {
    console.log('[api/get-hall-of-fame-dates] Serving from cache.');
    res.setHeader('Cache-Control', CACHE_CONTROL_HEADER);
    return res.status(200).json(cache.payload);
  }

  try {
    console.log('[api/get-hall-of-fame-dates] Fetching from database...');
    const supabase = getSupabase();

    const { data, error } = await supabase
      .from('hall_of_fame')
      .select('year, month')
      .order('year', { ascending: false })
      .order('month', { ascending: false });

    if (error) {
      throw error;
    }

    // Get distinct year/month combinations
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

    res.setHeader('Cache-Control', CACHE_CONTROL_HEADER);
    return res.status(200).json(grouped);
  } catch (error) {
    console.error('[api/get-hall-of-fame-dates] Error handling request', error);
    return res.status(500).json({ message: 'Error executing query', error: error.message });
  }
}
