import sql from 'mssql';
import { getPool } from '../db-pool.js';

export default async function handler(req: any, res: any) {
  console.log('[api/games/play-again-status] Function invoked.');
  
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const { gameId, sessionId } = req.query;

  if (!gameId || isNaN(parseInt(gameId, 10))) {
    return res.status(400).json({ message: 'Valid gameId is required' });
  }

  if (!sessionId || typeof sessionId !== 'string') {
    return res.status(400).json({ message: 'sessionId is required' });
  }

  try {
    const pool = await getPool();
    const playersRequest = pool.request();
    playersRequest.input('gameId', sql.Int, parseInt(gameId, 10));
    
    const playersResult = await playersRequest.query(`
      SELECT PlayerSessionId, Status
      FROM GamePlayers
      WHERE GameId = @gameId
    `);

    let playAgainCount = 0;
    let hasClicked = false;

    for (const p of playersResult.recordset) {
      if (p.Status === 'play_again') {
        playAgainCount++;
        if (p.PlayerSessionId === sessionId) {
          hasClicked = true;
        }
      }
    }

    return res.status(200).json({
      count: playAgainCount,
      hasClicked,
    });
  } catch (error) {
    console.error('[api/games/play-again-status] Error:', error);
    return res.status(500).json({ message: 'Failed to get play again status', error: error.message });
  }
}

