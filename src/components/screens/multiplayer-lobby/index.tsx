import React, { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type {
  AIGameConfig,
  GameMode,
  Operation,
  Player,
  Question,
  RoomSettings,
  Team,
} from '@shared/types';
import {
  assignPlayerToTeam,
  cancelQuickMatch,
  createLocalAIGame,
  createRoom,
  getOrCreatePlayerId,
  joinRoom,
  leaveRoom,
  quickMatch,
  setReady,
  startReadyPhase,
  updateRoomSettings,
} from '../../../lib/multiplayer';
import { logger } from '../../../lib/logger';
import { usePusherChannel } from '../../../hooks/usePusherChannel';
import { AIModeFlow, type AIModeFlowState } from './AIModeFlow';
import { CreateRoomFlow } from './CreateRoomFlow';
import { JoinRoomFlow } from './JoinRoomFlow';
import { LobbyHome } from './LobbyHome';
import { PrivateRoomScreen } from './PrivateRoomScreen';
import { QuickMatchFlow, QuickMatchSearching } from './QuickMatchFlow';
import { ReadyScreen } from './ReadyScreen';
import {
  getNumbersForOperation,
  initialLobbyScreen,
  lobbyReducer,
  operationLabels,
  type LobbyTab,
  type SettingsPatch,
} from './types';

export interface MultiplayerLobbyScreenProps {
  isDarkMode: boolean;
  toggleDarkMode: () => void;
  onGameStart: (
    roomId: string,
    playerId: string,
    playerName: string,
    questions: Question[],
    isHost: boolean,
    players: Player[],
    teams: Team[],
    gameMode: GameMode,
    timeLimit?: number,
    aiConfig?: AIGameConfig
  ) => void;
  rematchData?: {
    roomId: string;
    roomCode: string;
    isQuickMatch: boolean;
    players: Player[];
    settings: RoomSettings;
    teams: Team[];
  } | null;
  onRematchConsumed?: () => void;
}

const DEFAULT_SELECTED = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

const getInitialTab = (
  joinCodeFromUrl: string | undefined,
  tabParam: string | null
): LobbyTab => {
  if (joinCodeFromUrl) return 'join';
  if (tabParam === 'create' || tabParam === 'join' || tabParam === 'quickmatch' || tabParam === 'aimode') {
    return tabParam;
  }
  return 'create';
};

/**
 * Top-level controller for the multiplayer lobby. Owns all networking
 * effects and screen routing. Renders one of `LobbyHome`,
 * `QuickMatchSearching`, `PrivateRoomScreen`, or `ReadyScreen` based on
 * the current `LobbyScreen` from the reducer.
 */
export const MultiplayerLobbyScreen: React.FC<MultiplayerLobbyScreenProps> = ({
  isDarkMode,
  toggleDarkMode,
  onGameStart,
  rematchData,
  onRematchConsumed,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { roomCode: joinCodeFromUrl } = useParams<{ roomCode?: string }>();
  const [searchParams] = useSearchParams();

  const [screen, dispatch] = useReducer(lobbyReducer, initialLobbyScreen);

  const [activeTab, setActiveTab] = useState<LobbyTab>(() =>
    getInitialTab(joinCodeFromUrl, searchParams.get('tab'))
  );
  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab === 'create' || tab === 'join' || tab === 'quickmatch' || tab === 'aimode') {
      setActiveTab(tab);
    }
  }, [searchParams, location.search]);

  const [playerName, setPlayerName] = useState<string>(
    () => localStorage.getItem('mathWhizPlayerName') || ''
  );
  const [nameError, setNameError] = useState(false);
  const [playerId] = useState<string>(() => getOrCreatePlayerId());

  // Room state.
  const [roomId, setRoomId] = useState<string | null>(null);
  const [roomCode, setRoomCode] = useState<string>('');
  const [joinUrl, setJoinUrl] = useState<string>('');
  const [players, setPlayers] = useState<Player[]>([]);
  const [isHost, setIsHost] = useState<boolean>(false);

  // Settings.
  const [operation, setOperation] = useState<Operation>('multiplication');
  const [selectedNumbers, setSelectedNumbers] = useState<number[]>(DEFAULT_SELECTED);
  const [questionCount, setQuestionCount] = useState<number>(10);
  const [timeLimit, setTimeLimit] = useState<number>(0);
  const [maxPlayers, setMaxPlayers] = useState<number>(2);
  const [gameMode, setGameMode] = useState<GameMode>('ffa');
  const [teams, setTeams] = useState<Team[]>([]);

  // AI mode form (independent from room state).
  const [aiState, setAiState] = useState<AIModeFlowState>({
    difficulty: 'medium',
    operation: 'multiplication',
    advancedMode: false,
    questionCount: 10,
    timeLimit: 0,
    selectedNumbers: DEFAULT_SELECTED,
  });
  const [isStartingAIGame, setIsStartingAIGame] = useState<boolean>(false);

  // Join state.
  const [joinCodeInput, setJoinCodeInput] = useState<string>(joinCodeFromUrl || '');
  const [joinError, setJoinError] = useState<string | null>(null);

  // Quick match state.
  const [quickMatchOperation, setQuickMatchOperation] = useState<Operation>('multiplication');
  const [myReady, setMyReady] = useState<boolean>(false);
  const [readyStates, setReadyStates] = useState<Record<string, boolean>>({});

  // Loading states.
  const [isCreating, setIsCreating] = useState<boolean>(false);
  const [isJoining, setIsJoining] = useState<boolean>(false);
  const [isStarting, setIsStarting] = useState<boolean>(false);

  // Refs to give Pusher handlers fresh values without re-subscribing.
  const playersRef = useRef(players);
  const teamsRef = useRef(teams);
  const gameModeRef = useRef(gameMode);
  const timeLimitRef = useRef(timeLimit);
  const screenRef = useRef(screen);
  useEffect(() => { playersRef.current = players; }, [players]);
  useEffect(() => { teamsRef.current = teams; }, [teams]);
  useEffect(() => { gameModeRef.current = gameMode; }, [gameMode]);
  useEffect(() => { timeLimitRef.current = timeLimit; }, [timeLimit]);
  useEffect(() => { screenRef.current = screen; }, [screen]);

  // Persist player name.
  useEffect(() => {
    if (playerName) {
      localStorage.setItem('mathWhizPlayerName', playerName);
    }
  }, [playerName]);

  // Rematch handling: drop straight into the ready screen with the
  // previous room's settings.
  useEffect(() => {
    if (!rematchData || !rematchData.roomId) return;
    logger.log('[Lobby] Rematch data received:', rematchData);
    const s = rematchData.settings;
    setRoomId(rematchData.roomId);
    setRoomCode(rematchData.roomCode);
    setOperation(s.operation);
    setSelectedNumbers(s.selectedNumbers || DEFAULT_SELECTED);
    setQuestionCount(s.questionCount || 10);
    setTimeLimit(s.timeLimit || 0);
    setMaxPlayers(s.maxPlayers || 2);
    setGameMode(s.gameMode || 'ffa');
    setTeams(rematchData.teams || []);
    setPlayers(rematchData.players.map(p => ({ ...p, isReady: false })));
    const me = rematchData.players.find(p => p.id === playerId);
    setIsHost(me?.isHost || false);
    setMyReady(false);
    setReadyStates({});
    dispatch({ type: 'BEGIN_REMATCH', isQuickMatch: rematchData.isQuickMatch });
    if (onRematchConsumed) onRematchConsumed();
  }, [rematchData, onRematchConsumed, playerId]);

  // Room channel subscription.
  const onGameStartRef = useRef(onGameStart);
  useEffect(() => { onGameStartRef.current = onGameStart; }, [onGameStart]);
  const playerNameRef = useRef(playerName);
  useEffect(() => { playerNameRef.current = playerName; }, [playerName]);
  const isHostRef = useRef(isHost);
  useEffect(() => { isHostRef.current = isHost; }, [isHost]);

  usePusherChannel(roomId ? `room-${roomId}` : null, {
    'player-joined': (data: { player: Player }) => {
      logger.log('[Lobby] player-joined event:', data);
      setPlayers(prev => (prev.find(p => p.id === data.player.id) ? prev : [...prev, data.player]));
    },
    'player-left': (data: { playerId: string }) => {
      logger.log('[Lobby] player-left event:', data);
      if (data.playerId !== playerId && screenRef.current.kind === 'quickmatch-room') {
        dispatch({ type: 'OPPONENT_LEFT' });
      }
      setPlayers(prev => prev.filter(p => p.id !== data.playerId));
    },
    'player-ready': (data: { playerId: string; isReady: boolean }) => {
      logger.log('[Lobby] player-ready event:', data);
      setReadyStates(prev => ({ ...prev, [data.playerId]: data.isReady }));
      setPlayers(prev =>
        prev.map(p => (p.id === data.playerId ? { ...p, isReady: data.isReady } : p))
      );
    },
    'settings-updated': (data: { settings: RoomSettings }) => {
      logger.log('[Lobby] settings-updated event:', data);
      setOperation(data.settings.operation);
      setSelectedNumbers(data.settings.selectedNumbers);
      setQuestionCount(data.settings.questionCount);
      setTimeLimit(data.settings.timeLimit);
      setMaxPlayers(data.settings.maxPlayers || 2);
      setGameMode(data.settings.gameMode || 'ffa');
    },
    'teams-updated': (data: { teams: Team[]; players: Player[] }) => {
      logger.log('[Lobby] teams-updated event:', data);
      setTeams(data.teams);
      setPlayers(data.players);
    },
    'ready-phase': (data: { settings?: RoomSettings }) => {
      logger.log('[Lobby] ready-phase event received');
      dispatch({ type: 'BEGIN_READY_PHASE' });
      setMyReady(false);
      setReadyStates({});
      if (data.settings) {
        setMaxPlayers(data.settings.maxPlayers || 2);
        setGameMode(data.settings.gameMode || 'ffa');
      }
    },
    'game-starting': (data: { questions: Question[]; teams?: Team[]; players?: Player[] }) => {
      logger.log('[Lobby] game-starting event:', data);
      if (data.teams) setTeams(data.teams);
      if (data.players) setPlayers(data.players);
      const currentPlayers: Player[] = data.players || playersRef.current;
      const eventTeams: Team[] = data.teams || teamsRef.current;
      if (!roomId) return;
      onGameStartRef.current(
        roomId,
        playerId,
        playerNameRef.current,
        data.questions,
        isHostRef.current,
        currentPlayers,
        eventTeams,
        gameModeRef.current,
        timeLimitRef.current
      );
    },
    'player-disconnected': (data: { playerId: string }) => {
      logger.log('[Lobby] player-disconnected event:', data);
      setPlayers(prev =>
        prev.map(p => (p.id === data.playerId ? { ...p, connected: false } : p))
      );
    },
  });

  // Quick-match search channel.
  const isSearching = screen.kind === 'searching';
  usePusherChannel(isSearching ? `quickmatch-${playerId}` : null, {
    'match-found': (data: {
      roomId: string;
      roomCode: string;
      opponent: { id: string; name: string };
      operation: string;
    }) => {
      logger.log('[Lobby] match-found event:', data);
      setRoomId(data.roomId);
      setRoomCode(data.roomCode);
      setIsHost(false);
      setOperation(data.operation as Operation);
      setPlayers([
        { id: playerId, name: playerName, isHost: false, isReady: false, connected: true },
        {
          id: data.opponent.id,
          name: data.opponent.name,
          isHost: false,
          isReady: false,
          connected: true,
        },
      ]);
      dispatch({ type: 'MATCH_FOUND' });
    },
  });

  // ---- Handlers ----

  // Validates that a name has been entered before starting any game flow.
  // On failure it flags the name field, scrolls it into view and focuses it
  // so the user is told to enter their name at the top.
  const requireName = (): boolean => {
    if (playerName.trim()) return true;
    setNameError(true);
    const el = document.getElementById('mp-player-name');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      window.setTimeout(() => (el as HTMLInputElement).focus(), 150);
    }
    return false;
  };

  const handlePlayerNameChange = (name: string) => {
    setPlayerName(name);
    if (name.trim()) setNameError(false);
  };

  const handleCreateRoom = async () => {
    if (!requireName()) return;
    setIsCreating(true);
    try {
      const result = await createRoom(playerId, playerName);
      if (result.success && result.roomId) {
        setRoomId(result.roomId);
        setRoomCode(result.roomCode || '');
        setJoinUrl(result.joinUrl || '');
        setIsHost(true);
        setPlayers([
          { id: playerId, name: playerName, isHost: true, isReady: false, connected: true },
        ]);
        dispatch({ type: 'CREATE_OR_JOIN_PRIVATE' });
      } else {
        alert(result.error || 'Failed to create room');
      }
    } catch (error) {
      console.error('Error creating room:', error);
      alert('Failed to create room');
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoinRoom = async () => {
    if (!requireName()) return;
    if (!joinCodeInput.trim()) {
      setJoinError('Please enter a room code');
      return;
    }
    setIsJoining(true);
    setJoinError(null);
    try {
      const result = await joinRoom(joinCodeInput.toUpperCase(), playerId, playerName);
      if (result.success && result.roomId) {
        setRoomId(result.roomId);
        setRoomCode(joinCodeInput.toUpperCase());
        setIsHost(false);
        setPlayers(result.room.players);
        setOperation(result.room.settings.operation);
        setSelectedNumbers(result.room.settings.selectedNumbers);
        setQuestionCount(result.room.settings.questionCount);
        setTimeLimit(result.room.settings.timeLimit);
        setMaxPlayers(result.room.settings.maxPlayers || 2);
        setGameMode(result.room.settings.gameMode || 'ffa');
        if (result.room.teams) setTeams(result.room.teams);
        dispatch({ type: 'CREATE_OR_JOIN_PRIVATE' });
      } else {
        setJoinError(result.error || 'Failed to join room');
      }
    } catch (error) {
      console.error('Error joining room:', error);
      setJoinError('Failed to join room');
    } finally {
      setIsJoining(false);
    }
  };

  const handleStartGame = async () => {
    if (!roomId) return;
    if (players.length < 2) {
      alert('Need at least 2 players to start');
      return;
    }
    setIsStarting(true);
    try {
      const result = await startReadyPhase(roomId, playerId, {
        operation,
        selectedNumbers,
        questionCount,
        timeLimit,
        maxPlayers,
        gameMode,
      });
      if (!result.success) alert(result.error || 'Failed to start ready phase');
    } catch (error) {
      console.error('Error starting ready phase:', error);
      alert('Failed to start ready phase');
    } finally {
      setIsStarting(false);
    }
  };

  const handleQuickMatch = async () => {
    logger.log('[Lobby] handleQuickMatch called');
    if (!requireName()) return;
    dispatch({ type: 'START_SEARCH', operation: quickMatchOperation });
    try {
      const result = await quickMatch(playerId, playerName, quickMatchOperation);
      logger.log('[Lobby] quickMatch result:', result);
      if (result.success && result.matched && result.roomId) {
        setRoomId(result.roomId);
        setRoomCode(result.roomCode || '');
        setIsHost(false);
        setOperation(quickMatchOperation);
        if (result.opponent) {
          setPlayers([
            {
              id: result.opponent.id,
              name: result.opponent.name,
              isHost: false,
              isReady: false,
              connected: true,
            },
            { id: playerId, name: playerName, isHost: false, isReady: false, connected: true },
          ]);
        }
        dispatch({ type: 'MATCH_FOUND' });
      }
    } catch (error) {
      console.error('Error in quick match:', error);
      dispatch({ type: 'CANCEL_SEARCH' });
      alert('Failed to start matchmaking');
    }
  };

  const handleCancelSearch = async () => {
    dispatch({ type: 'CANCEL_SEARCH' });
    await cancelQuickMatch(playerId);
  };

  const handleSetReady = async () => {
    if (!roomId) return;
    const newReady = !myReady;
    setMyReady(newReady);
    try {
      const result = await setReady(roomId, playerId, newReady);
      logger.log('[Lobby] setReady result:', result);
    } catch (error) {
      console.error('Error setting ready:', error);
      setMyReady(!newReady);
    }
  };

  const handleSettingsChange = useCallback(
    async (patch: SettingsPatch) => {
      if (!roomId || !isHost) return;
      const merged: RoomSettings = {
        operation: patch.operation ?? operation,
        selectedNumbers: patch.selectedNumbers ?? selectedNumbers,
        questionCount: patch.questionCount ?? questionCount,
        timeLimit: patch.timeLimit ?? timeLimit,
        maxPlayers: patch.maxPlayers ?? maxPlayers,
        gameMode: patch.gameMode ?? gameMode,
      };
      // Optimistically apply.
      setOperation(merged.operation);
      setSelectedNumbers(merged.selectedNumbers);
      setQuestionCount(merged.questionCount);
      setTimeLimit(merged.timeLimit);
      setMaxPlayers(merged.maxPlayers);
      setGameMode(merged.gameMode);
      const result = await updateRoomSettings(roomId, playerId, merged);
      if (result.teams) setTeams(result.teams);
      if (result.players) setPlayers(result.players);
    },
    [roomId, isHost, playerId, operation, selectedNumbers, questionCount, timeLimit, maxPlayers, gameMode]
  );

  const localAssignTeam = (targetPlayerId: string, teamId: string) => {
    if (!roomId) return;
    assignPlayerToTeam(roomId, playerId, targetPlayerId, teamId);
  };

  const handleLeaveRoom = async () => {
    if (roomId) await leaveRoom(roomId, playerId, playerName);
    setRoomId(null);
    setPlayers([]);
    setMyReady(false);
    setReadyStates({});
    dispatch({ type: 'GO_HOME' });
  };

  const handleContinueMatchmaking = () => {
    setRoomId(null);
    setPlayers([]);
    setMyReady(false);
    setReadyStates({});
    handleQuickMatch();
  };

  const handleStartAIGame = async () => {
    if (!requireName()) return;
    setIsStartingAIGame(true);
    try {
      const settings = aiState.advancedMode
        ? {
            operation: aiState.operation,
            selectedNumbers: aiState.selectedNumbers,
            questionCount: aiState.questionCount,
            timeLimit: aiState.timeLimit,
          }
        : {
            operation: aiState.operation,
            selectedNumbers: getNumbersForOperation(aiState.operation),
            questionCount: 10,
            timeLimit: 0,
          };
      const game = createLocalAIGame(playerId, playerName, aiState.difficulty, settings);
      onGameStart(
        game.roomId,
        playerId,
        playerName,
        game.questions,
        false,
        game.players,
        [],
        'ffa',
        settings.timeLimit,
        { difficulty: aiState.difficulty, settings }
      );
    } catch (error) {
      console.error('Error starting AI game:', error);
      alert('Failed to start AI game');
    } finally {
      setIsStartingAIGame(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  // ---- Render ----

  if (screen.kind === 'quickmatch-room') {
    return (
      <ReadyScreen
        isDarkMode={isDarkMode}
        toggleDarkMode={toggleDarkMode}
        playerId={playerId}
        playerName={playerName}
        players={players}
        teams={teams}
        gameMode={gameMode}
        myReady={myReady}
        readyStates={readyStates}
        summary={`${operationLabels[operation]} • 10 Questions • All Numbers • No Time Limit`}
        variant='quickmatch'
        opponentLeft={screen.opponentLeft}
        onLeave={handleLeaveRoom}
        onToggleReady={handleSetReady}
        onContinueMatchmaking={handleContinueMatchmaking}
      />
    );
  }

  if (screen.kind === 'private-room' && screen.showReadyScreen) {
    const summary = `${operationLabels[operation]} • ${questionCount} Questions • ${
      timeLimit > 0 ? `${timeLimit}s` : 'No Time Limit'
    }`;
    return (
      <ReadyScreen
        isDarkMode={isDarkMode}
        toggleDarkMode={toggleDarkMode}
        playerId={playerId}
        playerName={playerName}
        players={players}
        teams={teams}
        gameMode={gameMode}
        myReady={myReady}
        readyStates={readyStates}
        summary={summary}
        variant='private'
        opponentLeft={false}
        onLeave={handleLeaveRoom}
        onToggleReady={handleSetReady}
        onContinueMatchmaking={handleContinueMatchmaking}
      />
    );
  }

  if (screen.kind === 'private-room') {
    return (
      <PrivateRoomScreen
        isDarkMode={isDarkMode}
        toggleDarkMode={toggleDarkMode}
        playerId={playerId}
        isHost={isHost}
        roomCode={roomCode}
        joinUrl={joinUrl}
        players={players}
        teams={teams}
        operation={operation}
        selectedNumbers={selectedNumbers}
        questionCount={questionCount}
        timeLimit={timeLimit}
        maxPlayers={maxPlayers}
        gameMode={gameMode}
        isStarting={isStarting}
        onLeave={handleLeaveRoom}
        onCopy={copyToClipboard}
        onSettingsChange={handleSettingsChange}
        onAssignTeam={localAssignTeam}
        onStartGame={handleStartGame}
      />
    );
  }

  if (screen.kind === 'searching') {
    return (
      <QuickMatchSearching operation={screen.operation} onCancel={handleCancelSearch} />
    );
  }

  return (
    <LobbyHome
      isDarkMode={isDarkMode}
      toggleDarkMode={toggleDarkMode}
      onBack={() => navigate('/')}
      playerName={playerName}
      onPlayerNameChange={handlePlayerNameChange}
      nameError={nameError}
      activeTab={activeTab}
      onTabChange={setActiveTab}
    >
      {activeTab === 'create' && (
        <CreateRoomFlow
          isCreating={isCreating}
          onCreate={handleCreateRoom}
        />
      )}
      {activeTab === 'join' && (
        <JoinRoomFlow
          joinCode={joinCodeInput}
          onJoinCodeChange={setJoinCodeInput}
          joinError={joinError}
          isJoining={isJoining}
          onJoin={handleJoinRoom}
        />
      )}
      {activeTab === 'quickmatch' && (
        <QuickMatchFlow
          operation={quickMatchOperation}
          onOperationChange={setQuickMatchOperation}
          onSearch={handleQuickMatch}
        />
      )}
      {activeTab === 'aimode' && (
        <AIModeFlow
          state={aiState}
          setState={setAiState}
          isStartingAIGame={isStartingAIGame}
          onStart={handleStartAIGame}
        />
      )}
    </LobbyHome>
  );
};

export default MultiplayerLobbyScreen;
