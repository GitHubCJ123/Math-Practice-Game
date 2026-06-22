import React from 'react';
import type { GameMode, Operation, Player, Team } from '@shared/types';
import { LobbyHeader } from './LobbyHeader';
import { ModeButton, RoomPlayerCard, TeamSection } from './RoomRoster';
import { getNumbersForOperation, operationLabels, type SettingsPatch } from './types';

interface PrivateRoomScreenProps {
  isDarkMode: boolean;
  toggleDarkMode: () => void;
  playerId: string;
  isHost: boolean;
  roomCode: string;
  joinUrl: string;
  players: Player[];
  teams: Team[];
  operation: Operation;
  selectedNumbers: number[];
  questionCount: number;
  timeLimit: number;
  maxPlayers: number;
  gameMode: GameMode;
  isStarting: boolean;
  onLeave: () => void;
  onCopy: (text: string) => void;
  onSettingsChange: (patch: SettingsPatch) => void;
  onAssignTeam: (playerId: string, teamId: string) => void;
  onKick?: (playerId: string) => void;
  onTournament?: () => void;
  onStartGame: () => void;
}

const TIME_LIMIT_OPTIONS: Array<{ label: string; value: number }> = [
  { label: '30s', value: 30 },
  { label: '1m', value: 60 },
  { label: '2m', value: 120 },
  { label: '5m', value: 300 },
  { label: 'None', value: 0 },
];

const MIN_PLAYERS = 2;

/**
 * In-room screen for private (code-shared) rooms. Shows the room code,
 * player roster, settings panel (editable only by the host) and the
 * Start Game button. Quick-match rooms use `ReadyScreen` instead.
 */
