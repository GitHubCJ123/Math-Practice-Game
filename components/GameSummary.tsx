import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import Pusher from 'pusher-js';
import type { Question, Operation } from '../types';
import { CheckCircleIcon, XCircleIcon, TrophyIcon } from './icons';

interface GameSummaryProps {
  questions?: Question[];
  userAnswers?: string[];
  gameResults?: any;
  sessionId?: string;
}

export const GameSummary: React.FC<GameSummaryProps> = () => {
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = location.state as any;
  const questions = locationState?.questions || [];
  const userAnswers = locationState?.answers || locationState?.userAnswers || [];
  const initialGameResults = locationState?.gameResults;
  const playerResult = locationState?.playerResult;
  const waitingForOpponent = locationState?.waitingForOpponent || false;
  const forfeited = locationState?.forfeited || false;
  const sessionId = locationState?.sessionId || '';
  const roomCode = locationState?.roomCode || '';
  
  const [gameResults, setGameResults] = useState<any>(initialGameResults);
  const [loadedQuestions, setLoadedQuestions] = useState<Question[]>(questions);
  const [loadedAnswers, setLoadedAnswers] = useState<string[]>(userAnswers);
  const [hasClickedPlayAgain, setHasClickedPlayAgain] = useState(false);
  const [hasClickedRematch, setHasClickedRematch] = useState(false);
  const [rematchStatus, setRematchStatus] = useState<'waiting' | 'accepted' | 'timeout' | 'pending_acceptance' | null>(null);
  const [rematchRequestingSessionId, setRematchRequestingSessionId] = useState<string | null>(null);
  const [pusher, setPusher] = useState<Pusher | null>(null);
  const [channel, setChannel] = useState<any>(null);
  
  console.log('[GameSummary] Location state:', locationState);
  console.log('[GameSummary] User answers:', userAnswers);
  console.log('[GameSummary] Questions from state:', questions);
  console.log('[GameSummary] loadedQuestions:', loadedQuestions);
  console.log('[GameSummary] loadedAnswers:', loadedAnswers);
  console.log('[GameSummary] gameResults:', gameResults);
  console.log('[GameSummary] playerResult:', playerResult);
  console.log('[GameSummary] forfeited:', forfeited);
  console.log('[GameSummary] waitingForOpponent:', waitingForOpponent);

  // Log when gameResults changes
  useEffect(() => {
    console.log('[GameSummary] gameResults state changed:', gameResults);
  }, [gameResults]);

  useEffect(() => {
    if (!roomCode || !gameId) return;

    // Initialize Pusher
    const pusherKey = import.meta.env.VITE_PUSHER_KEY;
    const pusherCluster = import.meta.env.VITE_PUSHER_CLUSTER;

    if (!pusherKey || !pusherCluster) {
      console.error('Pusher credentials not configured');
      return;
    }

    const pusherInstance = new Pusher(pusherKey, {
      cluster: pusherCluster,
      authEndpoint: '/api/pusher/auth',
    });

    setPusher(pusherInstance);

    const channelName = `private-game-${roomCode}`;
    const gameChannel = pusherInstance.subscribe(channelName);

    gameChannel.bind('pusher:subscription_succeeded', () => {
      console.log('[GameSummary] Subscribed to channel:', channelName);
    });

    gameChannel.bind('pusher:subscription_error', (error: any) => {
      console.error('[GameSummary] Subscription error:', error);
    });

    // Listen for game results (when opponent finishes)
    const gameResultsHandler = (data: any) => {
      console.log('[GameSummary] Game results received via Pusher:', data);
      console.log('[GameSummary] Setting gameResults state with:', JSON.stringify(data, null, 2));
      setGameResults(data);
      console.log('[GameSummary] gameResults state updated');
    };
    gameChannel.bind('game-results', gameResultsHandler);

    // Listen for opponent cheated event
    const opponentCheatedHandler = (data: any) => {
      console.log('[GameSummary] Opponent cheated event received:', data);
      // Update game results to show opponent cheated and we won
      setGameResults({
        players: [{
          sessionId: data.winnerSessionId,
          finalTime: null,
          correctCount: null,
        }, {
          sessionId: data.cheaterSessionId,
          finalTime: null,
          correctCount: 0,
        }],
        winner: data.winnerSessionId,
        isTie: false,
        cheated: true,
      });
    };
    gameChannel.bind('opponent-cheated', opponentCheatedHandler);

    // Listen for rematch request
    const rematchRequestHandler = (data: any) => {
      console.log('[GameSummary] Rematch request received:', data);
      if (data.requestingSessionId !== sessionId) {
        // Opponent wants a rematch
        setRematchStatus('pending_acceptance');
        setRematchRequestingSessionId(data.requestingSessionId);
      }
    };
    gameChannel.bind('rematch-request', rematchRequestHandler);

    // Listen for rematch accepted
    const rematchAcceptedHandler = (data: any) => {
      console.log('[GameSummary] Rematch accepted event received:', data);
      console.log('[GameSummary] Current state:', { hasClickedRematch, rematchStatus, sessionId, data });
      
      // Both players should navigate when rematch is accepted
      if (data.questions && data.startTime) {
        console.log('[GameSummary] Navigating to matchmaking with rematch data');
        navigate('/multiplayer', {
          state: {
            rematch: true,
            gameId: parseInt(gameId || '0', 10),
            roomCode: data.roomCode || roomCode,
            sessionId,
            opponentSessionId: hasClickedRematch ? data.acceptingSessionId : data.requestingSessionId,
            questions: data.questions,
            startTime: data.startTime,
          },
        });
      }
    };
    gameChannel.bind('rematch-accepted', rematchAcceptedHandler);

    // Listen for rematch declined/timeout
    const rematchDeclinedHandler = (data: any) => {
      console.log('[GameSummary] Rematch declined/timeout:', data);
      if (hasClickedRematch) {
        setRematchStatus('timeout');
        setTimeout(() => {
          navigate('/multiplayer');
        }, 2000);
      } else if (rematchStatus === 'pending_acceptance') {
        setRematchStatus(null);
        setRematchRequestingSessionId(null);
      }
    };
    gameChannel.bind('rematch-declined', rematchDeclinedHandler);

    setChannel(gameChannel);

    return () => {
      gameChannel.unbind('game-results', gameResultsHandler);
      gameChannel.unbind('opponent-cheated', opponentCheatedHandler);
      gameChannel.unbind('rematch-request', rematchRequestHandler);
      gameChannel.unbind('rematch-accepted', rematchAcceptedHandler);
      gameChannel.unbind('rematch-declined', rematchDeclinedHandler);
      gameChannel.unbind_all();
      gameChannel.unsubscribe();
      pusherInstance.disconnect();
    };
  }, [roomCode, gameId, sessionId, navigate, hasClickedRematch, rematchStatus]);

  const handleGoHome = async () => {
    // Clean up game data before navigating
    try {
      await fetch('/api/games/cleanup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameId: parseInt(gameId || '0', 10),
          sessionId,
        }),
      });
    } catch (error) {
      console.error('[GameSummary] Error cleaning up game:', error);
      // Continue navigation even if cleanup fails
    }
    navigate('/');
  };

  const handlePlayAgain = async () => {
    if (hasClickedPlayAgain) {
      console.log('[GameSummary] Already clicked play again, ignoring');
      return;
    }

    console.log('[GameSummary] Clicking play again - navigating to matchmaking');
    setHasClickedPlayAgain(true);
    
    // Clean up the current game
    try {
      await fetch('/api/games/cleanup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameId: parseInt(gameId || '0', 10),
          sessionId,
        }),
      });
    } catch (error) {
      console.error('[GameSummary] Error cleaning up game:', error);
      // Continue navigation even if cleanup fails
    }

    // Navigate directly to multiplayer menu (matchmaking)
    navigate('/multiplayer');
  };

  const handleAcceptRematch = async () => {
    try {
      const response = await fetch('/api/games/rematch-accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameId: parseInt(gameId || '0', 10),
          sessionId,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to accept rematch');
      }

      const result = await response.json();
      console.log('[GameSummary] Rematch accepted, received data:', result);
      
      // Navigate immediately with the data from the API response
      // This ensures we don't miss the navigation if Pusher event is delayed
      if (result.questions && result.startTime) {
        navigate('/multiplayer', {
          state: {
            rematch: true,
            gameId: parseInt(gameId || '0', 10),
            roomCode,
            sessionId,
            opponentSessionId: result.requestingSessionId || null,
            questions: result.questions,
            startTime: result.startTime,
          },
        });
      } else {
        // Fallback: wait for Pusher event
        setRematchStatus('accepted');
      }
    } catch (error) {
      console.error('[GameSummary] Error accepting rematch:', error);
    }
  };

  const handleDeclineRematch = async () => {
    try {
      await fetch('/api/games/rematch-decline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameId: parseInt(gameId || '0', 10),
          sessionId,
        }),
      });

      setRematchStatus(null);
      setRematchRequestingSessionId(null);
    } catch (error) {
      console.error('[GameSummary] Error declining rematch:', error);
    }
  };

  const handleRematch = async () => {
    if (hasClickedRematch) {
      console.log('[GameSummary] Already clicked rematch, ignoring');
      return;
    }

    console.log('[GameSummary] Clicking rematch - sending request to opponent', { gameId, sessionId, roomCode });
    setHasClickedRematch(true);
    setRematchStatus('waiting');

    try {
      const requestBody = {
        gameId: parseInt(gameId || '0', 10),
        sessionId,
        roomCode,
      };
      console.log('[GameSummary] Sending rematch request with body:', requestBody);
      
      const response = await fetch('/api/games/rematch-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      console.log('[GameSummary] Rematch request response status:', response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('[GameSummary] Rematch request failed:', errorText);
        throw new Error(`Failed to send rematch request: ${response.status} ${errorText}`);
      }

      const result = await response.json();
      console.log('[GameSummary] Rematch request successful:', result);

      // Set up timeout check
      const checkRematchStatus = async () => {
        try {
          const statusResponse = await fetch(`/api/games/rematch-status?gameId=${gameId}&sessionId=${encodeURIComponent(sessionId)}`);
          if (statusResponse.ok) {
            const status = await statusResponse.json();
            console.log('[GameSummary] Rematch status check:', status);
            if (status.status === 'accepted') {
              setRematchStatus('accepted');
            } else if (status.status === 'timeout' || status.status === 'declined') {
              setRematchStatus('timeout');
              setTimeout(() => {
                navigate('/multiplayer');
              }, 2000);
            }
          }
        } catch (error) {
          console.error('[GameSummary] Error checking rematch status:', error);
        }
      };

      // Check status every 2 seconds for 30 seconds
      const statusInterval = setInterval(checkRematchStatus, 2000);
      setTimeout(() => {
        clearInterval(statusInterval);
        checkRematchStatus().then(() => {
          setRematchStatus((currentStatus) => {
            if (currentStatus !== 'accepted') {
              setTimeout(() => {
                navigate('/multiplayer');
              }, 2000);
              return 'timeout';
            }
            return currentStatus;
          });
        });
      }, 30000);
    } catch (error: any) {
      console.error('[GameSummary] Error sending rematch request:', error);
      alert(`Failed to send rematch request: ${error.message}`);
      setHasClickedRematch(false);
      setRematchStatus(null);
    }
  };

  if (!loadedQuestions || loadedQuestions.length === 0) {
    console.log('[GameSummary] No questions found, showing loading...');
    return (
      <div className="max-w-4xl mx-auto p-6 bg-white dark:bg-slate-900 rounded-3xl shadow-xl border border-slate-200 dark:border-slate-800">
        <p className="text-center text-slate-600 dark:text-slate-400">Loading results...</p>
      </div>
    );
  }

  console.log('[GameSummary] Processing results with', loadedQuestions.length, 'questions');
  const results = loadedQuestions.map((q, i) => {
    const userAnswer = String(loadedAnswers[i] || '').trim();
    const isCorrect = userAnswer === String(q.answer);
    return {
      question: q,
      userAnswer: userAnswer || 'N/A',
      isCorrect,
    };
  });
  console.log('[GameSummary] Results processed:', results.length);

  const correctCount = results.filter(r => r.isCorrect).length;
  const incorrectCount = 10 - correctCount;
  const penaltySeconds = incorrectCount * 5;

  // Get player's own result (from initial state or gameResults)
  const playerFinalTime = playerResult?.finalTime || (gameResults?.players?.find((p: any) => p.sessionId === sessionId)?.finalTime || 0);
  const playerCorrectCount = playerResult?.correctCount || correctCount;
  
  // Get opponent's result (only available if gameResults exists and opponent finished)
  const opponentResult = gameResults?.players?.find((p: any) => p.sessionId !== sessionId);
  const opponentFinalTime = opponentResult?.finalTime || 0;
  const opponentCorrectCount = opponentResult?.correctCount ?? null; // Use null instead of 0 to distinguish from forfeited
  
  // Get current player's result from gameResults
  const currentPlayerResult = gameResults?.players?.find((p: any) => p.sessionId === sessionId);
  
  // Check if CURRENT player forfeited (they will have correctCount: 0 when cheated: true and they're the cheater)
  const currentPlayerForfeited = forfeited || (gameResults?.cheated === true && currentPlayerResult?.correctCount === 0);
  
  // Check if opponent forfeited (cheated) - they will have correctCount: 0 when cheated: true
  // The opponent is the one who is NOT the current player
  const opponentForfeited = gameResults?.cheated === true && 
                            opponentResult && 
                            opponentResult.correctCount === 0;
  
  console.log('[GameSummary] Opponent result check:', {
    hasGameResults: !!gameResults,
    hasPlayers: !!gameResults?.players,
    playersCount: gameResults?.players?.length,
    opponentResult: !!opponentResult,
    opponentSessionId: opponentResult?.sessionId,
    opponentCorrectCount: opponentResult?.correctCount,
    opponentFinalTime: opponentResult?.finalTime,
    opponentForfeited,
    currentPlayerForfeited,
    forfeited,
    currentPlayerResult,
    gameResultsCheated: gameResults?.cheated,
    gameResultsWinner: gameResults?.winner,
    mySessionId: sessionId,
  });
  
  // Determine win/loss (only if both players finished)
  const isWinner = gameResults?.winner === sessionId;
  const isTie = gameResults?.isTie || false;
  // Both finished only if opponent exists AND has submitted (has correctCount or finalTime)
  // But if opponent forfeited (correctCount === 0 and cheated === true), they're considered "finished" for display purposes
  const bothFinished = !!gameResults && !!opponentResult && (
    opponentForfeited || 
    (opponentResult.correctCount !== null && opponentResult.correctCount !== undefined) || 
    (opponentResult.finalTime !== null && opponentResult.finalTime !== undefined)
  );
  const opponentCheated = gameResults?.cheated === true && gameResults?.winner === sessionId;
  
  console.log('[GameSummary] Calculated values:', {
    isWinner,
    isTie,
    bothFinished,
    opponentCheated,
    opponentResult: !!opponentResult,
    gameResultsExists: !!gameResults,
  });

  const getOperationSymbol = (op: Operation) => {
    switch (op) {
      case 'multiplication': return '×';
      case 'division': return '÷';
      case 'squares': return '²';
      case 'square-roots': return '√';
      default: return '?';
    }
  };

  const formatTime = (ms: number) => {
    const seconds = ms / 1000;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    if (minutes > 0) {
      return `${minutes}m ${remainingSeconds.toFixed(3)}s`;
    }
    return `${seconds.toFixed(3)}s`;
  };

  const isConversionMode = loadedQuestions[0]?.operation === 'fraction-to-decimal' || loadedQuestions[0]?.operation === 'decimal-to-fraction';

  console.log('[GameSummary] Rendering component with', loadedQuestions.length, 'questions');
  console.log('[GameSummary] About to render return statement');

  return (
    <div className="max-w-4xl mx-auto p-6 bg-white dark:bg-slate-900 rounded-3xl shadow-xl border border-slate-200 dark:border-slate-800">
      <div className="text-center mb-8">
        <h1 className="text-4xl sm:text-5xl font-extrabold text-slate-800 dark:text-white mb-4">Game Results</h1>
        
        {currentPlayerForfeited && (
          <div className="mb-6 p-4 bg-red-100 dark:bg-red-500/20 border-2 border-red-500 rounded-lg">
            <p className="text-2xl font-bold text-red-700 dark:text-red-400">You Forfeited</p>
            <p className="text-lg text-red-600 dark:text-red-300 mt-2">You switched tabs during the game</p>
          </div>
        )}

        {opponentCheated || opponentForfeited ? (
          <div className="mb-6 p-4 bg-green-100 dark:bg-green-500/20 border-2 border-green-500 rounded-lg">
            <p className="text-2xl font-bold text-green-700 dark:text-green-400">You Won!</p>
            <p className="text-lg text-green-600 dark:text-green-300 mt-2">Your opponent forfeited by switching tabs</p>
          </div>
        ) : null}
        
        {bothFinished && !opponentCheated && !opponentForfeited && !currentPlayerForfeited && (
          <>
            {isTie ? (
              <div className="mb-6 p-4 bg-blue-100 dark:bg-blue-500/20 border-2 border-blue-500 rounded-lg">
                <p className="text-2xl font-bold text-blue-700 dark:text-blue-400">It's a Tie!</p>
              </div>
            ) : isWinner ? (
              <div className="mb-6 p-4 bg-yellow-100 dark:bg-yellow-500/20 border-2 border-yellow-500 rounded-lg flex items-center justify-center gap-3">
                <TrophyIcon className="w-8 h-8 text-yellow-600 dark:text-yellow-400" />
                <p className="text-2xl font-bold text-yellow-700 dark:text-yellow-400">You Won!</p>
              </div>
            ) : (
              <div className="mb-6 p-4 bg-red-100 dark:bg-red-500/20 border-2 border-red-500 rounded-lg">
                <p className="text-2xl font-bold text-red-700 dark:text-red-400">You Lost</p>
              </div>
            )}
          </>
        )}

        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="p-4 bg-slate-100 dark:bg-slate-800 rounded-lg">
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">Your Score</p>
            {currentPlayerForfeited ? (
              <>
                <p className="text-2xl font-bold text-red-600 dark:text-red-400">Forfeited</p>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">No score</p>
              </>
            ) : (
              <>
                <p className="text-2xl font-bold text-slate-800 dark:text-slate-200">{playerCorrectCount} / 10</p>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{formatTime(playerFinalTime)}</p>
                {penaltySeconds > 0 && (
                  <p className="text-xs text-red-600 dark:text-red-400 mt-1">+{penaltySeconds}s penalty</p>
                )}
              </>
            )}
          </div>
          <div className="p-4 bg-slate-100 dark:bg-slate-800 rounded-lg">
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">Opponent Score</p>
            {opponentCheated || opponentForfeited ? (
              <>
                <p className="text-2xl font-bold text-red-600 dark:text-red-400">Forfeited</p>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">Switched tabs</p>
              </>
            ) : bothFinished ? (
              <>
                <p className="text-2xl font-bold text-slate-800 dark:text-slate-200">{opponentCorrectCount ?? 0} / 10</p>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{formatTime(opponentFinalTime)}</p>
              </>
            ) : (
              <>
                <p className="text-2xl font-bold text-slate-500 dark:text-slate-400">Waiting to finish</p>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">...</p>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-3 mb-8">
        {results.map((result, index) => (
          <div key={index} className={`p-4 rounded-lg border-l-4 ${result.isCorrect ? 'bg-green-50 dark:bg-green-500/10 border-green-500' : 'bg-red-50 dark:bg-red-500/10 border-red-500'}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-slate-600 dark:text-slate-400 font-bold">{index + 1}.</span>
                <p className="text-xl font-bold text-slate-800 dark:text-slate-200">
                  {isConversionMode ? (
                    <span>{result.question.display}</span>
                  ) : (
                    <>
                      {result.question.operation === 'square-roots' && getOperationSymbol(result.question.operation)}
                      {result.question.num1}
                      {result.question.operation === 'squares' ? <sup>2</sup> : (result.question.operation !== 'square-roots' && getOperationSymbol(result.question.operation))}
                      {result.question.num2 && ` ${result.question.num2}`}
                    </>
                  )}
                  {' = '}
                  <span className="text-blue-600 dark:text-blue-400">{String(result.question.answer)}</span>
                </p>
              </div>
              <div className="flex items-center gap-3">
                {result.isCorrect ? (
                  <div className="flex items-center gap-2 text-green-600">
                    <span className="font-bold text-lg">{result.userAnswer || 'N/A'}</span>
                    <CheckCircleIcon className="w-7 h-7" />
                  </div>
                ) : (
                  <div className="flex items-center gap-3 text-red-600">
                    <span className="font-bold text-lg line-through">{result.userAnswer || 'N/A'}</span>
                    <XCircleIcon className="w-7 h-7" />
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="text-center space-y-4">
        <button
          onClick={handleGoHome}
          className="w-full sm:w-auto px-16 py-4 text-xl font-bold text-white bg-slate-600 rounded-full shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-300"
        >
          Go Back to Home Screen
        </button>
        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
          <button
            onClick={(e) => {
              e.preventDefault();
              console.log('[GameSummary] Rematch button clicked!', { hasClickedRematch, hasClickedPlayAgain, gameId, sessionId, roomCode });
              handleRematch();
            }}
            disabled={hasClickedRematch || hasClickedPlayAgain}
            className="w-full sm:w-auto px-16 py-4 text-xl font-bold text-white bg-purple-600 rounded-full shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:scale-100"
          >
            {rematchStatus === 'waiting' ? 'Waiting for Opponent...' : rematchStatus === 'timeout' ? 'Rematch Timeout' : 'Rematch'}
          </button>
          <button
            onClick={handlePlayAgain}
            disabled={hasClickedPlayAgain || hasClickedRematch}
            className="w-full sm:w-auto px-16 py-4 text-xl font-bold text-white bg-blue-600 rounded-full shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:scale-100"
          >
            {hasClickedPlayAgain ? 'Finding Match...' : 'Play Again'}
          </button>
        </div>
        {rematchStatus === 'waiting' && (
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
            Waiting for opponent to accept rematch... (30s timeout)
          </p>
        )}
        {rematchStatus === 'timeout' && (
          <p className="text-sm text-red-500 dark:text-red-400 mt-2">
            Opponent did not accept rematch. Redirecting to matchmaking...
          </p>
        )}
        {rematchStatus === 'pending_acceptance' && (
          <div className="mt-4 p-4 bg-purple-100 dark:bg-purple-500/20 border-2 border-purple-500 rounded-lg">
            <p className="text-lg font-bold text-purple-700 dark:text-purple-400 mb-3">
              Opponent wants a rematch!
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={handleAcceptRematch}
                className="px-8 py-3 text-lg font-bold text-white bg-green-600 rounded-full shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-300"
              >
                Accept Rematch
              </button>
              <button
                onClick={handleDeclineRematch}
                className="px-8 py-3 text-lg font-bold text-white bg-red-600 rounded-full shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-300"
              >
                Decline
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

