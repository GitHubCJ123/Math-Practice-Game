
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

export interface Player {
  id: string;
  name: string;
  isHost: boolean;
  isReady: boolean;
  connected: boolean;
  teamId?: string; // Only set when gameMode is 'teams'
}

export interface Team {
  id: string;
  name: string; // 'Team A' or 'Team B'
  playerIds: string[];
}

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
  timeLimit: number; // 0 for no limit
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
