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
      SELECT RoomCode, Questions, Status, CreatedAt
      FROM Games
      WHERE Id = @gameId
    `);

    if (gameResult.recordset.length === 0) {
      return res.status(404).json({ message: 'Game not found' });
    }

    const game = gameResult.recordset[0];
    const questions = JSON.parse(game.Questions || '[]');
    
    // Calculate startTime based on when game status was set to 'in_progress'
    // The startTime is calculated as CreatedAt + ~time until status update + 12 seconds
    // For accuracy, we'll estimate it was set ~1 second after creation, then add 12 seconds
    // This matches the logic in random.ts: startTime = Date.now() + 12000
    const createdAt = new Date(game.CreatedAt).getTime();
    // Estimate: game was created, then status updated ~1 second later, then startTime = that time + 12000
    // So startTime ≈ createdAt + 1000 + 12000 = createdAt + 13000
    // But to be safe, let's use a more conservative estimate
    const startTime = createdAt + 13000; // Should be close to the actual startTime

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

