import { getSupabase } from "../lib/api/db-pool.js";

const CACHE_CONTROL_HEADER = "public, max-age=60";

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const { operationType, year, month } = req.query;

  if (!operationType || typeof operationType !== 'string' || !year || !month) {
    return res.status(400).json({ message: 'operationType, year, and month query parameters are required' });
  }

  const yearNum = parseInt(year as string, 10);
  const monthNum = parseInt(month as string, 10);

  if (Number.isNaN(yearNum) || Number.isNaN(monthNum)) {
    return res.status(400).json({ message: 'year and month must be valid numbers' });
  }

  try {
    const supabase = getSupabase();

    const { data, error } = await supabase
      .from('hall_of_fame')
      .select('player_name, score')
      .eq('operation_type', operationType)
      .eq('year', yearNum)
      .eq('month', monthNum)
      .order('score', { ascending: true });

    if (error) {
      throw error;
    }

    const hallOfFame = (data || []).map((row) => ({
      playerName: row.player_name,
      score: row.score,
    }));

    res.setHeader('Cache-Control', CACHE_CONTROL_HEADER);
    return res.status(200).json(hallOfFame);
  } catch (error) {
    console.error('[api/get-hall-of-fame] Error handling request', error);
    return res.status(500).json({ message: 'Error executing query', error: error.message });
  }
}
