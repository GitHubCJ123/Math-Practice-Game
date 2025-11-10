import sql from 'mssql';
import { getPool } from '../db-pool.js';

export default async function handler(req: any, res: any) {
  console.log('[api/games/cleanup] Function invoked.');
  console.log('[api/games/cleanup] Request body:', req.body);
  
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

    // Verify player is in the game
    const verifyRequest = new sql.Request(transaction);
    verifyRequest.input('gameId', sql.Int, gameId);
    verifyRequest.input('sessionId', sql.NVarChar, sessionId);
    const playerResult = await verifyRequest.query(`
      SELECT Id FROM GamePlayers
      WHERE GameId = @gameId AND PlayerSessionId = @sessionId
    `);

    if (playerResult.recordset.length === 0) {
      await transaction.rollback();
      return res.status(403).json({ message: 'Player not found in game' });
    }

    // Delete all players first (foreign key constraint)
    const deletePlayersRequest = new sql.Request(transaction);
    deletePlayersRequest.input('gameId', sql.Int, gameId);
    await deletePlayersRequest.query(`
      DELETE FROM GamePlayers WHERE GameId = @gameId
    `);

    // Delete the game
    const deleteGameRequest = new sql.Request(transaction);
    deleteGameRequest.input('gameId', sql.Int, gameId);
    await deleteGameRequest.query(`
      DELETE FROM Games WHERE Id = @gameId
    `);

    await transaction.commit();

    console.log(`[api/games/cleanup] Deleted game ${gameId}`);

    return res.status(200).json({ 
      success: true,
      message: 'Game deleted successfully'
    });
  } catch (error) {
    if (transaction) {
      try {
        await transaction.rollback();
      } catch (rollbackError) {
        console.error('[api/games/cleanup] Failed to rollback transaction', rollbackError);
      }
    }
    console.error('[api/games/cleanup] Error:', error);
    return res.status(500).json({ message: 'Failed to delete game', error: error.message });
  }
}

