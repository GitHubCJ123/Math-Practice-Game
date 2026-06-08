import React from 'react';
import type { Player, Team } from '@shared/types';

interface ModeButtonProps {
  active: boolean;
  disabled: boolean;
  onClick: () => void;
  activeClass: string;
  label: string;
  title?: string;
}

/** Pill-style toggle button used in the Game Mode picker. */
export const ModeButton: React.FC<ModeButtonProps> = ({
  active,
  disabled,
  onClick,
  activeClass,
  label,
  title,
}) => (
  <button
    onClick={onClick}
    disabled={disabled}
    title={title}
    className={`px-4 py-2 rounded-lg font-medium transition-colors ${
      active
        ? activeClass
        : disabled
        ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 cursor-not-allowed'
        : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
    }`}
  >
    {label}
  </button>
);

interface RoomPlayerCardProps {
  player: Player;
  isMe: boolean;
}

/** Compact player tile used in the FFA roster. */
export const RoomPlayerCard: React.FC<RoomPlayerCardProps> = ({ player, isMe }) => (
  <div
    className={`p-4 rounded-xl border-2 ${
      isMe
        ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700'
        : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700'
    }`}
  >
    <div className='flex items-center gap-2'>
      <div
        className={`w-3 h-3 rounded-full ${
          player.connected ? 'bg-green-500' : 'bg-red-500'
        }`}
      />
      <span className='font-semibold text-slate-800 dark:text-white'>
        {player.name}
        {isMe && ' (You)'}
      </span>
    </div>
    {player.isHost && (
      <span className='text-xs text-blue-600 dark:text-blue-400 font-medium'>Host</span>
    )}
  </div>
);

interface TeamSectionProps {
  label: string;
  color: 'blue' | 'red';
  teamPlayers: Player[];
  playerId: string;
  isHost: boolean;
  switchToTeam: Team | undefined;
  switchLabel: string;
  switchClass: string;
  onAssignTeam: (playerId: string, teamId: string) => void;
}

/** One of the two team blocks in the team-mode roster. */
export const TeamSection: React.FC<TeamSectionProps> = ({
  label,
  color,
  teamPlayers,
  playerId,
  isHost,
  switchToTeam,
  switchLabel,
  switchClass,
  onAssignTeam,
}) => {
  const headerColor =
    color === 'blue' ? 'text-blue-600 dark:text-blue-400' : 'text-red-600 dark:text-red-400';
  const bg =
    color === 'blue'
      ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700'
      : 'bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700';
  const myCell =
    color === 'blue'
      ? 'bg-blue-100 dark:bg-blue-800/30 border-blue-400 dark:border-blue-600'
      : 'bg-red-100 dark:bg-red-800/30 border-red-400 dark:border-red-600';

  return (
    <div className={`rounded-xl p-4 border-2 ${bg}`}>
      <h3 className={`text-md font-bold mb-3 flex items-center gap-2 ${headerColor}`}>
        {label}
      </h3>
      <div className='grid grid-cols-2 gap-3'>
        {teamPlayers.map(player => (
          <div
            key={player.id}
            className={`p-3 rounded-xl border-2 ${
              player.id === playerId
                ? myCell
                : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'
            }`}
          >
            <div className='flex items-center gap-2'>
              <div
                className={`w-3 h-3 rounded-full ${
                  player.connected ? 'bg-green-500' : 'bg-red-500'
                }`}
              />
              <span className='font-semibold text-slate-800 dark:text-white text-sm truncate'>
                {player.name}
                {player.id === playerId && ' (You)'}
              </span>
            </div>
            <div className='flex justify-between items-center mt-1'>
              {player.isHost && (
                <span className='text-xs text-blue-600 dark:text-blue-400 font-medium'>
                  Host
                </span>
              )}
              {isHost && player.id !== playerId && switchToTeam && (
                <button
                  onClick={() => onAssignTeam(player.id, switchToTeam.id)}
                  className={`text-xs hover:underline ml-auto ${switchClass}`}
                >
                  {switchLabel}
                </button>
              )}
            </div>
          </div>
        ))}
        {teamPlayers.length === 0 && (
          <p className='text-slate-400 text-sm col-span-2 text-center py-2'>No players</p>
        )}
      </div>
    </div>
  );
};
