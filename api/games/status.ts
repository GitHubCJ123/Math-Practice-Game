import sql from 'mssql';
import { getPool } from '../db-pool.js';

export default async function handler(req: any, res: any) {
  console.log('[api/games/status] Function invoked.');
  
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const { gameId, sessionId } = req.query;

  if (!gameId || isNaN(parseInt(gameId, 10))) {
    return res.status(400).json({ message: 'Valid gameId is required' });
  }

  try {
    const pool = await getPool();
    const gameRequest = pool.request();
    gameRequest.input('gameId', sql.Int, parseInt(gameId, 10));
    
    const gameResult = await gameRequest.query(`
      SELECT Id, RoomCode, Status, Questions
      FROM Games
      WHERE Id = @gameId
    `);

    if (gameResult.recordset.length === 0) {
      return res.status(404).json({ message: 'Game not found' });
    }

    const game = gameResult.recordset[0];
    const questions = game.Questions ? JSON.parse(game.Questions) : null;

    // Check if player is in the game
    if (sessionId) {
      const playerRequest = pool.request();
      playerRequest.input('gameId', sql.Int, parseInt(gameId, 10));
      playerRequest.input('sessionId', sql.NVarChar, sessionId);
      const playerResult = await playerRequest.query(`
        SELECT PlayerSessionId, Status
        FROM GamePlayers
        WHERE GameId = @gameId AND PlayerSessionId = @sessionId
      `);

      if (playerResult.recordset.length === 0) {
        return res.status(403).json({ message: 'Player not found in game' });
      }
    }

    return res.status(200).json({
      gameId: game.Id,
      roomCode: game.RoomCode,
      status: game.Status,
      questions: questions,
      hasStarted: game.Status === 'in_progress' || game.Status === 'completed',
    });
  } catch (error) {
    console.error('[api/games/status] Error:', error);
    return res.status(500).json({ message: 'Failed to get game status', error: error.message });
  }
}

