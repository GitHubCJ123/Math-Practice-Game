import sql from "mssql";
import { getPool } from "./db-pool.js";

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
    const pool = await getPool();
    const request = pool.request();
    request.input('operationType', sql.NVarChar, operationType);
    request.input('year', sql.Int, yearNum);
    request.input('month', sql.Int, monthNum);

    const result = await request.query(`
      SELECT PlayerName, Score
      FROM HallOfFame
      WHERE OperationType = @operationType AND Year = @year AND Month = @month
      ORDER BY Score ASC;
    `);

    const hallOfFame = result.recordset.map((row) => ({
      playerName: row.PlayerName,
      score: row.Score,
    }));

    return res.status(200).json(hallOfFame);
  } catch (error) {
    console.error('[api/get-hall-of-fame] Error handling request', error);
    return res.status(500).json({ message: 'Error executing query', error: error.message });
  }
}
