import React from 'react';
import type { GameMode, Player, Team } from '@shared/types';
import { LobbyHeader } from './LobbyHeader';

interface ReadyScreenProps {
  isDarkMode: boolean;
  toggleDarkMode: () => void;
  playerId: string;
  playerName: string;
  players: Player[];
  teams: Team[];
  gameMode: GameMode;
  myReady: boolean;
  readyStates: Record<string, boolean>;
  summary: string;
  variant: 'quickmatch' | 'private';
  opponentLeft: boolean;
  onLeave: () => void;
  onToggleReady: () => void;
  onContinueMatchmaking: () => void;
}

/**
 * Pre-game ready/waiting screen. Used both for the quick-match
 * post-match lobby and for the private-room ready phase. Behaviour
 * differs slightly by `variant` (quickmatch can show an opponent-left
 * banner, private supports team layout).
 */
export const ReadyScreen: React.FC<ReadyScreenProps> = ({
  isDarkMode,
  toggleDarkMode,
  playerId,
  playerName,
  players,
  teams,
  gameMode,
  myReady,
  readyStates,
  summary,
  variant,
  opponentLeft,
  onLeave,
  onToggleReady,
  onContinueMatchmaking,
}) => {
  const opponents = players.filter(p => p.id !== playerId);
  const allOthersReady = opponents.every(p => readyStates[p.id]);
  const isTeams = variant === 'private' && gameMode === 'teams';
  const teamAPlayers = isTeams
    ? players.filter(p => teams[0]?.playerIds.includes(p.id))
    : [];
  const teamBPlayers = isTeams
    ? players.filter(p => teams[1]?.playerIds.includes(p.id))
    : [];

  if (variant === 'quickmatch' && opponentLeft) {
    return (
      <Shell
        isDarkMode={isDarkMode}
        toggleDarkMode={toggleDarkMode}
        onLeave={onLeave}
        backLabel='← Leave Match'
      >
        <div className='text-center mb-6'>
          <div className='text-6xl mb-4'>😔</div>
          <h1 className='text-2xl md:text-3xl font-bold text-slate-800 dark:text-white mb-2'>
            Opponent Left
          </h1>
          <p className='text-slate-500 dark:text-slate-400'>
            Your opponent has left the match before it started.
          </p>
        </div>
        <div className='flex flex-col gap-4'>
          <button
            onClick={onContinueMatchmaking}
            className='w-full py-4 rounded-xl text-xl font-bold bg-purple-600 text-white hover:bg-purple-700 transition-all transform hover:scale-[1.02]'
          >
            Continue Matchmaking
          </button>
          <button
            onClick={onLeave}
            className='w-full py-3 rounded-xl text-lg font-semibold bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors'
          >
            Back to Menu
          </button>
        </div>
      </Shell>
    );
  }

  const heading = variant === 'quickmatch' ? 'Match Found!' : 'Get Ready!';
  const backLabel = variant === 'quickmatch' ? '← Leave Match' : '← Leave Room';

  return (
    <Shell
      isDarkMode={isDarkMode}
      toggleDarkMode={toggleDarkMode}
      onLeave={onLeave}
      backLabel={backLabel}
    >
      <h1 className='text-2xl md:text-3xl font-bold text-center text-slate-800 dark:text-white mb-2'>
        {heading}
      </h1>
      <p className='text-center text-slate-500 dark:text-slate-400 mb-2'>{summary}</p>
      {isTeams && (
        <p className='text-center text-purple-600 dark:text-purple-400 text-sm font-semibold mb-4'>
          🏆 Team Mode
        </p>
      )}

      {isTeams ? (
        <div className='space-y-6 mb-8'>
          <TeamCard
            label='🔵 Team A'
            color='blue'
            teamPlayers={teamAPlayers}
            playerId={playerId}
            myReady={myReady}
            readyStates={readyStates}
          />
          <TeamCard
            label='🔴 Team B'
            color='red'
            teamPlayers={teamBPlayers}
            playerId={playerId}
            myReady={myReady}
            readyStates={readyStates}
          />
        </div>
      ) : (
        <div className='grid gap-4 mb-8 grid-cols-2'>
          {variant === 'quickmatch' ? (
            <>
              <PlayerCard
                name={playerName}
                label='You'
                ready={myReady}
                large
              />
              {opponents.map(opponent => (
                <PlayerCard
                  key={opponent.id}
                  name={opponent.name}
                  label='Opponent'
                  ready={Boolean(readyStates[opponent.id])}
                  large
                />
              ))}
            </>
          ) : (
            players.map(player => {
              const isMe = player.id === playerId;
              const ready = isMe ? myReady : Boolean(readyStates[player.id]);
              return (
                <PlayerCard
                  key={player.id}
                  name={player.name}
                  label={isMe ? 'You' : 'Opponent'}
                  ready={ready}
                  large
                />
              );
            })
          )}
        </div>
      )}

      <button
        onClick={onToggleReady}
        className={`w-full py-4 rounded-xl text-xl font-bold transition-all transform hover:scale-[1.02] ${
          myReady
            ? 'bg-yellow-500 text-white hover:bg-yellow-600'
            : 'bg-green-600 text-white hover:bg-green-700'
        }`}
      >
        {myReady ? 'Cancel Ready' : "I'm Ready!"}
      </button>

      {myReady && !allOthersReady && (
        <p className='text-center text-slate-500 dark:text-slate-400 mt-4 animate-pulse'>
          Waiting for others to be ready...
        </p>
      )}
      {myReady && allOthersReady && (
        <p className='text-center text-green-600 dark:text-green-400 mt-4 font-semibold animate-pulse'>
          Starting game...
        </p>
      )}
    </Shell>
  );
};

