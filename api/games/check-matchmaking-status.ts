import sql from 'mssql';
import { getPool } from '../db-pool.js';

export default async function handler(req: any, res: any) {
  console.log('[api/games/check-matchmaking-status] Function invoked.');
  
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const { sessionId } = req.query;

  if (!sessionId) {
    return res.status(400).json({ message: 'sessionId is required' });
  }

  try {
    const pool = await getPool();
    
    // Check if player is still in matchmaking queue
    const queueCheckRequest = pool.request();
    queueCheckRequest.input('sessionId', sql.NVarChar, sessionId);
    const queueResult = await queueCheckRequest.query(`
      SELECT COUNT(*) as count
      FROM MatchmakingQueue
      WHERE PlayerSessionId = @sessionId
    `);

    const inQueue = queueResult.recordset[0].count > 0;

    if (inQueue) {
      // Still in queue, not matched yet
      return res.status(200).json({ matched: false });
    }

    // Not in queue, check if they're in a game
    const gameCheckRequest = pool.request();
    gameCheckRequest.input('sessionId', sql.NVarChar, sessionId);
    const gameResult = await gameCheckRequest.query(`
      SELECT TOP 1 g.Id as GameId, g.RoomCode, g.Status
      FROM Games g
      INNER JOIN GamePlayers gp ON g.Id = gp.GameId
      WHERE gp.PlayerSessionId = @sessionId
        AND g.Status IN ('waiting', 'in_progress')
      ORDER BY g.CreatedAt DESC
    `);

    if (gameResult.recordset.length > 0) {
      const game = gameResult.recordset[0];
      return res.status(200).json({ 
        matched: true,
        gameId: game.GameId,
        roomCode: game.RoomCode,
      });
    }

    // Not matched and not in a game
    return res.status(200).json({ matched: false });
  } catch (error: any) {
    console.error('[api/games/check-matchmaking-status] Error:', error);
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
}

