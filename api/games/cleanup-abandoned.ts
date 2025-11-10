import sql from 'mssql';
import { getPool } from '../db-pool.js';

/**
 * Cleans up abandoned games that are older than 5 minutes.
 * This handles cases where both players abandon the game without clicking cleanup buttons.
 * 
 * Games are considered abandoned if:
 * - Status is 'in_progress' or 'waiting' and created more than 5 minutes ago
 * - Status is 'completed' and created more than 5 minutes ago (fallback for setTimeout failures)
 */
export default async function handler(req: any, res: any) {
  console.log('[api/games/cleanup-abandoned] Function invoked.');

  // Verify this is a cron job (Vercel cron jobs include Authorization header)
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

    // Calculate cutoff time (5 minutes ago)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    // Find abandoned games (older than 5 minutes, regardless of status)
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
      console.log('[api/games/cleanup-abandoned] No abandoned games found.');
      return res.status(200).json({ 
        success: true,
        message: 'No abandoned games found',
        deletedCount: 0
      });
    }

    console.log(`[api/games/cleanup-abandoned] Found ${abandonedGameIds.length} abandoned games to delete.`);

    // Delete all players first (foreign key constraint)
    const deletePlayersRequest = new sql.Request(transaction);
    deletePlayersRequest.input('cutoffTime', sql.DateTime2, fiveMinutesAgo);
    const deletePlayersResult = await deletePlayersRequest.query(`
      DELETE FROM GamePlayers
      WHERE GameId IN (
        SELECT Id FROM Games WHERE CreatedAt < @cutoffTime
      )
    `);
    
    const deletedPlayersCount = deletePlayersResult.rowsAffected[0] || 0;
    console.log(`[api/games/cleanup-abandoned] Deleted ${deletedPlayersCount} player records.`);

    // Delete the abandoned games
    const deleteGamesRequest = new sql.Request(transaction);
    deleteGamesRequest.input('cutoffTime', sql.DateTime2, fiveMinutesAgo);
    const deleteGamesResult = await deleteGamesRequest.query(`
      DELETE FROM Games
      WHERE CreatedAt < @cutoffTime
    `);

    const deletedGamesCount = deleteGamesResult.rowsAffected[0] || 0;
    console.log(`[api/games/cleanup-abandoned] Deleted ${deletedGamesCount} abandoned games.`);

    // Also clean up abandoned matchmaking queue entries (older than 5 minutes)
    const deleteQueueRequest = new sql.Request(transaction);
    deleteQueueRequest.input('cutoffTime', sql.DateTime2, fiveMinutesAgo);
    const deleteQueueResult = await deleteQueueRequest.query(`
      DELETE FROM MatchmakingQueue
      WHERE CreatedAt < @cutoffTime
    `);

    const deletedQueueCount = deleteQueueResult.rowsAffected[0] || 0;
    console.log(`[api/games/cleanup-abandoned] Deleted ${deletedQueueCount} abandoned matchmaking queue entries.`);

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
        console.error('[api/games/cleanup-abandoned] Failed to rollback transaction', rollbackError);
      }
    }
    console.error('[api/games/cleanup-abandoned] Error:', error);
    return res.status(500).json({ message: 'Failed to cleanup abandoned games', error: error.message });
  }
}

