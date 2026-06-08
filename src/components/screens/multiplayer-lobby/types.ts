import type {
  AIDifficulty,
  GameMode,
  Operation,
  Player,
  RoomSettings,
  Team,
} from '@shared/types';

export type LobbyTab = 'create' | 'join' | 'quickmatch' | 'aimode';

/**
 * Discriminated union describing which screen the lobby is currently
 * presenting. Replaces the previous boolean soup
 * (`inRoom`, `isQuickMatchRoom`, `showReadyScreen`, `isSearching`,
 * `opponentLeft`).
 */
export type LobbyScreen =
  | { kind: 'home' }
  | { kind: 'searching'; operation: Operation }
  | { kind: 'private-room'; showReadyScreen: boolean }
  | { kind: 'quickmatch-room'; opponentLeft: boolean };

export type LobbyAction =
  | { type: 'GO_HOME' }
  | { type: 'START_SEARCH'; operation: Operation }
  | { type: 'CANCEL_SEARCH' }
  | { type: 'CREATE_OR_JOIN_PRIVATE' }
  | { type: 'MATCH_FOUND' }
  | { type: 'BEGIN_READY_PHASE' }
  | { type: 'BEGIN_REMATCH'; isQuickMatch: boolean }
  | { type: 'OPPONENT_LEFT' }
  | { type: 'RESET_OPPONENT_LEFT' };

export const initialLobbyScreen: LobbyScreen = { kind: 'home' };

export function lobbyReducer(state: LobbyScreen, action: LobbyAction): LobbyScreen {
  switch (action.type) {
    case 'GO_HOME':
      return { kind: 'home' };
    case 'START_SEARCH':
      return { kind: 'searching', operation: action.operation };
    case 'CANCEL_SEARCH':
      return { kind: 'home' };
    case 'CREATE_OR_JOIN_PRIVATE':
      return { kind: 'private-room', showReadyScreen: false };
    case 'MATCH_FOUND':
      return { kind: 'quickmatch-room', opponentLeft: false };
    case 'BEGIN_READY_PHASE':
      if (state.kind === 'private-room') {
        return { kind: 'private-room', showReadyScreen: true };
      }
      return state;
    case 'BEGIN_REMATCH':
      return action.isQuickMatch
        ? { kind: 'quickmatch-room', opponentLeft: false }
        : { kind: 'private-room', showReadyScreen: true };
    case 'OPPONENT_LEFT':
      if (state.kind === 'quickmatch-room') {
        return { kind: 'quickmatch-room', opponentLeft: true };
      }
      return state;
    case 'RESET_OPPONENT_LEFT':
      if (state.kind === 'quickmatch-room') {
        return { kind: 'quickmatch-room', opponentLeft: false };
      }
      return state;
    default:
      return state;
  }
}

/**
 * Snapshot of the active room. Shared data state used across in-room
 * screens (private room, ready screen, quick match room).
 */
export interface RoomData {
  roomId: string | null;
  roomCode: string;
  joinUrl: string;
  isHost: boolean;
  players: Player[];
  teams: Team[];
  operation: Operation;
  selectedNumbers: number[];
  questionCount: number;
  timeLimit: number;
  maxPlayers: number;
  gameMode: GameMode;
  myReady: boolean;
  readyStates: Record<string, boolean>;
}

export const operationLabels: Record<Operation, string> = {
  multiplication: 'Multiplication',
  division: 'Division',
  squares: 'Squares',
  'square-roots': 'Square Roots',
  'fraction-to-decimal': 'Fraction → Decimal',
  'decimal-to-fraction': 'Decimal → Fraction',
  'fraction-to-percent': 'Fraction → Percent',
  'percent-to-fraction': 'Percent → Fraction',
  'negative-numbers': 'Negative Numbers',
};

export const aiDifficultyLabels: Record<
  AIDifficulty,
  { name: string; description: string; emoji: string }
> = {
  easy: { name: 'Easy', description: '75% accuracy, slow pace', emoji: '🐢' },
  medium: { name: 'Medium', description: '85% accuracy, moderate pace', emoji: '🐇' },
  hard: { name: 'Hard', description: '95% accuracy, fast pace', emoji: '🦊' },
  expert: { name: 'Expert', description: '100% accuracy, very fast', emoji: '🤖' },
};

export function getNumbersForOperation(op: Operation): number[] {
  if (op === 'squares' || op === 'square-roots') {
    return Array.from({ length: 20 }, (_, i) => i + 1);
  }
  if (op === 'negative-numbers') {
    return Array.from({ length: 10 }, (_, i) => i + 1);
  }
  return Array.from({ length: 12 }, (_, i) => i + 1);
}

export type SettingsPatch = Partial<RoomSettings>;
