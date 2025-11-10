import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Pusher from 'pusher-js';
import type { Question } from '../types';

interface LobbyProps {
  roomCode?: string;
  sessionId?: string;
}

export const Lobby: React.FC<LobbyProps> = () => {
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useNavigate();
  const [roomCode, setRoomCode] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [isHost, setIsHost] = useState(false);
  const [opponentJoined, setOpponentJoined] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [pusher, setPusher] = useState<Pusher | null>(null);
  const [channel, setChannel] = useState<any>(null);

  useEffect(() => {
    // Get roomCode and sessionId from location state
    const locationState = (window.history.state as any)?.usr;
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
      try {
        const response = await fetch(`/api/games/status?gameId=${gameId}&sessionId=${stateSessionId}`);
        if (response.ok) {
          const data = await response.json();
          
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
            return true;
          }

          // Check if user is host by checking player order
          const playersResponse = await fetch(`/api/games/players?gameId=${gameId}&sessionId=${stateSessionId}`);
          if (playersResponse.ok) {
            const playersData = await playersResponse.json();
            setIsHost(playersData.isHost || false);
            setOpponentJoined(playersData.playerCount >= 2);
          }
        }
      } catch (error) {
        console.error('[Lobby] Error checking game status:', error);
      }
      return false;
    };

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

    // Subscribe to the game channel - use the state values directly
    const channelName = `private-game-${stateRoomCode}`;
    console.log('[Lobby] Subscribing to channel:', channelName);
    const gameChannel = pusherInstance.subscribe(channelName);

    gameChannel.bind('pusher:subscription_succeeded', async () => {
      console.log('[Lobby] Successfully subscribed to channel');
      // After subscribing, check if game already started and determine if host
      await checkGameStatus();
    });

    gameChannel.bind('pusher:subscription_error', (error: any) => {
      console.error('[Lobby] Subscription error:', error);
    });

    // Listen for opponent-joined event
    const opponentJoinedHandler = () => {
      console.log('[Lobby] Opponent joined!');
      setOpponentJoined(true);
    };
    gameChannel.bind('opponent-joined', opponentJoinedHandler);

    // Listen for game-start event
    const gameStartHandler = (data: { questions: Question[]; gameId: number }) => {
      console.log('[Lobby] Game started!', data);
      setQuestions(data.questions);
      setIsStarting(true);
      // Navigate to game room immediately - both players will see ready/set/go animation
      navigate(`/game/${data.gameId}`, { 
        state: { 
          questions: data.questions, 
          gameId: data.gameId,
          sessionId: stateSessionId,
          roomCode: stateRoomCode,
        } 
      });
    };
    
    gameChannel.bind('game-start', gameStartHandler);

    setChannel(gameChannel);

    return () => {
      gameChannel.unbind('game-start', gameStartHandler);
      gameChannel.unbind('opponent-joined', opponentJoinedHandler);
      gameChannel.unbind_all();
      gameChannel.unsubscribe();
      pusherInstance.disconnect();
    };
  }, [gameId, navigate]);

  const handleStartGame = async () => {
    setIsStarting(true);
    try {
      const response = await fetch('/api/games/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameId: parseInt(gameId || '0', 10),
          sessionId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Failed to start game' }));
        throw new Error(errorData.message || 'Failed to start game');
      }

      const data = await response.json();
      // Navigation will happen via Pusher event
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
        {!opponentJoined ? (
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
                  onClick={() => {
                    navigator.clipboard.writeText(shareLink);
                    alert('Link copied to clipboard!');
                  }}
                  className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Copy
                </button>
              </div>
            </div>

            <div className="animate-pulse">
              <p className="text-slate-500 dark:text-slate-400">Waiting for another player to join...</p>
            </div>
          </>
        ) : isHost ? (
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

