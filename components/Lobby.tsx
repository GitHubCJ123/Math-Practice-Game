import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import Pusher from 'pusher-js';
import type { Question } from '../types';

interface LobbyProps {
  roomCode?: string;
  sessionId?: string;
}

export const Lobby: React.FC<LobbyProps> = () => {
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = location.state as any;
  const [roomCode, setRoomCode] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [isHost, setIsHost] = useState(false);
  const [opponentJoined, setOpponentJoined] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isCheckingStatus, setIsCheckingStatus] = useState(true); // Track if we're still checking host status
  const [questions, setQuestions] = useState<Question[]>([]);
  const [pusher, setPusher] = useState<Pusher | null>(null);
  const [channel, setChannel] = useState<any>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const pollingIntervalRef = React.useRef<NodeJS.Timeout | null>(null);
  const shouldPollRef = React.useRef(false);
  const hasNavigatedRef = React.useRef(false);
  const fallbackNavigationTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  // Effect to start/stop polling for opponent join status (host) or game start (joiner)
  useEffect(() => {
    if (isCheckingStatus || hasNavigatedRef.current) {
      // Don't poll while checking initial status or if already navigated
      return;
    }
    
    // Host: Poll for opponent join
    if (isHost && !opponentJoined && !pollingIntervalRef.current) {
      console.log('[Lobby] Starting polling for opponent join status (host)...');
      shouldPollRef.current = true;
      pollingIntervalRef.current = setInterval(async () => {
        if (!shouldPollRef.current || hasNavigatedRef.current) {
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
          }
          return;
        }
        
        console.log('[Lobby] Polling for opponent join status...');
        try {
          const playersResponse = await fetch(`/api/games?action=players&gameId=${gameId}&sessionId=${sessionId}`);
          if (playersResponse.ok) {
            const playersData = await playersResponse.json();
            if (playersData.playerCount >= 2) {
              console.log('[Lobby] Opponent detected via polling!');
              setOpponentJoined(true);
              shouldPollRef.current = false;
              if (pollingIntervalRef.current) {
                clearInterval(pollingIntervalRef.current);
                pollingIntervalRef.current = null;
              }
            }
          }
        } catch (error) {
          console.error('[Lobby] Error polling for opponent:', error);
        }
      }, 2000); // Poll every 2 seconds
    }
    // Joiner: Poll for game start
    else if (!isHost && !pollingIntervalRef.current) {
      console.log('[Lobby] Starting polling for game start status (joiner)...');
      shouldPollRef.current = true;
      pollingIntervalRef.current = setInterval(async () => {
        if (!shouldPollRef.current || hasNavigatedRef.current) {
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
          }
          return;
        }
        
        console.log('[Lobby] Polling for game start status (joiner)...');
        try {
          const statusResponse = await fetch(`/api/games?action=status&gameId=${gameId}&sessionId=${sessionId}`);
          if (statusResponse.ok) {
            const statusData = await statusResponse.json();
            if (statusData.hasStarted && statusData.questions) {
              console.log('[Lobby] Game started detected via polling (joiner)!');
              shouldPollRef.current = false;
              if (pollingIntervalRef.current) {
                clearInterval(pollingIntervalRef.current);
                pollingIntervalRef.current = null;
              }
              hasNavigatedRef.current = true;
              setIsStarting(true);
              navigate(`/game/${gameId}`, {
                state: {
                  questions: statusData.questions,
                  gameId: parseInt(gameId || '0', 10),
                  sessionId: sessionId,
                  roomCode: roomCode,
                },
              });
            }
          }
        } catch (error) {
          console.error('[Lobby] Error polling for game start:', error);
        }
      }, 1000); // Poll every 1 second for game start
    }
    // Stop polling if conditions change
    else if ((isHost && opponentJoined) || hasNavigatedRef.current) {
      if (pollingIntervalRef.current) {
        console.log('[Lobby] Stopping polling');
        shouldPollRef.current = false;
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    }
    
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
      shouldPollRef.current = false;
    };
  }, [isHost, opponentJoined, isCheckingStatus, gameId, sessionId, roomCode, navigate]);

  useEffect(() => {
    // Get roomCode and sessionId from location state
    const stateRoomCode = locationState?.roomCode;
    const stateSessionId = locationState?.sessionId;
    
    if (!stateRoomCode || !stateSessionId || !gameId) {
      // If not in state, redirect back
      navigate('/multiplayer');
      return;
    }

    setRoomCode(stateRoomCode);
    setSessionId(stateSessionId);

    // Check if user is the host (first player) and game status
    const checkGameStatus = async () => {
      setIsCheckingStatus(true);
      console.log('[Lobby] checkGameStatus called with gameId:', gameId, 'sessionId:', stateSessionId);
      try {
        const statusUrl = `/api/games?action=status&gameId=${gameId}&sessionId=${stateSessionId}`;
        console.log('[Lobby] Fetching status from:', statusUrl);
        const response = await fetch(statusUrl);
        console.log('[Lobby] Status response:', response.status, response.ok);
        
        if (response.ok) {
          const data = await response.json();
          console.log('[Lobby] Status data:', data);
          
          // Check if game has already started
          if (data.hasStarted && data.questions) {
            console.log('[Lobby] Game already started, navigating to game room');
            navigate(`/game/${gameId}`, {
              state: {
                questions: data.questions,
                gameId: parseInt(gameId, 10),
                sessionId: stateSessionId,
                roomCode: stateRoomCode,
              },
            });
            setIsCheckingStatus(false);
            return true;
          }

          // Check if user is host by checking player order
          const playersUrl = `/api/games?action=players&gameId=${gameId}&sessionId=${stateSessionId}`;
          console.log('[Lobby] Fetching players from:', playersUrl);
          const playersResponse = await fetch(playersUrl);
          console.log('[Lobby] Players response:', playersResponse.status, playersResponse.ok);
          
          if (playersResponse.ok) {
            const playersData = await playersResponse.json();
            console.log('[Lobby] Players data:', playersData);
            setIsHost(playersData.isHost || false);
            setOpponentJoined(playersData.playerCount >= 2);
            console.log('[Lobby] Setting isHost:', playersData.isHost, 'opponentJoined:', playersData.playerCount >= 2);
            setIsCheckingStatus(false);
          } else {
            const errorText = await playersResponse.text().catch(() => 'Unknown error');
            console.error('[Lobby] Failed to get players:', playersResponse.status, errorText);
            setIsCheckingStatus(false);
          }
        } else {
          const errorText = await response.text().catch(() => 'Unknown error');
          console.error('[Lobby] Failed to get game status:', response.status, errorText);
          setIsCheckingStatus(false);
        }
      } catch (error) {
        console.error('[Lobby] Error checking game status:', error);
        setIsCheckingStatus(false);
      }
      return false;
    };

    // Initialize Pusher
    const pusherKey = import.meta.env.VITE_PUSHER_KEY;
    const pusherCluster = import.meta.env.VITE_PUSHER_CLUSTER;

    if (!pusherKey || !pusherCluster) {
      console.error('[Lobby] Pusher credentials not configured');
      // Still check game status even without Pusher
      checkGameStatus();
      return;
    }

    const pusherInstance = new Pusher(pusherKey, {
      cluster: pusherCluster,
      authEndpoint: '/api/pusher/auth',
    });

    setPusher(pusherInstance);

    // Subscribe to the game channel - use the state values directly
    const channelName = `private-game-${stateRoomCode}`;
    console.log('[Lobby] Subscribing to channel:', channelName);
    const gameChannel = pusherInstance.subscribe(channelName);

    // Listen for opponent-joined event - BIND IMMEDIATELY to avoid race conditions
    const opponentJoinedHandler = async () => {
      console.log('[Lobby] Opponent joined event received! Re-checking game status...');
      setOpponentJoined(true);
      // Re-check game status to determine if we're the host and update state
      await checkGameStatus();
    };
    gameChannel.bind('opponent-joined', opponentJoinedHandler);

    // Listen for game-start event - BIND IMMEDIATELY
    const gameStartHandler = (data: { questions: Question[]; gameId: number; startTime?: number }) => {
      console.log('[Lobby] ===== GAME-START EVENT RECEIVED =====');
      console.log('[Lobby] Channel:', channelName);
      console.log('[Lobby] isHost:', isHost);
      console.log('[Lobby] Event data:', JSON.stringify(data, null, 2));
      console.log('[Lobby] Questions count:', data.questions?.length);
      console.log('[Lobby] GameId:', data.gameId);
      
      if (!data.questions || !data.gameId) {
        console.error('[Lobby] Invalid game-start event data:', data);
        return;
      }
      
      // Cancel fallback navigation if Pusher event arrives first
      if (fallbackNavigationTimeoutRef.current) {
        console.log('[Lobby] Cancelling fallback navigation timeout');
        clearTimeout(fallbackNavigationTimeoutRef.current);
        fallbackNavigationTimeoutRef.current = null;
      }
      
      if (hasNavigatedRef.current) {
        console.log('[Lobby] Already navigated, ignoring duplicate event');
        return;
      }
      
      setQuestions(data.questions);
      setIsStarting(true);
      hasNavigatedRef.current = true;
      console.log('[Lobby] Navigating to game room:', `/game/${data.gameId}`);
      // Navigate to game room immediately - both players will see ready/set/go animation
      navigate(`/game/${data.gameId}`, { 
        state: { 
          questions: data.questions, 
          gameId: data.gameId,
          sessionId: stateSessionId,
          roomCode: stateRoomCode,
          startTime: data.startTime,
        } 
      });
    };
    gameChannel.bind('game-start', gameStartHandler);
    console.log('[Lobby] game-start event handler bound to channel:', channelName);
    
    setChannel(gameChannel);

    // Check game status immediately (in case opponent already joined before we subscribed)
    const statusCheckTimeout = setTimeout(() => {
      console.warn('[Lobby] Status check timeout after 10 seconds, stopping loading state');
      setIsCheckingStatus(false);
    }, 10000);
    
    checkGameStatus().then(() => {
      clearTimeout(statusCheckTimeout);
    }).catch(() => {
      clearTimeout(statusCheckTimeout);
    });

    gameChannel.bind('pusher:subscription_succeeded', async () => {
      console.log('[Lobby] Successfully subscribed to channel:', channelName);
      console.log('[Lobby] Current state - isHost:', isHost, 'opponentJoined:', opponentJoined);
      // After subscribing, check if game already started and determine if host
      await checkGameStatus();
      console.log('[Lobby] After checkGameStatus - isHost:', isHost, 'opponentJoined:', opponentJoined);
    });

    gameChannel.bind('pusher:subscription_error', (error: any) => {
      console.error('[Lobby] Subscription error:', error);
    });

    return () => {
      gameChannel.unbind('game-start', gameStartHandler);
      gameChannel.unbind('opponent-joined', opponentJoinedHandler);
      gameChannel.unbind_all();
      gameChannel.unsubscribe();
      
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
      
      if (fallbackNavigationTimeoutRef.current) {
        clearTimeout(fallbackNavigationTimeoutRef.current);
        fallbackNavigationTimeoutRef.current = null;
      }
      
      pusherInstance.disconnect();
    };
  }, [gameId, navigate, locationState]);

  const handleStartGame = async () => {
    setIsStarting(true);
    console.log('[Lobby] handleStartGame called with gameId:', gameId, 'sessionId:', sessionId);
    try {
      const response = await fetch('/api/games?action=start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'start',
          gameId: parseInt(gameId || '0', 10),
          sessionId,
        }),
      });

      console.log('[Lobby] Start game response status:', response.status, response.ok);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Failed to start game' }));
        console.error('[Lobby] Start game failed:', errorData);
        throw new Error(errorData.message || 'Failed to start game');
      }

      const data = await response.json();
      console.log('[Lobby] Start game response data:', data);
      console.log('[Lobby] Waiting for Pusher game-start event...');
      // Navigation will happen via Pusher event
      // But also navigate directly as fallback if Pusher event is delayed
      if (data.questions && data.gameId) {
        fallbackNavigationTimeoutRef.current = setTimeout(() => {
          if (!hasNavigatedRef.current) {
            console.log('[Lobby] Fallback navigation after 1 second (Pusher event not received)');
            hasNavigatedRef.current = true;
            navigate(`/game/${data.gameId}`, {
              state: {
                questions: data.questions,
                gameId: data.gameId,
                sessionId: sessionId,
                roomCode: roomCode,
                startTime: data.startTime,
              },
            });
          }
        }, 1000);
      }
    } catch (error: any) {
      console.error('[Lobby] Error starting game:', error);
      alert(`Failed to start game: ${error.message}`);
      setIsStarting(false);
    }
  };

  const shareLink = `${window.location.origin}/multiplayer?join=${roomCode}`;

  return (
    <div className="max-w-4xl mx-auto p-6 bg-white dark:bg-slate-900 rounded-3xl shadow-xl border border-slate-200 dark:border-slate-800">
      <div className="text-center">
        {isCheckingStatus ? (
          <>
            <h1 className="text-4xl sm:text-5xl font-extrabold text-slate-800 dark:text-white mb-4">
              Loading...
            </h1>
            <div className="animate-pulse">
              <p className="text-xl text-slate-500 dark:text-slate-400">Checking game status...</p>
            </div>
          </>
        ) : isHost ? (
          !opponentJoined ? (
            <>
              <h1 className="text-4xl sm:text-5xl font-extrabold text-slate-800 dark:text-white mb-4">
                Waiting for Opponent...
              </h1>
              <div className="mb-6">
                <p className="text-xl text-slate-600 dark:text-slate-300 mb-4">Share this code with your friend:</p>
                <div className="inline-block px-8 py-4 bg-blue-100 dark:bg-blue-500/20 rounded-2xl border-2 border-blue-500">
                  <p className="text-5xl font-bold text-blue-700 dark:text-blue-300 tracking-wider">{roomCode}</p>
                </div>
              </div>

              <div className="mb-6">
                <p className="text-lg text-slate-600 dark:text-slate-400 mb-2">Or share this link:</p>
                <div className="flex gap-2 items-center justify-center">
                  <input
                    type="text"
                    value={shareLink}
                    readOnly
                    className="flex-1 px-4 py-2 text-sm border-2 border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200"
                  />
                  <button
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(shareLink);
                        setLinkCopied(true);
                        setTimeout(() => setLinkCopied(false), 3000);
                      } catch (err) {
                        // Fallback for browsers that don't support clipboard API
                        const input = document.createElement('input');
                        input.value = shareLink;
                        document.body.appendChild(input);
                        input.select();
                        try {
                          document.execCommand('copy');
                          setLinkCopied(true);
                          setTimeout(() => setLinkCopied(false), 3000);
                        } catch (fallbackErr) {
                          setLinkCopied(false);
                        }
                        document.body.removeChild(input);
                      }
                    }}
                    className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Copy
                  </button>
                </div>
                {linkCopied && (
                  <p className="text-sm text-green-600 dark:text-green-400 mt-2 text-center">
                    Link copied to clipboard!
                  </p>
                )}
              </div>

              <div className="animate-pulse">
                <p className="text-slate-500 dark:text-slate-400">Waiting for another player to join...</p>
              </div>
            </>
          ) : (
            <>
              <h1 className="text-4xl sm:text-5xl font-extrabold text-slate-800 dark:text-white mb-4">
                Opponent Joined!
              </h1>
              <div className="mb-6 p-4 bg-green-100 dark:bg-green-500/20 border-2 border-green-500 rounded-lg">
                <p className="text-xl text-green-700 dark:text-green-400 font-bold">Ready to start?</p>
              </div>
              <button
                onClick={handleStartGame}
                disabled={isStarting}
                className="px-12 py-4 text-2xl font-bold text-white bg-green-600 rounded-full shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:scale-100"
              >
                {isStarting ? 'Starting...' : 'Start Game'}
              </button>
            </>
          )
        ) : (
          <>
            <h1 className="text-4xl sm:text-5xl font-extrabold text-slate-800 dark:text-white mb-4">
              Waiting for Host to Start
            </h1>
            <div className="animate-pulse">
              <p className="text-xl text-slate-500 dark:text-slate-400">The host will start the game soon...</p>
            </div>
          </>
        )}

        {isStarting && (
          <div className="mt-6 animate-fade-in">
            <p className="text-2xl text-green-600 dark:text-green-400 font-bold">Game Starting!</p>
          </div>
        )}
      </div>
    </div>
  );
};

