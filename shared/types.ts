
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

/** A single selectable option within an admin poll. */
export interface PollOption {
  id: string;
  text: string;
}

/** A live poll an admin pushes to every connected player to vote on. */
export interface Poll {
  id: string;
  question: string;
  options: PollOption[];
  startedAt: number; // epoch milliseconds
}

/**
 * Broadcast each time a vote is cast. Votes are relayed (not tallied on the
 * server), so every connected client aggregates the same event stream into an
 * identical live tally — avoiding per-instance serverless split-brain.
 */
export interface PollVote {
  pollId: string;
  optionId: string;
}

/** Broadcast when an admin closes a poll. */
export interface PollClosed {
  pollId: string;
}

/**
 * Poll lifecycle events. They ride the SAME public channel as announcements
 * (`GLOBAL_BROADCAST_CHANNEL`) but use distinct event names so the announcement
 * banner and the poll widget subscribe independently.
 */
export const GLOBAL_POLL_STARTED_EVENT = 'poll-started';
export const GLOBAL_POLL_VOTE_EVENT = 'poll-vote';
export const GLOBAL_POLL_CLOSED_EVENT = 'poll-closed';

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

/**
 * Everything needed to (re)start an AI game with the same setup. Stored when an
 * AI game begins so the results screen's "Play Again vs AI" can replay it.
 */
export interface AIGameConfig {
  difficulty: AIDifficulty;
  settings: {
    operation: Operation;
    selectedNumbers: number[];
    questionCount: number;
    timeLimit: number;
  };
}

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
  maxPlayers: number; // 2-8 (teams mode splits into two sides, e.g. 4v4)
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
  'player-kicked': { playerId: string; playerName?: string };
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
  | 'kick-player'
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
    results?: MultiplayerResult[];
    teamResults?: TeamResult[];
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
  'kick-player': {
    teams?: Team[];
    players?: Player[];
  };
  'player-disconnect': Record<string, never>;
}

export type MultiplayerApiResponse<TAction extends MultiplayerAction> =
  | ({ success: true; action?: TAction; error?: never } & MultiplayerSuccessByAction[TAction])
  | ({ success: false; action?: TAction; error: string } & Partial<MultiplayerSuccessByAction[TAction]>);

// ============================================
// Tournament Mode (single-elimination brackets)
// ============================================

export type TournamentFormat = 'individual' | 'teams';
export type TournamentStatus = 'lobby' | 'seeding' | 'running' | 'finished';
export type TournamentMatchStatus = 'pending' | 'playing' | 'finished';

/** Per-round question settings (a subset of RoomSettings, no player counts). */
export interface TournamentSettings {
  operation: Operation;
  selectedNumbers: number[];
  questionCount: number;
  timeLimit: number; // 0 for no limit
}

export interface TournamentParticipant {
  participantId: string;
  name: string;
  seed: number | null;
  eliminatedRound: number | null; // null = still alive
  connected: boolean;
  teamId?: string | null; // which team this player is on ('teams' format)
}

/** A team in a 'teams' format tournament; the bracket is seeded over these. */
export interface TournamentTeam {
  teamId: string;
  name: string;
  seed: number | null;
  eliminatedRound: number | null;
  memberIds: string[];
}

export interface TournamentMatch {
  id: string;
  round: number;
  slot: number;
  p1Id: string | null;
  p2Id: string | null;
  p1Score: number | null;
  p2Score: number | null;
  p1FinishMs: number | null;
  p2FinishMs: number | null;
  winnerId: string | null;
  state: TournamentMatchStatus;
  roundSettings: TournamentSettings | null;
  startedAt: number | null;
}

export interface Tournament {
  id: string;
  code: string;
  organizerId: string;
  name: string;
  format: TournamentFormat;
  status: TournamentStatus;
  currentRound: number;
  championId: string | null;
  settings: TournamentSettings; // default round settings
  roundSettings: Record<string, TournamentSettings>; // per-round overrides, keyed by round
  participants: TournamentParticipant[];
  teams: TournamentTeam[]; // empty for 'individual' format
  matches: TournamentMatch[];
}

/** Live per-participant in-match progress, for the organizer's analytics. */
export interface TournamentLiveState {
  matchId: string;
  participantId: string;
  name: string;
  currentQuestion: number;
  score: number;
  finished: boolean;
  finishMs: number | null;
}

/**
 * Realtime events on the `tournament-${id}` channel (bracket-wide), keyed by
 * event name. In-match 1v1 progress uses the separate `tmatch-${matchId}`
 * channel ({@link TournamentMatchEventPayloads}).
 */
export interface TournamentEventPayloads {
  'participant-joined': { participant: TournamentParticipant };
  'participant-left': { participantId: string };
  'participant-kicked': { participantId: string };
  'teams-formed': { tournament: Tournament };
  'bracket-seeded': { tournament: Tournament };
  'round-settings-updated': {
    round: number;
    roundSettings: Record<string, TournamentSettings>;
  };
  'round-started': { round: number; tournament: Tournament; questions: Question[] };
  'match-finished': { matchId: string; winnerId: string | null; round: number };
  'round-advanced': { tournament: Tournament };
  'tournament-finished': { championId: string | null; tournament: Tournament };
}

export type TournamentEventName = keyof TournamentEventPayloads;

/** Realtime events on the per-match `tmatch-${matchId}` channel (the two players). */
export interface TournamentMatchEventPayloads {
  'match-progress': { participantId: string; currentQuestion: number };
  'match-opponent-finished': { participantId: string; score: number };
}

export type TournamentAction =
  | 'create-tournament'
  | 'join-tournament'
  | 'leave-tournament'
  | 'kick-participant'
  | 'seed-bracket'
  | 'form-teams'
  | 'set-round-settings'
  | 'start-round'
  | 'update-match-progress'
  | 'submit-match'
  | 'advance-round';

interface TournamentSuccessByAction {
  'create-tournament': { tournament: Tournament };
  'join-tournament': { tournamentId: string; tournament: Tournament };
  'leave-tournament': Record<string, never>;
  'kick-participant': { tournament: Tournament };
  'seed-bracket': { tournament: Tournament };
  'form-teams': { tournament: Tournament };
  'set-round-settings': { tournament: Tournament };
  'start-round': { tournament: Tournament };
  'update-match-progress': Record<string, never>;
  'submit-match': { matchFinished: boolean; winnerId: string | null };
  'advance-round': { finished: boolean; championId?: string | null; tournament?: Tournament };
}

export type TournamentApiResponse<TAction extends TournamentAction> =
  | ({ success: true; error?: never } & TournamentSuccessByAction[TAction])
  | ({ success: false; error: string } & Partial<TournamentSuccessByAction[TAction]>);
