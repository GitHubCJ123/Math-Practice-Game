
export type Operation =
  | 'multiplication'
  | 'division'
  | 'squares'
  | 'square-roots'
  | 'fraction-to-decimal'
  | 'decimal-to-fraction'
  | 'fraction-to-percent'
  | 'percent-to-fraction'
  | 'negative-numbers';

export const DEFAULT_QUESTION_COUNT = 10;
export const MIN_QUESTION_COUNT = 5;
export const MAX_QUESTION_COUNT = 50;
export const MAX_CONVERSION_QUESTION_COUNT = 25; // Limited by available conversions

export interface Question {
  num1: number;
  num2?: number; // num2 is optional for unary operations like squares/roots
  operation: Operation;
  answer: number | string;
  display?: string;
}

export interface QuizResult {
  question: Question;
  userAnswer: string;
  isCorrect: boolean;
}

export type GameState = 'selection' | 'quiz' | 'results';

/** A global announcement broadcast by an admin to every connected player. */
export interface BroadcastMessage {
  id: string;
  message: string;
  sentAt: number; // epoch milliseconds
}

/** Public Pusher channel + event used for global admin broadcasts. */
export const GLOBAL_BROADCAST_CHANNEL = 'global-broadcast';
export const GLOBAL_BROADCAST_EVENT = 'new-message';

declare global {
  interface Window {
    onFinishQuiz?: (answers: string[], time: number) => void;
  }
}

export interface HighScore {
  score: number;
  time: number;
  date: string;
}

export type HighScores = Record<string, HighScore>;

export interface NumberFrequency {
  [key: number]: number;
}

export interface QuizStats {
  totalQuizzes: number;
  totalCorrect: number;
  totalTime: number;
  numberFrequency: NumberFrequency;
}

export type AllQuizStats = Partial<Record<Operation, QuizStats>>;

// Multiplayer Types
export type GameMode = 'ffa' | 'teams';
export type TimeLimit = number;
export type AIDifficulty = 'easy' | 'medium' | 'hard' | 'expert';

export interface Player {
  id: string;
  name: string;
  isHost: boolean;
  isReady: boolean;
  connected: boolean;
  teamId?: string; // Only set when gameMode is 'teams'
  isAI?: boolean; // True if this player is an AI opponent
  aiDifficulty?: AIDifficulty; // Difficulty level for AI players
}

export interface Team {
  id: string;
  name: string; // 'Team A' or 'Team B'
  playerIds: string[];
}

export type LobbyPlayer = Player;
export type LobbyTeams = Team[];

export interface PlayerGameState {
  playerId: string;
  playerName: string;
  answers: string[];
  currentQuestion: number;
  finished: boolean;
  finishTime: number | null; // ms from game start
  score: number;
}

export interface RoomSettings {
  operation: Operation;
  selectedNumbers: number[];
  questionCount: number;
  timeLimit: TimeLimit; // 0 for no limit
  maxPlayers: number; // 2, 3, or 4
  gameMode: GameMode; // 'ffa' or 'teams'
}

export interface RematchState {
  requesterId: string;
  requesterName: string;
  keepTeams: boolean;
  acceptedPlayerIds: string[]; // Players who have accepted
}

export interface Room {
  id: string;
  code: string; // 8-character join code
  hostId: string;
  players: Player[];
  teams: Team[]; // Empty for FFA mode, 2 teams for team mode
  settings: RoomSettings;
  questions: Question[];
  gameState: 'waiting' | 'countdown' | 'playing' | 'finished';
  gameStartTime: number | null; // timestamp when game started
  playerStates: PlayerGameState[];
  createdAt: number;
  isQuickMatch: boolean;
  rematchState?: RematchState; // Tracks pending rematch for 3+ players
}

export type RoomState = Pick<Room, 'id' | 'code' | 'players' | 'settings' | 'gameState'> &
  Partial<Pick<Room, 'hostId' | 'teams' | 'questions' | 'gameStartTime' | 'playerStates' | 'createdAt' | 'isQuickMatch' | 'rematchState'>>;

export interface RematchPayload {
  newRoomId: string;
  newRoomCode: string;
  isQuickMatch: boolean;
  players: Player[];
  settings: RoomSettings;
  teams: Team[];
}

