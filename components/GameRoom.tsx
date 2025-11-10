import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import Pusher from 'pusher-js';
import type { Question, Operation } from '../types';
import { ClockIcon } from './icons';

interface GameRoomProps {
  questions?: Question[];
  gameId?: number;
  sessionId?: string;
  roomCode?: string;
}

export const GameRoom: React.FC<GameRoomProps> = () => {
  const { gameId: gameIdParam } = useParams<{ gameId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = location.state as any;
  const [questions, setQuestions] = useState<Question[]>(locationState?.questions || []);
  const [gameId, setGameId] = useState<number>(locationState?.gameId || parseInt(gameIdParam || '0', 10));
  const [sessionId, setSessionId] = useState<string>(locationState?.sessionId || '');
  const [roomCode, setRoomCode] = useState<string>(locationState?.roomCode || '');
  
  const [answers, setAnswers] = useState<string[]>(Array(10).fill(''));
  const [elapsedTime, setElapsedTime] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [quizFinished, setQuizFinished] = useState(false);
  const [opponentFinished, setOpponentFinished] = useState(false);
  const [gameResults, setGameResults] = useState<any>(null);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [introStage, setIntroStage] = useState<'ready' | 'set' | 'go' | 'finished'>('ready');
  const [pusher, setPusher] = useState<Pusher | null>(null);
  const [channel, setChannel] = useState<any>(null);

  const answersRef = useRef(answers);
  const elapsedTimeRef = useRef(elapsedTime);
  const timerRunningRef = useRef(timerRunning);
  const quizFinishedRef = useRef(quizFinished);
  
  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);
  
  useEffect(() => {
    elapsedTimeRef.current = elapsedTime;
  }, [elapsedTime]);
  
  useEffect(() => {
    timerRunningRef.current = timerRunning;
  }, [timerRunning]);
  
  useEffect(() => {
    quizFinishedRef.current = quizFinished;
  }, [quizFinished]);

  // Auto-forfeit if player switches tabs during multiplayer game
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'hidden' && timerRunningRef.current && !quizFinishedRef.current && gameId && sessionId) {
        console.log('[GameRoom] Tab hidden detected - auto-forfeiting game');
        setTimerRunning(false);
        setQuizFinished(true);

        // Automatically submit current answers (forfeit)
        try {
          const response = await fetch('/api/games/submit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              gameId,
              answers: answersRef.current,
              timeTaken: elapsedTimeRef.current,
              sessionId,
              cheated: true, // Mark as cheated
            }),
          });

          if (!response.ok) {
            console.error('[GameRoom] Failed to auto-submit on tab switch');
          } else {
            console.log('[GameRoom] Auto-submitted due to tab switch (forfeited)');
            const result = await response.json();
            // Navigate to summary showing forfeit message
            navigate(`/summary/${gameId}`, {
              state: {
                questions,
                answers: answersRef.current,
                playerResult: null, // No score for cheater
                gameResults: result.gameResults || null,
                waitingForOpponent: result.waitingForOpponent || false,
                forfeited: true,
                sessionId,
                roomCode,
              },
            });
          }
        } catch (error) {
          console.error('[GameRoom] Error auto-submitting on tab switch:', error);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [gameId, sessionId, questions, roomCode, navigate]); // Include navigate and other needed values

  useEffect(() => {
    if (!questions || questions.length === 0 || !gameId || !sessionId || !roomCode) {
      navigate('/multiplayer');
      return;
    }

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

    gameChannel.bind('opponent-finished', (data: any) => {
      // Only show opponent finished if it's not us
      if (data.finishedPlayerSessionId && data.finishedPlayerSessionId !== sessionId) {
        setOpponentFinished(true);
      }
    });

    // Listen for opponent cheated event
    gameChannel.bind('opponent-cheated', (data: any) => {
      console.log('[GameRoom] Opponent cheated event received:', data);
      console.log('[GameRoom] Checking if we are the winner:', {
        winnerSessionId: data.winnerSessionId,
        mySessionId: sessionId,
        cheaterSessionId: data.cheaterSessionId,
      });
      if (data.winnerSessionId === sessionId) {
        console.log('[GameRoom] We won! Opponent cheated. Navigating to summary...');
        // We won because opponent cheated - navigate to summary immediately
        setTimerRunning(false);
        setQuizFinished(true);
        navigate(`/summary/${gameId}`, {
          state: {
            questions,
            answers: answersRef.current,
            playerResult: {
              sessionId,
              finalTime: null, // We haven't submitted yet
              correctCount: null,
            },
            gameResults: {
              players: [{
                sessionId: data.winnerSessionId, // Us (the winner)
                finalTime: null,
                correctCount: null,
              }, {
                sessionId: data.cheaterSessionId, // The cheater
                finalTime: null,
                correctCount: 0,
              }],
              winner: data.winnerSessionId,
              isTie: false,
              cheated: true,
            },
            waitingForOpponent: false,
            forfeited: false,
            sessionId,
            roomCode,
          },
        });
      } else {
        console.log('[GameRoom] We are NOT the winner, ignoring opponent-cheated event');
      }
    });

    gameChannel.bind('game-results', (data: any) => {
      console.log('[GameRoom] Game results received via Pusher:', data);
      // This event is now handled by GameSummary component
      // It will update the opponent's score when received
    });

    setChannel(gameChannel);

    return () => {
      gameChannel.unbind('opponent-finished');
      gameChannel.unbind('opponent-cheated');
      gameChannel.unbind('game-results');
      gameChannel.unbind_all();
      gameChannel.unsubscribe();
      pusherInstance.disconnect();
    };
  }, [questions, gameId, sessionId, roomCode, navigate]);

  useEffect(() => {
    if (introStage === 'ready') {
      setTimeout(() => setIntroStage('set'), 1000);
    } else if (introStage === 'set') {
      setTimeout(() => setIntroStage('go'), 1000);
    } else if (introStage === 'go') {
      setTimeout(() => {
        setIntroStage('finished');
        setTimerRunning(true);
      }, 1000);
    }
  }, [introStage]);

  useEffect(() => {
    if (introStage === 'finished' && inputRefs.current[0]) {
      inputRefs.current[0].focus();
    }
  }, [introStage]);

  useEffect(() => {
    if (!timerRunning) return;
    const intervalId = setInterval(() => {
      setElapsedTime(prev => prev + 0.01);
    }, 10);
    return () => clearInterval(intervalId);
  }, [timerRunning]);

  const handleAnswerChange = (index: number, value: string) => {
    const newAnswers = [...answers];
    const operation = questions[index].operation;
    
    let filteredValue = value;
    if (operation === 'decimal-to-fraction') {
      filteredValue = value.replace(/[^0-9/]/g, '');
      const parts = filteredValue.split('/');
      if (parts.length > 2) {
        filteredValue = `${parts[0]}/${parts.slice(1).join('')}`;
      }
    } else {
      filteredValue = value.replace(/[^0-9.]/g, '');
      const parts = filteredValue.split('.');
      if (parts.length > 2) {
        filteredValue = `${parts[0]}.${parts.slice(1).join('')}`;
      }
    }
    
    newAnswers[index] = filteredValue;
    setAnswers(newAnswers);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
    if (e.key === 'Enter' && index < questions.length - 1 && inputRefs.current[index + 1]) {
      e.preventDefault();
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (quizFinished) return;

    setTimerRunning(false);
    setQuizFinished(true);

    try {
      console.log('[GameRoom] Submitting answers:', { gameId, sessionId, timeTaken: elapsedTime });
      const response = await fetch('/api/games/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameId,
          answers,
          timeTaken: elapsedTime,
          sessionId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Failed to submit answers' }));
        throw new Error(errorData.message || 'Failed to submit answers');
      }

      const result = await response.json();
      console.log('[GameRoom] Submit successful:', result);

      // Navigate immediately to summary with player's own results
      // If opponent hasn't finished, show "Waiting to finish"
      navigate(`/summary/${gameId}`, {
        state: {
          questions,
          answers: answersRef.current,
          playerResult: result.playerResult,
          gameResults: result.gameResults || null,
          waitingForOpponent: result.waitingForOpponent || false,
          sessionId,
          roomCode,
        },
      });
    } catch (error: any) {
      console.error('[GameRoom] Error submitting answers:', error);
      alert(`Failed to submit answers: ${error.message}. Please try again.`);
      setTimerRunning(true);
      setQuizFinished(false);
    }
  };

  const formatTime = (seconds: number) => {
    return seconds.toFixed(3);
  };

  const getOperationSymbol = (op: Operation) => {
    switch (op) {
      case 'multiplication': return '×';
      case 'division': return '÷';
      case 'squares': return '²';
      case 'square-roots': return '√';
      default: return '?';
    }
  };

  const isConversionMode = questions[0]?.operation === 'fraction-to-decimal' || questions[0]?.operation === 'decimal-to-fraction';

  if (!questions || questions.length === 0) {
    return null;
  }

  return (
    <div className="max-w-4xl mx-auto p-6 bg-white dark:bg-slate-900 rounded-3xl shadow-xl border border-slate-200 dark:border-slate-800 relative" style={{ minHeight: '600px' }}>
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ visibility: introStage !== 'finished' ? 'visible' : 'hidden' }}>
        <p key={introStage} className="text-8xl font-extrabold text-slate-800 dark:text-white animate-word-pulse capitalize">
          {introStage}...
        </p>
      </div>

      <div className={introStage === 'finished' ? 'animate-fade-in' : 'opacity-0'}>
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-800 dark:text-white">1v1 Math Duel</h1>
          <div className="flex items-center gap-4">
            {opponentFinished && (
              <div className="px-4 py-2 bg-yellow-100 dark:bg-yellow-500/20 border-2 border-yellow-500 rounded-lg animate-pulse">
                <p className="text-sm font-bold text-yellow-700 dark:text-yellow-400">Opponent Finished!</p>
              </div>
            )}
            <div className="flex items-center gap-2 text-lg font-bold p-3 rounded-full bg-slate-100 dark:bg-slate-800">
              <ClockIcon className="w-6 h-6"/>
              <span>{formatTime(elapsedTime)}s</span>
            </div>
          </div>
        </div>

        {isConversionMode && questions[0]?.operation === 'fraction-to-decimal' && (
          <p className="text-center text-slate-500 dark:text-slate-400 mb-6 -mt-2">
            Note: For repeating decimals, please enter the first three decimal places (e.g., for 1/3, enter 0.333).
          </p>
        )}
        {isConversionMode && questions[0]?.operation === 'decimal-to-fraction' && (
          <p className="text-center text-slate-500 dark:text-slate-400 mb-6 -mt-2">
            Note: All fractions must be in simplest form.
          </p>
        )}

        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-5">
            {questions.map((q, index) => (
              <div key={index} className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                <span className="text-slate-500 dark:text-slate-400 font-bold w-6 text-right">{index + 1}.</span>
                <div className="flex items-center gap-2 text-2xl font-bold text-slate-700 dark:text-slate-200 w-full">
                  {isConversionMode ? (
                    <span className="w-24 text-center">{q.display}</span>
                  ) : (
                    <>
                      {q.operation === 'square-roots' && <span>{getOperationSymbol(q.operation)}</span>}
                      <span className="w-10 text-right">{q.num1}</span>
                      {q.operation === 'squares' ? <sup>2</sup> : (q.operation !== 'square-roots' && <span>{getOperationSymbol(q.operation)}</span>)}
                      {q.num2 && <span className="w-10 text-left">{q.num2}</span>}
                    </>
                  )}
                  <span>=</span>
                  <input
                    ref={el => { inputRefs.current[index] = el; }}
                    type="text"
                    inputMode={q.operation === 'decimal-to-fraction' ? 'text' : 'numeric'}
                    value={answers[index]}
                    onChange={(e) => handleAnswerChange(index, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(e, index)}
                    className="w-24 p-2 text-center text-2xl font-bold border-2 border-slate-300 dark:border-slate-600 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition bg-white dark:bg-slate-900"
                    maxLength={7}
                    disabled={quizFinished}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-8 text-center">
            <button
              type="submit"
              disabled={quizFinished}
              className="w-full sm:w-auto px-16 py-4 text-xl font-bold text-white bg-blue-600 rounded-full shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {quizFinished ? 'Submitting...' : 'Submit Answers'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