interface ShellProps {
  isDarkMode: boolean;
  toggleDarkMode: () => void;
  onLeave: () => void;
  backLabel: string;
  children: React.ReactNode;
}

const Shell: React.FC<ShellProps> = ({
  isDarkMode,
  toggleDarkMode,
  onLeave,
  backLabel,
  children,
}) => {
  return (
    <div className='min-h-screen bg-slate-50 dark:bg-slate-950 p-4 md:p-8 transition-colors duration-300'>
      <div className='max-w-2xl mx-auto'>
        <LobbyHeader
          isDarkMode={isDarkMode}
          toggleDarkMode={toggleDarkMode}
          backLabel={backLabel}
          onBack={onLeave}
        />
        <div className='bg-white dark:bg-slate-900 rounded-3xl shadow-xl border border-slate-200 dark:border-slate-800 p-6 md:p-8'>
          {children}
        </div>
      </div>
    </div>
  );
};

interface PlayerCardProps {
  name: string;
  label: string;
  ready: boolean;
  large?: boolean;
}

const PlayerCard: React.FC<PlayerCardProps> = ({ name, label, ready, large }) => (
  <div
    className={`${
      large ? 'p-4 rounded-2xl' : 'p-3 rounded-xl'
    } border-2 text-center transition-all ${
      ready
        ? 'bg-green-50 dark:bg-green-900/20 border-green-400 dark:border-green-600'
        : 'bg-slate-50 dark:bg-slate-800 border-slate-300 dark:border-slate-600'
    }`}
  >
    <div className={`${large ? 'text-3xl mb-2' : 'text-2xl mb-1'}`}>
      {ready ? '✅' : '⏳'}
    </div>
    <h3
      className={`font-bold text-slate-800 dark:text-white ${
        large ? 'mb-1' : 'text-sm'
      } truncate`}
    >
      {name}
    </h3>
    <p className='text-xs text-slate-500 dark:text-slate-400'>{label}</p>
    <p
      className={`text-xs font-semibold mt-1 ${
        ready ? 'text-green-600 dark:text-green-400' : 'text-slate-400'
      }`}
    >
      {ready ? 'READY' : 'Not Ready'}
    </p>
  </div>
);

interface TeamCardProps {
  label: string;
  color: 'blue' | 'red';
  teamPlayers: Player[];
  playerId: string;
  myReady: boolean;
  readyStates: Record<string, boolean>;
}

const TeamCard: React.FC<TeamCardProps> = ({
  label,
  color,
  teamPlayers,
  playerId,
  myReady,
  readyStates,
}) => {
  const bg =
    color === 'blue'
      ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700'
      : 'bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700';
  const heading =
    color === 'blue' ? 'text-blue-600 dark:text-blue-400' : 'text-red-600 dark:text-red-400';
  return (
    <div className={`rounded-xl p-4 border-2 ${bg}`}>
      <h3 className={`text-lg font-bold mb-3 flex items-center gap-2 ${heading}`}>
        {label}
      </h3>
      <div className='grid grid-cols-2 gap-3'>
        {teamPlayers.map(player => {
          const isMe = player.id === playerId;
          const ready = isMe ? myReady : Boolean(readyStates[player.id]);
          return (
            <PlayerCard
              key={player.id}
              name={player.name}
              label={isMe ? 'You' : ''}
              ready={ready}
            />
          );
        })}
        {teamPlayers.length === 0 && (
          <p className='text-slate-400 text-sm col-span-2 text-center py-2'>No players</p>
        )}
      </div>
    </div>
  );
};
