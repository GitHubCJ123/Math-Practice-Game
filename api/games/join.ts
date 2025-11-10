import sql from 'mssql';
import { getPool } from '../db-pool.js';
import { generateSessionId, getPusherInstance } from '../pusher-utils.js';
import { generateQuestions } from '../question-generator.js';
import type { Operation } from '../../types';

export default async function handler(req: any, res: any) {
  console.log('[api/games/join] Function invoked.');
  console.log('[api/games/join] Request body:', req.body);
  
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const { roomCode, operation, selectedNumbers } = req.body;

  if (!roomCode || typeof roomCode !== 'string' || roomCode.length !== 6) {
    return res.status(400).json({ message: 'Valid roomCode is required' });
  }

  if (!operation || !selectedNumbers || !Array.isArray(selectedNumbers)) {
    return res.status(400).json({ message: 'operation and selectedNumbers are required' });
  }

  let transaction: sql.Transaction | null = null;
  try {
    const pool = await getPool();
    transaction = new sql.Transaction(pool);
    await transaction.begin();

    // Find the game (case-insensitive search)
    const findGameRequest = new sql.Request(transaction);
    findGameRequest.input('roomCode', sql.NVarChar, roomCode.toUpperCase());
    const gameResult = await findGameRequest.query(`
      SELECT Id, Status, Questions
      FROM Games
      WHERE UPPER(RoomCode) = UPPER(@roomCode)
    `);

    console.log('[api/games/join] Found games:', gameResult.recordset.length);

    if (gameResult.recordset.length === 0) {
      await transaction.rollback();
      return res.status(404).json({ message: `Game with code "${roomCode.toUpperCase()}" not found. Make sure the code is correct and the game hasn't expired.` });
    }

    const game = gameResult.recordset[0];

    if (game.Status !== 'waiting') {
      await transaction.rollback();
      return res.status(400).json({ message: 'Game is not waiting for players' });
    }

    // Check how many players are already in the game
    const countPlayersRequest = new sql.Request(transaction);
    countPlayersRequest.input('gameId', sql.Int, game.Id);
    const playerCountResult = await countPlayersRequest.query(`
      SELECT COUNT(*) as count
      FROM GamePlayers
      WHERE GameId = @gameId
    `);

    const playerCount = playerCountResult.recordset[0].count;
    if (playerCount >= 2) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Game is full' });
    }

    // Add the new player
    const sessionId = generateSessionId();
    const addPlayerRequest = new sql.Request(transaction);
    addPlayerRequest.input('gameId', sql.Int, game.Id);
    addPlayerRequest.input('sessionId', sql.NVarChar, sessionId);
    await addPlayerRequest.query(`
      INSERT INTO GamePlayers (GameId, PlayerSessionId, Status)
      VALUES (@gameId, @sessionId, 'playing');
    `);

    // Store operation and selectedNumbers for when the game starts
    // We'll generate questions when the host starts the game
    const gameSettingsJson = JSON.stringify({ operation, selectedNumbers });

    const updateGameRequest = new sql.Request(transaction);
    updateGameRequest.input('gameId', sql.Int, game.Id);
    updateGameRequest.input('gameSettings', sql.NVarChar, gameSettingsJson);
    await updateGameRequest.query(`
      UPDATE Games
      SET Questions = @gameSettings, UpdatedAt = GETUTCDATE()
      WHERE Id = @gameId
    `);

    await transaction.commit();

    // Trigger Pusher event to notify that opponent joined (don't start game yet)
    const pusher = getPusherInstance();
    await pusher.trigger(`private-game-${roomCode.toUpperCase()}`, 'opponent-joined', {
      gameId: game.Id,
    });

    res.setHeader('Set-Cookie', `gameSession=${sessionId}; Path=/; HttpOnly; SameSite=Lax`);

    return res.status(200).json({ 
      success: true, 
      gameId: game.Id,
      sessionId,
      roomCode: roomCode.toUpperCase(),
    });
  } catch (error) {
    if (transaction) {
      try {
        await transaction.rollback();
      } catch (rollbackError) {
        console.error('[api/games/join] Failed to rollback transaction', rollbackError);
      }
    }
    console.error('[api/games/join] Error:', error);
    return res.status(500).json({ message: 'Failed to join game', error: error.message });
  }
}