export const PrivateRoomScreen: React.FC<PrivateRoomScreenProps> = ({
  isDarkMode,
  toggleDarkMode,
  playerId,
  isHost,
  roomCode,
  joinUrl,
  players,
  teams,
  operation,
  selectedNumbers,
  questionCount,
  timeLimit,
  maxPlayers,
  gameMode,
  isStarting,
  onLeave,
  onCopy,
  onSettingsChange,
  onAssignTeam,
  onKick,
  onTournament,
  onStartGame,
}) => {
  const availableNumbers = getNumbersForOperation(operation);
  const hasEnoughPlayers = players.length >= MIN_PLAYERS;
  const teamA = teams[0];
  const teamB = teams[1];
  const teamAPlayers =
    gameMode === 'teams' && teamA ? players.filter(p => teamA.playerIds.includes(p.id)) : [];
  const teamBPlayers =
    gameMode === 'teams' && teamB ? players.filter(p => teamB.playerIds.includes(p.id)) : [];

  const toggleNumber = (num: number) => {
    const next = selectedNumbers.includes(num)
      ? selectedNumbers.filter(n => n !== num)
      : [...selectedNumbers, num];
    if (next.length > 0) onSettingsChange({ selectedNumbers: next });
  };

  return (
    <div className='w-full p-2 md:p-4 transition-colors duration-300'>
      <div className='max-w-4xl mx-auto'>
        <LobbyHeader
          isDarkMode={isDarkMode}
          toggleDarkMode={toggleDarkMode}
          backLabel='← Leave Room'
          onBack={onLeave}
        />

        <div className='game-panel p-6 md:p-8 mb-6 animate-fade-in'>
          <div className='flex items-center justify-between gap-3 mb-4'>
            <h1 className='font-display text-2xl md:text-3xl font-bold text-slate-800 dark:text-white'>
              {isHost ? 'Your Room' : 'Joined Room'}
            </h1>
            {onTournament && (
              <button
                onClick={onTournament}
                title='Run a bracket for many players instead'
                className='shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl font-display font-bold text-sm text-white bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 transition-colors shadow-sm'
              >
                🏆 Tournament
                <span className='text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-white/25'>
                  Heavy Beta
                </span>
              </button>
            )}
          </div>

          <div className='rounded-2xl p-5 mb-6 bg-gradient-to-br from-violet-50 to-fuchsia-50 dark:from-violet-900/20 dark:to-fuchsia-900/20 border border-violet-200 dark:border-violet-500/30'>
            <div className='flex flex-col md:flex-row md:items-center gap-4'>
              <div className='flex-1'>
                <p className='text-sm text-slate-500 dark:text-slate-400 mb-1'>Room Code</p>
                <p className='font-display text-3xl font-bold text-violet-600 dark:text-violet-300 tracking-[0.3em]'>
                  {roomCode}
                </p>
              </div>
              <div className='flex gap-2'>
                <button
                  onClick={() => onCopy(roomCode)}
                  className='btn3d btn3d--primary px-4 py-2 text-sm'
                >
                  Copy Code
                </button>
                {joinUrl && (
                  <button
                    onClick={() => onCopy(joinUrl)}
                    className='btn3d btn3d--neutral px-4 py-2 text-sm'
                  >
                    Copy Link
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className='mb-6'>
            <h2 className='font-display text-lg font-bold text-slate-700 dark:text-slate-200 mb-3'>
              Players ({players.length}/{maxPlayers})
            </h2>

            {gameMode === 'teams' && players.length > 1 ? (
              <div className='space-y-4'>
                <TeamSection
                  label='🔵 Team A'
                  color='blue'
                  teamPlayers={teamAPlayers}
                  playerId={playerId}
                  isHost={isHost}
                  switchToTeam={teamB}
                  switchLabel='→ Team B'
                  switchClass='text-red-600 dark:text-red-400'
                  onAssignTeam={onAssignTeam}
                  onKick={onKick}
                />
                <TeamSection
                  label='🔴 Team B'
                  color='red'
                  teamPlayers={teamBPlayers}
                  playerId={playerId}
                  isHost={isHost}
                  switchToTeam={teamA}
                  switchLabel='→ Team A'
                  switchClass='text-blue-600 dark:text-blue-400'
                  onAssignTeam={onAssignTeam}
                  onKick={onKick}
                />
              </div>
            ) : (
              <div className='grid grid-cols-2 gap-4'>
                {players.map(player => (
                  <RoomPlayerCard
                    key={player.id}
                    player={player}
                    isMe={player.id === playerId}
                    viewerIsHost={isHost}
                    onKick={onKick}
                  />
                ))}
                {Array.from({ length: maxPlayers - players.length }).map((_, i) => (
                  <div
                    key={`empty-${i}`}
                    className='p-4 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-600 flex items-center justify-center'
                  >
                    <span className='text-slate-400 dark:text-slate-500'>
                      Waiting for players...
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className='border-t border-slate-200 dark:border-slate-700 pt-6'>
            <h2 className='font-display text-lg font-bold text-slate-700 dark:text-slate-200 mb-4'>
              Game Settings
            </h2>

            <div className='mb-4'>
              <label className='block text-sm font-display font-semibold text-slate-600 dark:text-slate-400 mb-2'>
                Max Players
              </label>
              <div className='flex flex-wrap gap-2'>
                {[2, 3, 4, 5, 6, 7, 8].map(num => {
                  const isDisabled = !isHost || num < players.length;
                  return (
                    <button
                      key={num}
                      onClick={() => {
                        if (!isHost) return;
                        if (num < players.length) return;
                        const newGameMode: GameMode = num < 3 ? 'ffa' : gameMode;
                        onSettingsChange({ maxPlayers: num, gameMode: newGameMode });
                      }}
                      disabled={isDisabled}
                      className={`seg px-4 py-2 min-w-[3rem] ${maxPlayers === num ? 'seg--active' : ''} ${isDisabled ? 'opacity-60 cursor-not-allowed' : ''}`}
                    >
                      {num}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className='mb-4'>
              <label className='block text-sm font-medium text-slate-600 dark:text-slate-400 mb-2'>
                Game Mode
              </label>
              <div className='flex gap-2'>
                <ModeButton
                  active={gameMode === 'ffa'}
                  disabled={!isHost}
                  onClick={() => onSettingsChange({ gameMode: 'ffa' })}
                  activeClass='bg-gradient-to-br from-violet-500 to-indigo-600 text-white'
                  label='Free For All'
                />
                <ModeButton
                  active={gameMode === 'teams'}
                  disabled={!isHost || maxPlayers < 3}
                  onClick={() => onSettingsChange({ gameMode: 'teams' })}
                  activeClass='bg-gradient-to-br from-fuchsia-500 to-purple-600 text-white'
                  label='Teams (up to 4v4)'
                  title={maxPlayers < 3 ? 'Teams require 3 players' : ''}
                />
              </div>
              {maxPlayers < 3 && (
                <p className='text-xs text-slate-400 mt-1'>Teams mode requires 3 players</p>
              )}
            </div>

            <div className='mb-4'>
              <label className='block text-sm font-display font-semibold text-slate-600 dark:text-slate-400 mb-2'>
                Operation
              </label>
              <div className='grid grid-cols-2 md:grid-cols-3 gap-2'>
                {(Object.keys(operationLabels) as Operation[]).map(op => (
                  <button
                    key={op}
                    onClick={() => {
                      if (!isHost) return;
                      const newNums = getNumbersForOperation(op);
                      onSettingsChange({ operation: op, selectedNumbers: newNums });
                    }}
                    disabled={!isHost}
                    className={`seg px-3 py-2 text-sm ${operation === op ? 'seg--active' : ''} ${!isHost ? 'opacity-60 cursor-not-allowed' : ''}`}
                  >
                    {operationLabels[op]}
                  </button>
                ))}
              </div>
            </div>

            <div className='mb-4'>
              <div className='flex items-center justify-between mb-2'>
                <label className='text-sm font-display font-semibold text-slate-600 dark:text-slate-400'>
                  Numbers
                </label>
                {isHost && (
                  <div className='flex gap-2'>
                    <button
                      onClick={() =>
                        onSettingsChange({ selectedNumbers: availableNumbers })
                      }
                      className='text-xs font-semibold text-violet-600 dark:text-violet-400 hover:underline'
                    >
                      Select All
                    </button>
                    <button
                      onClick={() => onSettingsChange({ selectedNumbers: [1] })}
                      className='text-xs text-slate-500 dark:text-slate-400 hover:underline'
                    >
                      Clear
                    </button>
                  </div>
                )}
              </div>
              <div className='flex flex-wrap gap-2'>
                {availableNumbers.map(num => (
                  <button
                    key={num}
                    onClick={() => isHost && toggleNumber(num)}
                    disabled={!isHost}
                    className={`tile w-10 h-10 ${selectedNumbers.includes(num) ? 'tile--active' : ''} ${!isHost ? 'opacity-60 cursor-not-allowed' : ''}`}
                  >
                    {num}
                  </button>
                ))}
              </div>
            </div>

            <div className='mb-4'>
              <label className='block text-sm font-display font-semibold text-slate-600 dark:text-slate-400 mb-2'>
                Number of Questions: {questionCount}
              </label>
              <input
                type='range'
                min='5'
                max='30'
                value={questionCount}
                onChange={e => {
                  if (!isHost) return;
                  onSettingsChange({ questionCount: parseInt(e.target.value, 10) });
                }}
                disabled={!isHost}
                className='range-fun w-full'
              />
            </div>

            <div className='mb-6'>
              <label className='block text-sm font-display font-semibold text-slate-600 dark:text-slate-400 mb-2'>
                Time Limit
              </label>
              <div className='flex flex-wrap gap-2'>
                {TIME_LIMIT_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => {
                      if (!isHost) return;
                      onSettingsChange({ timeLimit: opt.value });
                    }}
                    disabled={!isHost}
                    className={`seg px-4 py-2 ${timeLimit === opt.value ? 'seg--active' : ''} ${!isHost ? 'opacity-60 cursor-not-allowed' : ''}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {isHost ? (
              <>
                <button
                  onClick={onStartGame}
                  disabled={!hasEnoughPlayers || isStarting}
                  className='btn3d btn3d--success w-full py-4 text-xl'
                >
                  {isStarting
                    ? 'Starting...'
                    : !hasEnoughPlayers
                    ? 'Waiting for Players...'
                    : `Start Game (${players.length} Players)`}
                </button>
                {players.length < maxPlayers && players.length >= MIN_PLAYERS && (
                  <p className='text-center text-slate-500 dark:text-slate-400 text-sm mt-2'>
                    You can start now or wait for more players ({players.length}/{maxPlayers})
                  </p>
                )}
              </>
            ) : (
              <div className='text-center py-4 text-slate-500 dark:text-slate-400'>
                Waiting for host to start the game...
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
