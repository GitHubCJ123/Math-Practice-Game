import sql from 'mssql';
import { getPool } from '../db-pool.js';

export default async function handler(req: any, res: any) {
  console.log('[api/games/get-game-info] Function invoked.');
  
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const { gameId, sessionId } = req.query;

  if (!gameId || !sessionId) {
    return res.status(400).json({ message: 'gameId and sessionId are required' });
  }

  try {
    const pool = await getPool();
    
    // Verify player is in the game
    const verifyRequest = pool.request();
    verifyRequest.input('gameId', sql.Int, parseInt(gameId as string, 10));
    verifyRequest.input('sessionId', sql.NVarChar, sessionId);
    const verifyResult = await verifyRequest.query(`
      SELECT COUNT(*) as count
      FROM GamePlayers
      WHERE GameId = @gameId AND PlayerSessionId = @sessionId
    `);

    if (verifyResult.recordset[0].count === 0) {
      return res.status(403).json({ message: 'Player not in game' });
    }

    // Get game info
    const gameRequest = pool.request();
    gameRequest.input('gameId', sql.Int, parseInt(gameId as string, 10));
    const gameResult = await gameRequest.query(`
      SELECT RoomCode, Questions, Status, CreatedAt, StartTime
      FROM Games
      WHERE Id = @gameId
    `);

    if (gameResult.recordset.length === 0) {
      return res.status(404).json({ message: 'Game not found' });
    }

    const game = gameResult.recordset[0];
    const questions = JSON.parse(game.Questions || '[]');
    
    // Use the stored StartTime if available (set when match was found in random.ts)
    // This ensures synchronization - both players use the exact same startTime that was
    // calculated at match time and sent via Pusher
    let startTime: number;
    if (game.StartTime !== null && game.StartTime !== undefined) {
      // Use the stored synchronized startTime
      startTime = game.StartTime;
    } else {
      // Fallback for games created before StartTime column was added
      // Calculate based on CreatedAt (less accurate but better than nothing)
      const createdAt = new Date(game.CreatedAt).getTime();
      startTime = createdAt + 13000;
      console.warn('[api/games/get-game-info] StartTime not stored, using fallback calculation:', startTime);
    }

    return res.status(200).json({
      roomCode: game.RoomCode,
      questions,
      startTime,
      status: game.Status,
    });
  } catch (error: any) {
    console.error('[api/games/get-game-info] Error:', error);
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
}

