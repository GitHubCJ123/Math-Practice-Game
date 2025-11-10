import sql from 'mssql';
import { getPool } from '../db-pool.js';
import { generateRoomCode, generateSessionId } from '../pusher-utils.js';
import { ensureDailyIdReset } from '../daily-id-reset.js';

export default async function handler(req: any, res: any) {
  console.log('[api/games/create] Function invoked.');
  
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  let transaction: sql.Transaction | null = null;
  try {
    const pool = await getPool();
    
    // Check if we need to reset the IDENTITY seed for a new EST day
    // This must be done outside of a transaction since DBCC CHECKIDENT cannot run in a transaction
    await ensureDailyIdReset();
    
    transaction = new sql.Transaction(pool);
    await transaction.begin();

    // Generate a unique room code
    let roomCode = generateRoomCode();
    let attempts = 0;
    let roomCodeExists = true;

    // Ensure room code is unique
    while (roomCodeExists && attempts < 10) {
      const checkRequest = new sql.Request(transaction);
      checkRequest.input('roomCode', sql.NVarChar, roomCode);
      const result = await checkRequest.query(`
        SELECT COUNT(*) as count FROM Games WHERE RoomCode = @roomCode
      `);
      
      if (result.recordset[0].count === 0) {
        roomCodeExists = false;
      } else {
        roomCode = generateRoomCode();
        attempts++;
      }
    }

    if (roomCodeExists) {
      await transaction.rollback();
      return res.status(500).json({ message: 'Failed to generate unique room code' });
    }

    // Create game
    const createGameRequest = new sql.Request(transaction);
    createGameRequest.input('roomCode', sql.NVarChar, roomCode);
    const gameResult = await createGameRequest.query(`
      INSERT INTO Games (RoomCode, Status)
      OUTPUT INSERTED.Id
      VALUES (@roomCode, 'waiting');
    `);

    const gameId = gameResult.recordset[0].Id;

    // Create player record
    const sessionId = generateSessionId();
    const createPlayerRequest = new sql.Request(transaction);
    createPlayerRequest.input('gameId', sql.Int, gameId);
    createPlayerRequest.input('sessionId', sql.NVarChar, sessionId);
    await createPlayerRequest.query(`
      INSERT INTO GamePlayers (GameId, PlayerSessionId, Status)
      VALUES (@gameId, @sessionId, 'playing');
    `);

    await transaction.commit();

    // Set session ID in response header/cookie for client to use
    res.setHeader('Set-Cookie', `gameSession=${sessionId}; Path=/; HttpOnly; SameSite=Lax`);

    return res.status(201).json({ 
      gameId, 
      roomCode,
      sessionId 
    });
  } catch (error) {
    if (transaction) {
      try {
        await transaction.rollback();
      } catch (rollbackError) {
        console.error('[api/games/create] Failed to rollback transaction', rollbackError);
      }
    }
    console.error('[api/games/create] Error:', error);
    return res.status(500).json({ message: 'Failed to create game', error: error.message });
  }
}

