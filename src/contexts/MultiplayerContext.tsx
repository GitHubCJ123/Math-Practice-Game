import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type {
  AIGameConfig,
  GameMode,
  MultiplayerResult,
  Player,
  Question,
  RematchPayload,
  RoomSettings,
  Team,
  TeamResult,
} from '@shared/types';

export interface RematchData {
  roomId: string;
  roomCode: string;
  isQuickMatch: boolean;
  players: Player[];
  settings: RoomSettings;
  teams: Team[];
}

interface MultiplayerState {
  roomId: string | null;
  playerId: string;
  playerName: string;
  questions: Question[];
  players: Player[];
  teams: Team[];
  gameMode: GameMode;
  isHost: boolean;
  results: MultiplayerResult[];
  teamResults: TeamResult[];
  timeLimit: number;
  rematchData: RematchData | null;
  // Set when the current game is against AI, so results can offer a replay.
  aiConfig: AIGameConfig | null;
}

interface MultiplayerContextValue extends MultiplayerState {
  startGame: (args: {
    roomId: string;
    playerId: string;
    playerName: string;
    questions: Question[];
    isHost: boolean;
    players: Player[];
    teams: Team[];
    gameMode: GameMode;
    timeLimit?: number;
    aiConfig?: AIGameConfig | null;
  }) => void;
  finishGame: (results: MultiplayerResult[], teamResults?: TeamResult[]) => void;
  beginRematch: (data: RematchPayload) => void;
  consumeRematch: () => void;
  exitMultiplayer: () => void;
}

const MultiplayerContext = createContext<MultiplayerContextValue | null>(null);

const INITIAL: MultiplayerState = {
  roomId: null,
  playerId: '',
  playerName: '',
  questions: [],
  players: [],
  teams: [],
  gameMode: 'ffa',
  isHost: false,
  results: [],
  teamResults: [],
  timeLimit: 0,
  rematchData: null,
  aiConfig: null,
};

export const MultiplayerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<MultiplayerState>(INITIAL);

  const startGame = useCallback<MultiplayerContextValue['startGame']>(args => {
    setState(prev => ({
      ...prev,
      roomId: args.roomId,
      playerId: args.playerId,
      playerName: args.playerName,
      questions: args.questions,
      isHost: args.isHost,
      players: args.players,
      teams: args.teams,
      gameMode: args.gameMode,
      timeLimit: args.timeLimit ?? 0,
      aiConfig: args.aiConfig ?? null,
      results: [],
      teamResults: [],
    }));
  }, []);

  const finishGame = useCallback<MultiplayerContextValue['finishGame']>(
    (results, teamResults) => {
      setState(prev => ({
        ...prev,
        results,
        teamResults: teamResults ?? prev.teamResults,
      }));
    },
    []
  );

  const beginRematch = useCallback<MultiplayerContextValue['beginRematch']>(data => {
    setState(prev => ({
      ...prev,
      rematchData: {
        roomId: data.newRoomId,
        roomCode: data.newRoomCode,
        isQuickMatch: data.isQuickMatch,
        players: data.players,
        settings: data.settings,
        teams: data.teams || [],
      },
      roomId: data.newRoomId,
      questions: [],
      results: [],
      teamResults: [],
    }));
  }, []);

  const consumeRematch = useCallback(() => {
    setState(prev => ({ ...prev, rematchData: null }));
  }, []);

  const exitMultiplayer = useCallback(() => {
    setState(prev => ({
      ...INITIAL,
      playerId: prev.playerId,
      playerName: prev.playerName,
    }));
  }, []);

  const value = useMemo<MultiplayerContextValue>(
    () => ({
      ...state,
      startGame,
      finishGame,
      beginRematch,
      consumeRematch,
      exitMultiplayer,
    }),
    [state, startGame, finishGame, beginRematch, consumeRematch, exitMultiplayer]
  );

  return <MultiplayerContext.Provider value={value}>{children}</MultiplayerContext.Provider>;
};

export const useMultiplayerContext = (): MultiplayerContextValue => {
  const ctx = useContext(MultiplayerContext);
  if (!ctx) {
    throw new Error('useMultiplayerContext must be used within a MultiplayerProvider');
  }
  return ctx;
};
