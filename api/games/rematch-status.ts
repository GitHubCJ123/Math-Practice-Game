import sql from 'mssql';
import { getPool } from '../db-pool.js';

export default async function handler(req: any, res: any) {
  console.log('[api/games/rematch-status] Function invoked.');
  
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
    const gameRequest = pool.request();
    gameRequest.input('gameId', sql.Int, parseInt(gameId, 10));
    
    const gameResult = await gameRequest.query(`
      SELECT Status
      FROM Games
      WHERE Id = @gameId
    `);

    if (gameResult.recordset.length === 0) {
      return res.status(404).json({ message: 'Game not found' });
    }

    const status = gameResult.recordset[0].Status;
    
    // Check rematch status
    if (status === 'rematch_requested') {
      // Get the requesting sessionId from GamePlayers table (player with status 'play_again' or check UpdatedAt)
      // For simplicity, we'll check if this player is waiting or if opponent requested
      const playersRequest = pool.request();
      playersRequest.input('gameId', sql.Int, parseInt(gameId, 10));
      const playersResult = await playersRequest.query(`
        SELECT PlayerSessionId, Status, UpdatedAt
        FROM GamePlayers
        WHERE GameId = @gameId
        ORDER BY UpdatedAt DESC
      `);
      
      // Find who requested rematch (first player to update after game completion)
      // Actually, we'll use Pusher events to track this, so just return pending_acceptance for opponent
      // and waiting for requester
      const playerRequested = playersResult.recordset.find((p: any) => p.PlayerSessionId === sessionId);
      const opponentRequested = playersResult.recordset.find((p: any) => p.PlayerSessionId !== sessionId);
      
      // Simple check: if we're checking status, we're likely the requester waiting
      // The opponent will see the Pusher event and can accept
      return res.status(200).json({
        status: 'waiting',
      });
    } else if (status === 'rematch_accepted') {
      return res.status(200).json({
        status: 'accepted',
      });
    } else {
      return res.status(200).json({
        status: 'none',
      });
    }
  } catch (error: any) {
    console.error('[api/games/rematch-status] Error:', error);
    return res.status(500).json({ message: 'Failed to get rematch status', error: error.message });
  }
}

