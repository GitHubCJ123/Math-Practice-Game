import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import Pusher from 'pusher-js';
import type { Question } from '../types';

interface MatchmakingScreenProps {
  sessionId: string;
  pusherChannel: string;
  matchData?: {
    gameId: number;
    roomCode: string;
    questions: Question[];
    startTime?: number;
  } | null;
}

export const MatchmakingScreen: React.FC<MatchmakingScreenProps> = ({ sessionId, pusherChannel, matchData }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = location.state as any;
  const [pusher, setPusher] = useState<Pusher | null>(null);
  const [channel, setChannel] = useState<any>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [matchInfo, setMatchInfo] = useState<{
    gameId: number;
    roomCode: string;
    questions: Question[];
    startTime: number;
  } | null>(null);
  const isNavigatingRef = useRef(false);
  const isSubscribedRef = useRef(false);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const receivedPusherEventRef = useRef(false); // Track if we received the Pusher event
  const hasMatchInfoRef = useRef(false); // Track if we have match info to stop polling

  console.log('[MatchmakingScreen] Component mounted/re-rendered');
  console.log('[MatchmakingScreen] Props - sessionId:', sessionId);
  console.log('[MatchmakingScreen] Props - pusherChannel:', pusherChannel);
  console.log('[MatchmakingScreen] Props - matchData:', matchData);

  // Handle countdown - uses server's absolute timestamp for synchronization
  useEffect(() => {
    if (matchInfo && matchInfo.startTime) {
      const updateCountdown = () => {
        const now = Date.now();
        // Calculate remaining time based on server's absolute timestamp
        // This ensures both players see the same countdown regardless of when they received the event
        const remainingMs = matchInfo.startTime - now;
        const remainingSeconds = Math.ceil(remainingMs / 1000);
        
        // Only show countdown when 10 seconds or less remain
        // This ensures both players see "Starting in 10 seconds" at the same time
        if (remainingSeconds > 10) {
          // Still waiting, don't show countdown yet
          setCountdown(null);
        } else if (remainingMs <= 0) {
          // Countdown finished, navigate to game
          if (countdownIntervalRef.current) {
            clearInterval(countdownIntervalRef.current);
            countdownIntervalRef.current = null;
          }
          isNavigatingRef.current = true;
          navigate(`/game/${matchInfo.gameId}`, {
            state: {
              questions: matchInfo.questions,
              gameId: matchInfo.gameId,
              sessionId: sessionId,
              roomCode: matchInfo.roomCode,
            },
          });
        } else {
          // Show the actual countdown (10, 9, 8, ...)
          setCountdown(remainingSeconds);
        }
      };

      updateCountdown(); // Initial update
      // Update every 50ms for very smooth countdown and better synchronization
      countdownIntervalRef.current = setInterval(updateCountdown, 50);

      return () => {
        if (countdownIntervalRef.current) {
          clearInterval(countdownIntervalRef.current);
        }
      };
    }
  }, [matchInfo, sessionId, navigate]);

  useEffect(() => {
    // If we have matchData immediately (Player 2 who triggered the match), use it right away
    // Both players use the same server startTime, so countdowns will be synchronized
    if (matchData && matchData.gameId && matchData.startTime && !matchInfo) {
      console.log('[MatchmakingScreen] Using matchData immediately - Player 2');
      hasMatchInfoRef.current = true;
      setMatchInfo({
        gameId: matchData.gameId,
        roomCode: matchData.roomCode,
        questions: matchData.questions,
        startTime: matchData.startTime,
      });
    }

    // Initialize Pusher
    const pusherKey = import.meta.env.VITE_PUSHER_KEY;
    const pusherCluster = import.meta.env.VITE_PUSHER_CLUSTER;

    console.log('[MatchmakingScreen] Pusher key exists:', !!pusherKey);
    console.log('[MatchmakingScreen] Pusher cluster exists:', !!pusherCluster);

    if (!pusherKey || !pusherCluster) {
      console.error('[MatchmakingScreen] Pusher credentials not configured');
      console.error('[MatchmakingScreen] VITE_PUSHER_KEY:', pusherKey ? 'SET' : 'MISSING');
      console.error('[MatchmakingScreen] VITE_PUSHER_CLUSTER:', pusherCluster ? 'SET' : 'MISSING');
      
      // Even without Pusher, we can still poll for match status
      console.log('[MatchmakingScreen] Falling back to polling only (no Pusher)');
      const checkMatchStatus = async () => {
        try {
          console.log('[MatchmakingScreen] Checking matchmaking status for sessionId:', sessionId);
          const checkResponse = await fetch(`/api/matchmaking?action=check&sessionId=${sessionId}`);
          if (checkResponse.ok) {
            const status = await checkResponse.json();
            console.log('[MatchmakingScreen] Matchmaking status check result:', status);
            if (status.matched && status.gameId) {
              console.log('[MatchmakingScreen] Already matched! Fetching game info:', status);
              const gameResponse = await fetch(`/api/games?action=info&gameId=${status.gameId}&sessionId=${sessionId}`);
              if (gameResponse.ok) {
                const gameData = await gameResponse.json();
                console.log('[MatchmakingScreen] Game data fetched:', gameData);
                if (gameData.startTime) {
                  console.log('[MatchmakingScreen] Setting matchInfo from status check (no Pusher)');
                  hasMatchInfoRef.current = true;
                  setMatchInfo({
                    gameId: status.gameId,
                    roomCode: gameData.roomCode,
                    questions: gameData.questions,
                    startTime: gameData.startTime,
                  });
                  if (pollingIntervalRef.current) {
                    clearInterval(pollingIntervalRef.current);
                    pollingIntervalRef.current = null;
                  }
                }
              }
            }
          }
        } catch (error) {
          console.error('[MatchmakingScreen] Error checking matchmaking status:', error);
        }
      };
      
      // Poll immediately and every 2 seconds
      checkMatchStatus();
      if (!pollingIntervalRef.current) {
        pollingIntervalRef.current = setInterval(async () => {
          if (!hasMatchInfoRef.current && !isNavigatingRef.current) {
            console.log('[MatchmakingScreen] Polling for match status (no Pusher)...');
            await checkMatchStatus();
          } else {
            if (pollingIntervalRef.current) {
              clearInterval(pollingIntervalRef.current);
              pollingIntervalRef.current = null;
            }
          }
        }, 2000);
      }
      
      return;
    }

    const pusherInstance = new Pusher(pusherKey, {
      cluster: pusherCluster,
      authEndpoint: '/api/pusher/auth',
    });

    setPusher(pusherInstance);

    // Subscribe to the matchmaking channel
    console.log('[MatchmakingScreen] Subscribing to channel:', pusherChannel);
    console.log('[MatchmakingScreen] SessionId:', sessionId);
    console.log('[MatchmakingScreen] Has matchData:', !!matchData);
    const matchmakingChannel = pusherInstance.subscribe(pusherChannel);
    
    // Log subscription state changes
    matchmakingChannel.bind('pusher:subscription_error', (error: any) => {
      console.error('[MatchmakingScreen] Subscription error for channel', pusherChannel, ':', error);
    });

    // Listen for match-found event - BIND IMMEDIATELY to avoid race conditions
    // This is the authoritative source for Player 1
    const matchFoundHandler = (data: { 
      gameId: number; 
      roomCode: string; 
      sessionId: string;
      questions: Question[];
      startTime?: number;
    }) => {
      console.log('[MatchmakingScreen] Match found via Pusher!', data);
      receivedPusherEventRef.current = true;
      if (!data.startTime) {
        console.error('[MatchmakingScreen] No startTime in match data');
        return;
      }
      
      // Subscribe to game channel as backup once we have the room code
      // This ensures we can receive game-start events if needed
      if (data.roomCode && pusherInstance) {
        const gameChannelName = `private-game-${data.roomCode}`;
        console.log('[MatchmakingScreen] Subscribing to game channel after match found:', gameChannelName);
        const gameChannel = pusherInstance.subscribe(gameChannelName);
        
        gameChannel.bind('game-start', (gameStartData: { 
          questions: Question[];
          gameId: number;
          startTime?: number;
        }) => {
          console.log('[MatchmakingScreen] Received game-start event on game channel', gameStartData);
          if (gameStartData.startTime && gameStartData.questions) {
            // Use game-start event if it has more recent data
            setMatchInfo({
              gameId: gameStartData.gameId,
              roomCode: data.roomCode,
              questions: gameStartData.questions,
              startTime: gameStartData.startTime,
            });
          }
        });
      }
      
      // Always update matchInfo when we receive the event (even if we already have it)
      // This ensures Player 1 gets the event even if they received matchData initially
      hasMatchInfoRef.current = true;
      setMatchInfo({
        gameId: data.gameId,
        roomCode: data.roomCode,
        questions: data.questions,
        startTime: data.startTime,
      });
    };

    // Bind the event handler IMMEDIATELY, before subscription succeeds
    // This ensures we don't miss events sent right after subscription
    matchmakingChannel.bind('match-found', matchFoundHandler);
    setChannel(matchmakingChannel);
    
    matchmakingChannel.bind('pusher:subscription_succeeded', async () => {
      console.log('[MatchmakingScreen] Successfully subscribed to matchmaking channel:', pusherChannel);
      isSubscribedRef.current = true;
      
      // Check if we're already matched (Player 1 case - Player 2 already matched us)
      // If we're not in the queue anymore, we were matched, so fetch our game info
      // This is a fallback in case the Pusher event was missed
      const checkMatchStatus = async () => {
        try {
          console.log('[MatchmakingScreen] Checking matchmaking status for sessionId:', sessionId);
          const checkResponse = await fetch(`/api/matchmaking?action=check&sessionId=${sessionId}`);
          if (checkResponse.ok) {
            const status = await checkResponse.json();
            console.log('[MatchmakingScreen] Matchmaking status check result:', status);
            if (status.matched && status.gameId) {
              console.log('[MatchmakingScreen] Already matched! Fetching game info:', status);
              // We were matched while waiting to subscribe - fetch game details
              const gameResponse = await fetch(`/api/games?action=info&gameId=${status.gameId}&sessionId=${sessionId}`);
              if (gameResponse.ok) {
                const gameData = await gameResponse.json();
                console.log('[MatchmakingScreen] Game data fetched:', gameData);
                if (gameData.startTime) {
                  console.log('[MatchmakingScreen] Setting matchInfo from status check fallback');
                  hasMatchInfoRef.current = true;
                  setMatchInfo({
                    gameId: status.gameId,
                    roomCode: gameData.roomCode,
                    questions: gameData.questions,
                    startTime: gameData.startTime,
                  });
                  // Stop polling once we have match info
                  if (pollingIntervalRef.current) {
                    clearInterval(pollingIntervalRef.current);
                    pollingIntervalRef.current = null;
                  }
                }
              }
            }
          }
        } catch (error) {
          console.error('[MatchmakingScreen] Error checking matchmaking status:', error);
        }
      };
      
      // Check immediately
      await checkMatchStatus();
      
      // Also poll every 2 seconds as a fallback (in case Pusher event is delayed or missed)
      if (!pollingIntervalRef.current) {
        pollingIntervalRef.current = setInterval(async () => {
          // Only poll if we don't have match info yet and aren't navigating
          if (!hasMatchInfoRef.current && !isNavigatingRef.current) {
            console.log('[MatchmakingScreen] Polling for match status...');
            await checkMatchStatus();
          } else {
            // Stop polling if we have match info
            if (pollingIntervalRef.current) {
              clearInterval(pollingIntervalRef.current);
              pollingIntervalRef.current = null;
            }
          }
        }, 2000);
      }
    });

    matchmakingChannel.bind('pusher:subscription_error', (error: any) => {
      console.error('[MatchmakingScreen] Subscription error:', error);
    });

    // Also subscribe to game channel as backup (in case matchmaking channel event is missed)
    // This provides a fallback mechanism for both players
    const rematchRoomCode = locationState?.roomCode || matchData?.roomCode;
    
    // If we have a room code (from matchData or rematch), subscribe to game channel as backup
    if (rematchRoomCode) {
      const gameChannelName = `private-game-${rematchRoomCode}`;
      console.log('[MatchmakingScreen] Also subscribing to game channel as backup:', gameChannelName);
      const gameChannel = pusherInstance.subscribe(gameChannelName);
      
      gameChannel.bind('pusher:subscription_succeeded', () => {
        console.log('[MatchmakingScreen] Successfully subscribed to game channel as backup');
      });

      // Listen for game-start event as backup (sent to game channel when match is found)
      gameChannel.bind('game-start', (data: { 
        questions: Question[];
        gameId: number;
        startTime?: number;
      }) => {
        console.log('[MatchmakingScreen] Received game-start event on game channel (backup)', data);
        if (data.startTime && data.questions && !matchInfo) {
          console.log('[MatchmakingScreen] Using game-start event as backup to set matchInfo');
          setMatchInfo({
            gameId: data.gameId,
            roomCode: rematchRoomCode,
            questions: data.questions,
            startTime: data.startTime,
          });
        }
      });

      // Listen for rematch-accepted event (for rematch scenarios)
      gameChannel.bind('rematch-accepted', (data: { 
        questions: Question[];
        gameId: number;
        startTime?: number;
        roomCode?: string;
      }) => {
        console.log('[MatchmakingScreen] Rematch accepted event received on game channel', data);
        if (data.startTime && data.questions) {
          console.log('[MatchmakingScreen] Using rematch-accepted event to set matchInfo');
          setMatchInfo({
            gameId: data.gameId,
            roomCode: data.roomCode || rematchRoomCode,
            questions: data.questions,
            startTime: data.startTime,
          });
        }
      });
    }

    // Cleanup
    return () => {
      console.log('[MatchmakingScreen] Cleaning up');
      matchmakingChannel.unbind('match-found', matchFoundHandler);
      matchmakingChannel.unbind_all();
      matchmakingChannel.unsubscribe();
      
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
      
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
      
      if (!isNavigatingRef.current && isSubscribedRef.current) {
        console.log('[MatchmakingScreen] Canceling matchmaking');
        fetch('/api/matchmaking?action=cancel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'cancel', sessionId }),
        }).catch((error) => {
          console.error('[MatchmakingScreen] Failed to cancel matchmaking:', error);
        });
      }

      pusherInstance.disconnect();
    };
  }, [sessionId, pusherChannel, navigate, matchData, locationState]);

  const handleCancel = async () => {
    // Cancel matchmaking
    try {
      await fetch('/api/matchmaking?action=cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel', sessionId }),
      });
    } catch (error) {
      console.error('[MatchmakingScreen] Failed to cancel matchmaking:', error);
    }

    // Navigate back to multiplayer menu
    navigate('/multiplayer');
  };

  return (
    <div className="max-w-4xl mx-auto p-6 bg-white dark:bg-slate-900 rounded-3xl shadow-xl border border-slate-200 dark:border-slate-800">
      <div className="text-center">
        {countdown !== null && countdown > 0 ? (
          <>
            <h1 className="text-4xl sm:text-5xl font-extrabold text-slate-800 dark:text-white mb-4">
              Starting in {countdown} seconds
            </h1>
            <div className="mb-8">
              <div className="inline-block">
                <div className="w-32 h-32 border-8 border-green-500 rounded-full flex items-center justify-center">
                  <span className="text-6xl font-bold text-green-600 dark:text-green-400">{countdown}</span>
                </div>
              </div>
            </div>
            <p className="text-xl text-slate-600 dark:text-slate-300">
              Get ready!
            </p>
          </>
        ) : (
          <>
            <h1 className="text-4xl sm:text-5xl font-extrabold text-slate-800 dark:text-white mb-8">
              Matchmaking...
            </h1>
            
            <div className="mb-8">
              <div className="inline-block animate-pulse">
                <div className="w-24 h-24 border-8 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
              </div>
            </div>

            <p className="text-xl text-slate-600 dark:text-slate-300 mb-8">
              Looking for an opponent...
            </p>

            <button
              onClick={handleCancel}
              className="px-8 py-3 text-lg font-semibold text-slate-700 dark:text-slate-300 bg-slate-200 dark:bg-slate-700 rounded-full hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
            >
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  );
};
