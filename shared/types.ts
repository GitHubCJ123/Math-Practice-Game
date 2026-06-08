
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
  odId: string;
  odName: string;
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
  odId: string;
  odName: string;
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

export type RoomEvent =
  | { type: 'player-joined'; player: Player }
  | { type: 'player-left'; odId: string }
  | { type: 'player-ready'; odId: string }
  | { type: 'settings-updated'; settings: RoomSettings }
  | { type: 'teams-updated'; teams: Team[]; players: Player[] }
  | { type: 'game-starting'; countdown: number; questions: Question[] }
  | { type: 'game-started'; startTime: number }
  | { type: 'opponent-progress'; odId: string; currentQuestion: number }
  | { type: 'opponent-finished'; odId: string; finishTime: number }
  | { type: 'game-ended'; results: MultiplayerResult[]; teamResults?: TeamResult[] }
  | { type: 'rematch-requested'; fromPlayerId: string; fromPlayerName: string; keepTeams?: boolean; totalNeeded: number }
  | { type: 'rematch-player-accepted'; odId: string; odName: string; acceptedCount: number; totalNeeded: number }
  | { type: 'rematch-accepted'; newRoomCode: string }
  | { type: 'rematch-declined'; declinedBy?: string }
  | { type: 'player-disconnected'; odId: string };

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

// TODO(strict): Re-enable noUnusedLocals after lobby-split updates these owned files:
// - src/components/screens/multiplayer-lobby/index.tsx: TS6196 unused AIDifficulty.
// - src/components/screens/multiplayer-lobby/PrivateRoomScreen.tsx: TS6196 unused RoomSettings.
