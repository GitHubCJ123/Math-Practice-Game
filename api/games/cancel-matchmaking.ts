import sql from 'mssql';
import { getPool } from '../db-pool.js';

export default async function handler(req: any, res: any) {
  console.log('[api/games/cancel-matchmaking] Function invoked.');
  
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const { sessionId } = req.body;

  if (!sessionId) {
    return res.status(400).json({ message: 'sessionId is required' });
  }

  try {
    const pool = await getPool();
    const request = pool.request();
    request.input('sessionId', sql.NVarChar, sessionId);
    
    await request.query(`
      DELETE FROM MatchmakingQueue
      WHERE PlayerSessionId = @sessionId
    `);

    return res.status(200).json({ message: 'Removed from matchmaking queue' });
  } catch (error) {
    console.error('[api/games/cancel-matchmaking] Error:', error);
    return res.status(500).json({ message: 'Failed to cancel matchmaking', error: error.message });
  }
}