export interface MultiplayerResult {
  playerId: string;
  playerName: string;
  score: number;
  totalQuestions: number;
  timeTaken: number;
  answers: string[];
  questions: Question[];
  teamId?: string; // Only set when gameMode is 'teams'
  rank?: number; // 1st, 2nd, 3rd, 4th place for FFA
}

export interface TeamResult {
  teamId: string;
  teamName: string;
  playerIds: string[];
  averageScore: number;
  averageTime: number;
  totalScore: number;
  totalTime: number;
  isWinner: boolean;
}

/**
 * Canonical contract for realtime room events: maps each Pusher event name to
 * its payload shape. The server emit side (api/multiplayer.ts `triggerRoomEvent`)
 * is typed against this so the over-the-wire format can't silently drift from
 * what the client handlers read. The Pusher event *name* is the discriminator,
 * so payloads intentionally carry no redundant `type` field.
 */
export interface RoomEventPayloads {
  'player-joined': { player: Player };
  'player-left': { playerId: string; playerName?: string };
  'player-ready': { playerId: string; isReady: boolean };
  'settings-updated': { settings: RoomSettings };
  'teams-updated': { teams: Team[]; players: Player[] };
  'ready-phase': { settings: RoomSettings };
  'game-starting': { questions: Question[]; teams: Team[]; players: Player[]; countdown?: number };
  'game-started': { startTime: number | null };
  'opponent-progress': { playerId: string; currentQuestion: number };
  'opponent-finished': { playerId: string; finishTime: number | null };
  'game-ended': { results: MultiplayerResult[]; teamResults?: TeamResult[] };
  'rematch-requested': { fromPlayerId: string; fromPlayerName: string; keepTeams?: boolean; totalNeeded: number };
  'rematch-player-accepted': { playerId: string; playerName: string; acceptedCount: number; totalNeeded: number };
  'rematch-accepted': RematchPayload & { keepTeams?: boolean };
  'rematch-declined': { declinedBy?: string };
  'player-disconnected': { playerId: string };
}

export type RoomEventName = keyof RoomEventPayloads;

/** Discriminated-union view of {@link RoomEventPayloads}, tagged by a `type` field. */
export type RoomEvent = {
  [E in RoomEventName]: { type: E } & RoomEventPayloads[E];
}[RoomEventName];

export type MultiplayerAction =
  | 'create-room'
  | 'join-room'
  | 'leave-room'
  | 'quick-match'
  | 'set-ready'
  | 'start-ready-phase'
  | 'update-room-settings'
  | 'start-game'
  | 'update-progress'
  | 'submit-multiplayer'
  | 'rematch'
  | 'assign-team'
  | 'create-ai-game'
  | 'player-disconnect';

interface MultiplayerSuccessByAction {
  'create-room': {
    roomId: string;
    roomCode: string;
    joinUrl: string;
    room: RoomState;
  };
  'join-room': {
    roomId: string;
    room: RoomState;
  };
  'leave-room': Record<string, never>;
  'quick-match': {
    matched: boolean;
    roomId?: string;
    roomCode?: string;
    opponent?: { id: string; name: string };
  };
  'set-ready': {
    allReady: boolean;
  };
  'start-ready-phase': Record<string, never>;
  'update-room-settings': {
    settings: RoomSettings;
    teams?: Team[];
    players?: Player[];
  };
  'start-game': Record<string, never>;
  'update-progress': Record<string, never>;
  'submit-multiplayer': {
    allFinished: boolean;
    finishTime?: number;
  };
  'rematch': {
    message?: string;
    totalNeeded?: number;
    newRoomId?: string;
    newRoomCode?: string;
    teams?: Team[];
    players?: Player[];
  };
  'assign-team': {
    teams?: Team[];
    players?: Player[];
  };
  'create-ai-game': {
    roomId: string;
    questions: Question[];
    players: Player[];
  };
  'player-disconnect': Record<string, never>;
}

export type MultiplayerApiResponse<TAction extends MultiplayerAction> =
  | ({ success: true; action?: TAction; error?: never } & MultiplayerSuccessByAction[TAction])
  | ({ success: false; action?: TAction; error: string } & Partial<MultiplayerSuccessByAction[TAction]>);
