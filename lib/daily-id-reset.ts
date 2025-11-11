import sql from 'mssql';
import { getPool } from './db-pool.js';
import { getCurrentEasternDayBounds } from './time-utils.js';

/**
 * Checks if we're in a new EST day and resets the Games table IDENTITY seed if needed.
 * This ensures game IDs start from 1 each day in Eastern time.
 * Must be called before starting a transaction, as DBCC CHECKIDENT cannot run in a transaction.
 * 
 * Automatically deletes all games and players from previous EST days before resetting
 * to prevent primary key conflicts when IDs reset to 1.
 */
export async function ensureDailyIdReset(): Promise<void> {
  const pool = await getPool();
  
  const dayBounds = getCurrentEasternDayBounds();
  const currentEasternDate = dayBounds.dayIdentifier; // Format: YYYY-MM-DD
  const currentEasternDateObj = new Date(dayBounds.startUtc);
  
  const checkResetRequest = pool.request();
  checkResetRequest.input('currentDate', sql.Date, currentEasternDateObj);
  
  // Check if reset table exists and get last reset date
  let needsReset = true;
  try {
    const resetCheckResult = await checkResetRequest.query(`
      SELECT TOP 1 LastResetDate
      FROM DailyGameSequenceReset
      WHERE LastResetDate = @currentDate
    `);
    
    needsReset = resetCheckResult.recordset.length === 0;
  } catch (error) {
    // Table might not exist yet, that's okay - we'll create it during reset
    console.log('[ensureDailyIdReset] DailyGameSequenceReset table may not exist yet, will create during reset.');
    needsReset = true;
  }
  
  if (needsReset) {
    console.log(`[ensureDailyIdReset] New EST day detected (${currentEasternDate}). Cleaning up old games and resetting game ID sequence.`);
    
    // Clean up games from previous days before resetting IDENTITY seed
    // This prevents primary key conflicts when IDs reset to 1
    try {
      const dayStartUtc = dayBounds.startUtc; // Start of current EST day in UTC
      
      const cleanupRequest = pool.request();
      cleanupRequest.input('dayStartUtc', sql.DateTime2, dayStartUtc);
      
      // First, delete all GamePlayers for games created before today (EST)
      const deletePlayersResult = await cleanupRequest.query(`
        DELETE FROM GamePlayers
        WHERE GameId IN (
          SELECT Id FROM Games WHERE CreatedAt < @dayStartUtc
        )
      `);
      
      const deletedPlayersCount = deletePlayersResult.rowsAffected[0] || 0;
      console.log(`[ensureDailyIdReset] Deleted ${deletedPlayersCount} player records from old games.`);
      
      // Then delete the old games themselves
      const deleteGamesRequest = pool.request();
      deleteGamesRequest.input('dayStartUtc', sql.DateTime2, dayStartUtc);
      const deleteGamesResult = await deleteGamesRequest.query(`
        DELETE FROM Games
        WHERE CreatedAt < @dayStartUtc
      `);
      
      const deletedGamesCount = deleteGamesResult.rowsAffected[0] || 0;
      console.log(`[ensureDailyIdReset] Deleted ${deletedGamesCount} old games from previous days.`);
      
    } catch (cleanupError) {
      // If cleanup fails, log but continue - we'll still try to reset
      console.error('[ensureDailyIdReset] Error during cleanup of old games:', cleanupError);
      console.log('[ensureDailyIdReset] Continuing with IDENTITY reset anyway...');
    }
    
    // Reset the IDENTITY seed to 0 (next insert will be 1)
    // Note: DBCC CHECKIDENT cannot run in a transaction
    try {
      const resetRequest = pool.request();
      await resetRequest.query(`
        DBCC CHECKIDENT ('Games', RESEED, 0);
      `);
      console.log('[ensureDailyIdReset] IDENTITY seed reset to 0 (next game will have ID 1).');
    } catch (resetError) {
      // If reset fails (e.g., table is empty), that's okay - first insert will be 1 anyway
      console.log('[ensureDailyIdReset] Note: IDENTITY reset may have failed (table might be empty), continuing anyway.');
    }
    
    // Update or insert the reset tracking record
    try {
      const updateResetRequest = pool.request();
      updateResetRequest.input('resetDate', sql.Date, currentEasternDateObj);
      await updateResetRequest.query(`
        IF EXISTS (SELECT 1 FROM DailyGameSequenceReset WHERE LastResetDate = @resetDate)
        BEGIN
          UPDATE DailyGameSequenceReset 
          SET ResetAt = GETUTCDATE()
          WHERE LastResetDate = @resetDate;
        END
        ELSE
        BEGIN
          INSERT INTO DailyGameSequenceReset (LastResetDate)
          VALUES (@resetDate);
        END
      `);
    } catch (updateError) {
      // If table doesn't exist, log but don't fail - migration should create it
      console.warn('[ensureDailyIdReset] Could not update DailyGameSequenceReset table. Make sure migration has been run.');
    }
    
    console.log(`[ensureDailyIdReset] Game ID sequence reset completed for ${currentEasternDate}.`);
  }
}

