import sql from 'mssql';
import { getPool } from '../db-pool.js';
import { generateRoomCode, generateSessionId, getPusherInstance } from '../pusher-utils.js';
import { generateQuestions } from '../question-generator.js';
import { ensureDailyIdReset } from '../daily-id-reset.js';
import type { Operation } from '../../types';

export default async function handler(req: any, res: any) {
  console.log('[api/games/random] Function invoked.');
  
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const { operation, selectedNumbers, sessionId } = req.query;

  if (!operation || !selectedNumbers) {
    return res.status(400).json({ message: 'operation and selectedNumbers are required' });
  }

  let selectedNumbersArray: number[];
  try {
    selectedNumbersArray = JSON.parse(selectedNumbers);
  } catch (e) {
    return res.status(400).json({ message: 'selectedNumbers must be a valid JSON array' });
  }

  // Generate session ID if not provided
  const playerSessionId = sessionId || generateSessionId();
  const pusherChannel = `private-matchmaking-${playerSessionId}`;

  let transaction: sql.Transaction | null = null;
  try {
    const pool = await getPool();
    
    // Check if we need to reset the IDENTITY seed for a new EST day
    await ensureDailyIdReset();
    
    transaction = new sql.Transaction(pool);
    await transaction.begin();

    // Check if there's another player waiting in the queue
    const findMatchRequest = new sql.Request(transaction);
    findMatchRequest.input('playerSessionId', sql.NVarChar, playerSessionId);
    const matchResult = await findMatchRequest.query(`
      SELECT TOP 1 Id, PlayerSessionId, Operation, SelectedNumbers, PusherChannel
      FROM MatchmakingQueue
      WHERE PlayerSessionId != @playerSessionId
      ORDER BY CreatedAt ASC
    `);

    if (matchResult.recordset.length > 0) {
      // Found a match! Pair them up
      const matchedPlayer = matchResult.recordset[0];
      
      // Remove both players from queue
      const removeQueueRequest = new sql.Request(transaction);
      removeQueueRequest.input('sessionId1', sql.NVarChar, playerSessionId);
      removeQueueRequest.input('sessionId2', sql.NVarChar, matchedPlayer.PlayerSessionId);
      await removeQueueRequest.query(`
        DELETE FROM MatchmakingQueue
        WHERE PlayerSessionId IN (@sessionId1, @sessionId2)
      `);

      // Create a new game
      let roomCode = generateRoomCode();
      let attempts = 0;
      let roomCodeExists = true;

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

      const createGameRequest = new sql.Request(transaction);
      createGameRequest.input('roomCode', sql.NVarChar, roomCode);
      const gameResult = await createGameRequest.query(`
        INSERT INTO Games (RoomCode, Status)
        OUTPUT INSERTED.Id
        VALUES (@roomCode, 'waiting');
      `);

      const gameId = gameResult.recordset[0].Id;

      // Add both players to the game
      const addPlayer1Request = new sql.Request(transaction);
      addPlayer1Request.input('gameId', sql.Int, gameId);
      addPlayer1Request.input('sessionId', sql.NVarChar, playerSessionId);
      await addPlayer1Request.query(`
        INSERT INTO GamePlayers (GameId, PlayerSessionId, Status)
        VALUES (@gameId, @sessionId, 'playing');
      `);

      const addPlayer2Request = new sql.Request(transaction);
      addPlayer2Request.input('gameId', sql.Int, gameId);
      addPlayer2Request.input('sessionId', sql.NVarChar, matchedPlayer.PlayerSessionId);
      await addPlayer2Request.query(`
        INSERT INTO GamePlayers (GameId, PlayerSessionId, Status)
        VALUES (@gameId, @sessionId, 'playing');
      `);

      // Generate questions and update game status
      const questions = generateQuestions(operation as Operation, selectedNumbersArray);
      const questionsJson = JSON.stringify(questions);

      const updateGameRequest = new sql.Request(transaction);
      updateGameRequest.input('gameId', sql.Int, gameId);
      updateGameRequest.input('questions', sql.NVarChar, questionsJson);
      await updateGameRequest.query(`
        UPDATE Games
        SET Status = 'in_progress', Questions = @questions, UpdatedAt = GETUTCDATE()
        WHERE Id = @gameId
      `);

      await transaction.commit();

      // Calculate start time (12 seconds from now to account for network latency)
      // This ensures Player 1 has time to receive the Pusher event before countdown starts
      // Player 2 will see 12 seconds initially, Player 1 will see ~10 seconds when they receive it
      // Both will finish at the same time
      const startTime = Date.now() + 12000; // 12 seconds from now (10s countdown + 2s buffer for latency)

      // Notify both players via Pusher
      const pusher = getPusherInstance();
      const matchData = {
        gameId,
        roomCode,
        sessionId: playerSessionId,
        questions,
        startTime, // Include synchronized start time
      };

      // Notify the current player
      await pusher.trigger(pusherChannel, 'match-found', matchData);
      
      // Notify the matched player
      await pusher.trigger(matchedPlayer.PusherChannel, 'match-found', {
        ...matchData,
        sessionId: matchedPlayer.PlayerSessionId,
      });

      // Also trigger game-start on the game channel for lobby compatibility
      await pusher.trigger(`private-game-${roomCode}`, 'game-start', {
        questions,
        gameId,
        startTime,
      });

      res.setHeader('Set-Cookie', `gameSession=${playerSessionId}; Path=/; HttpOnly; SameSite=Lax`);

      return res.status(200).json({ 
        gameId, 
        roomCode,
        sessionId: playerSessionId,
        pusherChannel,
        matched: true,
        questions, // Include questions so second player can navigate immediately
        startTime, // Include start time for synchronization
      });
    } else {
      // No match found, add player to queue
      // First, remove any existing entry for this session (in case of re-queue)
      const removeExistingRequest = new sql.Request(transaction);
      removeExistingRequest.input('playerSessionId', sql.NVarChar, playerSessionId);
      await removeExistingRequest.query(`
        DELETE FROM MatchmakingQueue
        WHERE PlayerSessionId = @playerSessionId
      `);

      // Add to queue
      const addToQueueRequest = new sql.Request(transaction);
      addToQueueRequest.input('playerSessionId', sql.NVarChar, playerSessionId);
      addToQueueRequest.input('operation', sql.NVarChar, operation);
      addToQueueRequest.input('selectedNumbers', sql.NVarChar, JSON.stringify(selectedNumbersArray));
      addToQueueRequest.input('pusherChannel', sql.NVarChar, pusherChannel);
      await addToQueueRequest.query(`
        INSERT INTO MatchmakingQueue (PlayerSessionId, Operation, SelectedNumbers, PusherChannel)
        VALUES (@playerSessionId, @operation, @selectedNumbers, @pusherChannel)
      `);

      await transaction.commit();

      res.setHeader('Set-Cookie', `gameSession=${playerSessionId}; Path=/; HttpOnly; SameSite=Lax`);

      return res.status(200).json({ 
        sessionId: playerSessionId,
        pusherChannel,
        matched: false,
        message: 'Added to matchmaking queue'
      });
    }
  } catch (error) {
    if (transaction) {
      try {
        await transaction.rollback();
      } catch (rollbackError) {
        console.error('[api/games/random] Failed to rollback transaction', rollbackError);
      }
    }
    console.error('[api/games/random] Error:', error);
    return res.status(500).json({ message: 'Failed to find match', error: error.message });
  }
}

