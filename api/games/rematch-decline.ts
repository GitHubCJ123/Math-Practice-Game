import sql from 'mssql';
import { getPool } from '../db-pool.js';
import { getPusherInstance } from '../pusher-utils.js';

export default async function handler(req: any, res: any) {
  console.log('[api/games/rematch-decline] Function invoked.');
  console.log('[api/games/rematch-decline] Request body:', req.body);
  
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const { gameId, sessionId } = req.body;

  if (!gameId || isNaN(gameId)) {
    return res.status(400).json({ message: 'Valid gameId is required' });
  }

  if (!sessionId || typeof sessionId !== 'string') {
    return res.status(400).json({ message: 'sessionId is required' });
  }

  let transaction: sql.Transaction | null = null;
  try {
    const pool = await getPool();
    transaction = new sql.Transaction(pool);
    await transaction.begin();

    // Get game info
    const getGameRequest = new sql.Request(transaction);
    getGameRequest.input('gameId', sql.Int, gameId);
    const gameResult = await getGameRequest.query(`
      SELECT Id, RoomCode, Status
      FROM Games
      WHERE Id = @gameId
    `);

    if (gameResult.recordset.length === 0) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Game not found' });
    }

    const game = gameResult.recordset[0];
    
    // Reset game status
    const updateGameRequest = new sql.Request(transaction);
    updateGameRequest.input('gameId', sql.Int, gameId);
    await updateGameRequest.query(`
      UPDATE Games
      SET Status = 'completed', UpdatedAt = GETUTCDATE()
      WHERE Id = @gameId
    `);

    await transaction.commit();

    // Notify both players that rematch was declined
    const pusher = getPusherInstance();
    console.log('[api/games/rematch-decline] Triggering rematch-declined event to room:', game.RoomCode);
    await pusher.trigger(`private-game-${game.RoomCode}`, 'rematch-declined', {
      decliningSessionId: sessionId,
      gameId: game.Id,
      reason: 'declined',
    });

    return res.status(200).json({ 
      success: true,
      message: 'Rematch declined',
    });
  } catch (error: any) {
    if (transaction) {
      try {
        await transaction.rollback();
      } catch (rollbackError) {
        console.error('[api/games/rematch-decline] Failed to rollback transaction', rollbackError);
      }
    }
    console.error('[api/games/rematch-decline] Error:', error);
    return res.status(500).json({ message: 'Failed to decline rematch', error: error.message });
  }
}

