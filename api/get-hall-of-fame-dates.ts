import sql from "mssql";
import { getPool } from "./db-pool";

const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_CONTROL_HEADER = "public, max-age=300";

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
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT DISTINCT Year, Month
      FROM HallOfFame
      ORDER BY Year DESC, Month DESC;
    `);

    const grouped = result.recordset.reduce<Record<number, number[]>>((acc, row) => {
      const year = row.Year as number;
      const month = row.Month as number;
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
