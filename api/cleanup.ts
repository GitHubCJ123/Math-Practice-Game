import sql from 'mssql';
import { getPool } from '../lib/db-pool.js';

export default async function handler(req: any, res: any) {
  // Get action from query or body, or detect from cron
  const action = req.query.action || req.body.action;

  // If no action specified, check if it's a cron job (cleanup-abandoned)
  if (!action) {
    // Check if this is a cron job call
    if (req.headers.authorization === `Bearer ${process.env.CRON_SECRET}` && req.method === 'POST') {
      return handleCleanupAbandoned(req, res);
    }
    return res.status(400).json({ message: 'action parameter is required' });
  }

  console.log(`[api/cleanup] Function invoked with action: ${action}`);

  // Route to appropriate handler based on action
  switch (action) {
    case 'cleanup':
      return handleCleanup(req, res);
    case 'cleanup-abandoned':
      return handleCleanupAbandoned(req, res);
    default:
      return res.status(400).json({ message: `Unknown action: ${action}` });
  }
}

async function handleCleanup(req: any, res: any) {
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

    const deletePlayersRequest = new sql.Request(transaction);
    deletePlayersRequest.input('gameId', sql.Int, gameId);
    await deletePlayersRequest.query(`
      DELETE FROM GamePlayers WHERE GameId = @gameId
    `);

    const deleteGameRequest = new sql.Request(transaction);
    deleteGameRequest.input('gameId', sql.Int, gameId);
    await deleteGameRequest.query(`
      DELETE FROM Games WHERE Id = @gameId
    `);

    await transaction.commit();

    console.log(`[api/cleanup] Deleted game ${gameId}`);

    return res.status(200).json({ 
      success: true,
      message: 'Game deleted successfully'
    });
  } catch (error) {
    if (transaction) {
      try {
        await transaction.rollback();
      } catch (rollbackError) {
        console.error('[api/cleanup] Failed to rollback transaction', rollbackError);
      }
    }
    console.error('[api/cleanup] Error:', error);
    return res.status(500).json({ message: 'Failed to delete game', error: error.message });
  }
}

async function handleCleanupAbandoned(req: any, res: any) {
  // Verify this is a cron job
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  let transaction: sql.Transaction | null = null;
  try {
    const pool = await getPool();
    transaction = new sql.Transaction(pool);
    await transaction.begin();

    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    const findAbandonedRequest = new sql.Request(transaction);
    findAbandonedRequest.input('cutoffTime', sql.DateTime2, fiveMinutesAgo);
    
    const abandonedGamesResult = await findAbandonedRequest.query(`
      SELECT Id
      FROM Games
      WHERE CreatedAt < @cutoffTime
    `);

    const abandonedGameIds = abandonedGamesResult.recordset.map((row: any) => row.Id);
    
    if (abandonedGameIds.length === 0) {
      await transaction.commit();
      console.log('[api/cleanup] No abandoned games found.');
      return res.status(200).json({ 
        success: true,
        message: 'No abandoned games found',
        deletedCount: 0
      });
    }

    console.log(`[api/cleanup] Found ${abandonedGameIds.length} abandoned games to delete.`);

    const deletePlayersRequest = new sql.Request(transaction);
    deletePlayersRequest.input('cutoffTime', sql.DateTime2, fiveMinutesAgo);
    const deletePlayersResult = await deletePlayersRequest.query(`
      DELETE FROM GamePlayers
      WHERE GameId IN (
        SELECT Id FROM Games WHERE CreatedAt < @cutoffTime
      )
    `);
    
    const deletedPlayersCount = deletePlayersResult.rowsAffected[0] || 0;
    console.log(`[api/cleanup] Deleted ${deletedPlayersCount} player records.`);

    const deleteGamesRequest = new sql.Request(transaction);
    deleteGamesRequest.input('cutoffTime', sql.DateTime2, fiveMinutesAgo);
    const deleteGamesResult = await deleteGamesRequest.query(`
      DELETE FROM Games
      WHERE CreatedAt < @cutoffTime
    `);

    const deletedGamesCount = deleteGamesResult.rowsAffected[0] || 0;
    console.log(`[api/cleanup] Deleted ${deletedGamesCount} abandoned games.`);

    const deleteQueueRequest = new sql.Request(transaction);
    deleteQueueRequest.input('cutoffTime', sql.DateTime2, fiveMinutesAgo);
    const deleteQueueResult = await deleteQueueRequest.query(`
      DELETE FROM MatchmakingQueue
      WHERE CreatedAt < @cutoffTime
    `);

    const deletedQueueCount = deleteQueueResult.rowsAffected[0] || 0;
    console.log(`[api/cleanup] Deleted ${deletedQueueCount} abandoned matchmaking queue entries.`);

    await transaction.commit();

    return res.status(200).json({ 
      success: true,
      message: `Cleaned up ${deletedGamesCount} abandoned games`,
      deletedCount: deletedGamesCount,
      deletedPlayersCount: deletedPlayersCount,
      deletedQueueCount: deletedQueueCount
    });
  } catch (error) {
    if (transaction) {
      try {
        await transaction.rollback();
      } catch (rollbackError) {
        console.error('[api/cleanup] Failed to rollback transaction', rollbackError);
      }
    }
    console.error('[api/cleanup] Error:', error);
    return res.status(500).json({ message: 'Failed to cleanup abandoned games', error: error.message });
  }
}

