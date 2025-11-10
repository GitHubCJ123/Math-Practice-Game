import sql from 'mssql';
import { getPool } from '../db-pool.js';
import { getPusherInstance } from '../pusher-utils.js';

export default async function handler(req: any, res: any) {
  console.log('[api/games/submit] Function invoked.');
  
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const { gameId, answers, timeTaken, sessionId, cheated } = req.body;

  if (!gameId || isNaN(gameId)) {
    return res.status(400).json({ message: 'Valid gameId is required' });
  }

  if (!answers || !Array.isArray(answers) || answers.length !== 10) {
    return res.status(400).json({ message: 'answers must be an array of 10 items' });
  }

  if (typeof timeTaken !== 'number' || timeTaken < 0) {
    return res.status(400).json({ message: 'Valid timeTaken is required' });
  }

  if (!sessionId || typeof sessionId !== 'string') {
    return res.status(400).json({ message: 'sessionId is required' });
  }

  let transaction: sql.Transaction | null = null;
  try {
    const pool = await getPool();
    transaction = new sql.Transaction(pool);
    await transaction.begin();

    // Get game and questions
    const getGameRequest = new sql.Request(transaction);
    getGameRequest.input('gameId', sql.Int, gameId);
    const gameResult = await getGameRequest.query(`
      SELECT Id, RoomCode, Questions, Status
      FROM Games
      WHERE Id = @gameId
    `);

    if (gameResult.recordset.length === 0) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Game not found' });
    }

    const game = gameResult.recordset[0];
    const questions = JSON.parse(game.Questions || '[]');

    // Verify player is in the game
    const verifyPlayerRequest = new sql.Request(transaction);
    verifyPlayerRequest.input('gameId', sql.Int, gameId);
    verifyPlayerRequest.input('sessionId', sql.NVarChar, sessionId);
    const playerResult = await verifyPlayerRequest.query(`
      SELECT Id, Status
      FROM GamePlayers
      WHERE GameId = @gameId AND PlayerSessionId = @sessionId
    `);

    if (playerResult.recordset.length === 0) {
      await transaction.rollback();
      return res.status(403).json({ message: 'Player not found in game' });
    }

    const player = playerResult.recordset[0];

    if (player.Status === 'finished') {
      await transaction.rollback();
      return res.status(400).json({ message: 'Player has already submitted' });
    }

    // If player cheated (switched tabs), forfeit them immediately
    if (cheated === true) {
      console.log('[api/games/submit] Player cheated (switched tabs), forfeiting game');
      
      // Mark player as forfeited (no score)
      const forfeitPlayerRequest = new sql.Request(transaction);
      forfeitPlayerRequest.input('playerId', sql.Int, player.Id);
      await forfeitPlayerRequest.query(`
        UPDATE GamePlayers
        SET Status = 'forfeited', FinalTime = NULL, Answers = NULL, UpdatedAt = GETUTCDATE()
        WHERE Id = @playerId
      `);

      // Get opponent
      const getOpponentRequest = new sql.Request(transaction);
      getOpponentRequest.input('gameId', sql.Int, gameId);
      getOpponentRequest.input('sessionId', sql.NVarChar, sessionId);
      const opponentResult = await getOpponentRequest.query(`
        SELECT PlayerSessionId, Status
        FROM GamePlayers
        WHERE GameId = @gameId AND PlayerSessionId != @sessionId
      `);

      const opponent = opponentResult.recordset[0];
      
      // If opponent hasn't finished, they automatically win
      if (opponent && opponent.Status !== 'finished' && opponent.Status !== 'forfeited') {
        // Mark game as completed with opponent as winner
        const updateGameRequest = new sql.Request(transaction);
        updateGameRequest.input('gameId', sql.Int, gameId);
        await updateGameRequest.query(`
          UPDATE Games
          SET Status = 'completed', UpdatedAt = GETUTCDATE()
          WHERE Id = @gameId
        `);

        await transaction.commit();

        // Notify opponent they won due to cheating
        const pusher = getPusherInstance();
        await pusher.trigger(`private-game-${game.RoomCode}`, 'opponent-cheated', {
          cheaterSessionId: sessionId,
          winnerSessionId: opponent.PlayerSessionId,
        });

        // Also send game-results event with opponent as winner
        await pusher.trigger(`private-game-${game.RoomCode}`, 'game-results', {
          players: [{
            sessionId: opponent.PlayerSessionId,
            finalTime: null, // Opponent hasn't submitted yet
            correctCount: null,
          }, {
            sessionId: sessionId,
            finalTime: null,
            correctCount: 0, // Cheater gets 0
          }],
          winner: opponent.PlayerSessionId,
          isTie: false,
          cheated: true,
        });

        // Return gameResults so forfeiting player can see opponent's status
        return res.status(200).json({ 
          success: true,
          forfeited: true,
          message: 'You forfeited due to switching tabs',
          gameResults: {
            players: [{
              sessionId: opponent.PlayerSessionId,
              finalTime: null, // Opponent hasn't submitted yet
              correctCount: null,
            }, {
              sessionId: sessionId,
              finalTime: null,
              correctCount: 0, // Cheater gets 0
            }],
            winner: opponent.PlayerSessionId,
            isTie: false,
            cheated: true,
          },
          waitingForOpponent: true, // Opponent hasn't finished yet
        });
      } else {
        // Opponent already finished, get their data and return complete results
        const getAllPlayersRequest = new sql.Request(transaction);
        getAllPlayersRequest.input('gameId', sql.Int, gameId);
        const allPlayersResult = await getAllPlayersRequest.query(`
          SELECT PlayerSessionId, FinalTime, Answers, Status
          FROM GamePlayers
          WHERE GameId = @gameId
        `);

        await transaction.commit();

        // Calculate opponent's correct count if they finished
        const opponentData = allPlayersResult.recordset.find((p: any) => p.PlayerSessionId !== sessionId);
        let opponentCorrectCount = null;
        if (opponentData && opponentData.Status === 'finished' && opponentData.Answers) {
          const opponentAnswers = JSON.parse(opponentData.Answers || '[]');
          opponentCorrectCount = 0;
          for (let i = 0; i < questions.length; i++) {
            const question = questions[i];
            const answer = String(opponentAnswers[i] || '').trim();
            const correctAnswer = String(question.answer);
            if (answer === correctAnswer) {
              opponentCorrectCount++;
            }
          }
        }

        // Send game-results event to notify opponent that you forfeited
        const pusher = getPusherInstance();
        await pusher.trigger(`private-game-${game.RoomCode}`, 'game-results', {
          players: [{
            sessionId: opponentData?.PlayerSessionId || '',
            finalTime: opponentData?.FinalTime ? Number(opponentData.FinalTime) : null,
            correctCount: opponentCorrectCount,
          }, {
            sessionId: sessionId,
            finalTime: null,
            correctCount: 0, // Cheater gets 0
          }],
          winner: opponentData?.PlayerSessionId || null,
          isTie: false,
          cheated: true,
        });

        return res.status(200).json({ 
          success: true,
          forfeited: true,
          message: 'You forfeited due to switching tabs',
          gameResults: {
            players: [{
              sessionId: opponentData?.PlayerSessionId || '',
              finalTime: opponentData?.FinalTime ? Number(opponentData.FinalTime) : null,
              correctCount: opponentCorrectCount,
            }, {
              sessionId: sessionId,
              finalTime: null,
              correctCount: 0, // Cheater gets 0
            }],
            winner: opponentData?.PlayerSessionId || null,
            isTie: false,
            cheated: true,
          },
          waitingForOpponent: false,
        });
      }
    }

    // Calculate score and penalties (normal submission)
    let incorrectCount = 0;
    for (let i = 0; i < questions.length; i++) {
      const question = questions[i];
      const userAnswer = String(answers[i] || '').trim();
      const correctAnswer = String(question.answer);
      
      if (userAnswer !== correctAnswer) {
        incorrectCount++;
      }
    }

    // Apply 5-second penalty per incorrect answer
    const penaltySeconds = incorrectCount * 5;
    const finalTimeMs = Math.round((timeTaken + penaltySeconds) * 1000);

    // Calculate correct count for this player
    let correctCount = 0;
    for (let i = 0; i < questions.length; i++) {
      const question = questions[i];
      const userAnswer = String(answers[i] || '').trim();
      const correctAnswer = String(question.answer);
      if (userAnswer === correctAnswer) {
        correctCount++;
      }
    }

    // Update player record
    const updatePlayerRequest = new sql.Request(transaction);
    updatePlayerRequest.input('playerId', sql.Int, player.Id);
    updatePlayerRequest.input('finalTime', sql.BigInt, finalTimeMs);
    updatePlayerRequest.input('answers', sql.NVarChar, JSON.stringify(answers));
    await updatePlayerRequest.query(`
      UPDATE GamePlayers
      SET Status = 'finished', FinalTime = @finalTime, Answers = @answers, UpdatedAt = GETUTCDATE()
      WHERE Id = @playerId
    `);

    // Check if both players are finished
    const checkPlayersRequest = new sql.Request(transaction);
    checkPlayersRequest.input('gameId', sql.Int, gameId);
    const allPlayersResult = await checkPlayersRequest.query(`
      SELECT PlayerSessionId, FinalTime, Status
      FROM GamePlayers
      WHERE GameId = @gameId
    `);

    const allPlayers = allPlayersResult.recordset;
    const allFinished = allPlayers.every((p: any) => p.Status === 'finished');

    if (allFinished && allPlayers.length === 2) {
      // Get both players' answers to calculate correct counts
      const getPlayerRequest = new sql.Request(transaction);
      getPlayerRequest.input('gameId', sql.Int, gameId);
      const allPlayersDataResult = await getPlayerRequest.query(`
        SELECT PlayerSessionId, FinalTime, Answers
        FROM GamePlayers
        WHERE GameId = @gameId
      `);

      const playersWithAnswers = allPlayersDataResult.recordset.map((p: any) => {
        const playerAnswers = JSON.parse(p.Answers || '[]');
        let correctCount = 0;
        for (let i = 0; i < questions.length; i++) {
          const question = questions[i];
          const userAnswer = String(playerAnswers[i] || '').trim();
          const correctAnswer = String(question.answer);
          if (userAnswer === correctAnswer) {
            correctCount++;
          }
        }
        return {
          sessionId: p.PlayerSessionId,
          finalTime: Number(p.FinalTime), // Convert BigInt to Number for comparison
          correctCount,
        };
      });
      
      console.log('[api/games/submit] Players with answers:', JSON.stringify(playersWithAnswers, null, 2));
      
      // Determine winner: lower finalTime wins (time includes penalties)
      // If times are equal, it's a tie
      const player1 = playersWithAnswers[0];
      const player2 = playersWithAnswers[1];
      
      console.log('[api/games/submit] Comparing times:', {
        player1: { sessionId: player1.sessionId, finalTime: player1.finalTime, correctCount: player1.correctCount },
        player2: { sessionId: player2.sessionId, finalTime: player2.finalTime, correctCount: player2.correctCount },
      });
      
      let winner: string | null = null;
      if (player1.finalTime < player2.finalTime) {
        winner = player1.sessionId;
      } else if (player2.finalTime < player1.finalTime) {
        winner = player2.sessionId;
      } else {
        winner = null; // tie
      }
      
      console.log('[api/games/submit] Winner determined:', winner);

      // Update game status
      const updateGameRequest = new sql.Request(transaction);
      updateGameRequest.input('gameId', sql.Int, gameId);
      await updateGameRequest.query(`
        UPDATE Games
        SET Status = 'completed', UpdatedAt = GETUTCDATE()
        WHERE Id = @gameId
      `);

      await transaction.commit();

      // Trigger final results event
      const pusher = getPusherInstance();
      await pusher.trigger(`private-game-${game.RoomCode}`, 'game-results', {
        players: playersWithAnswers,
        winner,
        isTie: winner === null,
      });

      // Schedule fallback cleanup: delete game data after 5 minutes if players don't interact
      // This is a safety measure in case players close the browser or don't click any buttons
      setTimeout(async () => {
        try {
          const cleanupPool = await getPool();
          
          // Check if game still exists (might have been deleted by cleanup endpoint)
          const checkRequest = cleanupPool.request();
          checkRequest.input('gameId', sql.Int, gameId);
          const checkResult = await checkRequest.query(`
            SELECT Id FROM Games WHERE Id = @gameId
          `);
          
          if (checkResult.recordset.length > 0) {
            // Game still exists, delete it
            const cleanupRequest = cleanupPool.request();
            cleanupRequest.input('gameId', sql.Int, gameId);
            
            // Delete players first (foreign key constraint)
            await cleanupRequest.query(`
              DELETE FROM GamePlayers WHERE GameId = @gameId
            `);
            
            // Then delete the game
            await cleanupRequest.query(`
              DELETE FROM Games WHERE Id = @gameId
            `);
            
            console.log(`[api/games/submit] Fallback cleanup: Deleted game ${gameId} after 5 minutes`);
          }
        } catch (cleanupError) {
          console.error(`[api/games/submit] Error in fallback cleanup for game ${gameId}:`, cleanupError);
        }
      }, 5 * 60 * 1000); // 5 minutes

      // Return game results for the second player (both finished)
      return res.status(200).json({ 
        success: true,
        finalTime: finalTimeMs,
        incorrectCount,
        correctCount,
        playerResult: {
          sessionId,
          finalTime: finalTimeMs,
          correctCount,
        },
        gameResults: {
          players: playersWithAnswers,
          winner,
          isTie: winner === null,
        },
        waitingForOpponent: false,
      });
    } else {
      await transaction.commit();

      // Trigger opponent finished event (but exclude the submitting player)
      const pusher = getPusherInstance();
      await pusher.trigger(`private-game-${game.RoomCode}`, 'opponent-finished', {
        sessionId,
        finishedPlayerSessionId: sessionId, // So clients know who finished
      });

      // Return player's own result so they can navigate immediately
      return res.status(200).json({ 
        success: true,
        finalTime: finalTimeMs,
        incorrectCount,
        correctCount,
        playerResult: {
          sessionId,
          finalTime: finalTimeMs,
          correctCount,
        },
        waitingForOpponent: true,
      });
    }
  } catch (error) {
    if (transaction) {
      try {
        await transaction.rollback();
      } catch (rollbackError) {
        console.error('[api/games/submit] Failed to rollback transaction', rollbackError);
      }
    }
    console.error('[api/games/submit] Error:', error);
    return res.status(500).json({ message: 'Failed to submit answers', error: error.message });
  }
}

