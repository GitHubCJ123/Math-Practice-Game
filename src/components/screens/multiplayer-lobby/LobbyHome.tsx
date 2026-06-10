import React from 'react';
import { BetaFeedback } from '../../ui/BetaFeedback';
import { BrandMark } from '../../ui/icons';
import { LobbyHeader } from './LobbyHeader';
import type { LobbyTab } from './types';

interface LobbyHomeProps {
  isDarkMode: boolean;
  toggleDarkMode: () => void;
  onBack: () => void;
  playerName: string;
  onPlayerNameChange: (name: string) => void;
  activeTab: LobbyTab;
  onTabChange: (tab: LobbyTab) => void;
  /** When true, highlights the name field and shows a "please enter your name" prompt. */
  nameError?: boolean;
  children: React.ReactNode;
}

const TAB_LABEL: Record<LobbyTab, string> = {
  create: 'Create Room',
  join: 'Join Room',
  quickmatch: 'Quick Match',
  aimode: 'AI Mode',
};

const TAB_ORDER: LobbyTab[] = ['create', 'join', 'quickmatch', 'aimode'];

/**
 * Landing screen for the multiplayer lobby. Renders the header, the
 * shared "Your Name" input, a tab strip, and the active tab content
 * supplied via `children`.
 */
export const LobbyHome: React.FC<LobbyHomeProps> = ({
  isDarkMode,
  toggleDarkMode,
  onBack,
  playerName,
  onPlayerNameChange,
  activeTab,
  onTabChange,
  nameError = false,
  children,
}) => (
  <div className='w-full p-2 md:p-4 transition-colors duration-300'>
    <div className='max-w-2xl mx-auto'>
      <LobbyHeader
        isDarkMode={isDarkMode}
        toggleDarkMode={toggleDarkMode}
        backLabel='← Back to Menu'
        onBack={onBack}
      />

      <div className='game-panel p-6 md:p-8 animate-fade-in'>
        <div className='flex items-center justify-center gap-3 mb-2'>
          <BrandMark className='w-10 h-10 sm:w-12 sm:h-12 animate-float' />
          <h1 className='font-display text-3xl md:text-4xl font-bold text-gradient leading-none pb-1'>
            Multiplayer
          </h1>
        </div>
        <p className='text-center text-slate-500 dark:text-slate-400 mb-4 font-medium'>
          Challenge a friend or find a random opponent!
        </p>

        <BetaFeedback className='mb-6' />

        <div className='mb-6'>
          <label
            htmlFor='mp-player-name'
            className='block text-sm font-display font-semibold text-slate-600 dark:text-slate-400 mb-2'
          >
            Your Name
          </label>
          <input
            id='mp-player-name'
            type='text'
            value={playerName}
            onChange={e => onPlayerNameChange(e.target.value.substring(0, 20))}
            placeholder='Enter your name'
            maxLength={20}
            aria-invalid={nameError}
            aria-describedby={nameError ? 'mp-player-name-error' : undefined}
            className={`w-full px-4 py-3 rounded-2xl border-2 bg-white dark:bg-slate-800 text-slate-800 dark:text-white transition-all outline-hidden focus:ring-2 ${
              nameError
                ? 'border-rose-400 dark:border-rose-500 focus:border-rose-500 focus:ring-rose-200 dark:focus:ring-rose-900 animate-shake'
                : 'border-slate-300 dark:border-slate-600 focus:border-violet-500 focus:ring-violet-200 dark:focus:ring-violet-800'
            }`}
          />
          {nameError && (
            <p
              id='mp-player-name-error'
              className='mt-2 flex items-center gap-1.5 text-sm font-semibold text-rose-500 dark:text-rose-400 animate-fade-in'
            >
              <span aria-hidden='true'>👆</span> Please enter your name to start playing!
            </p>
          )}
        </div>

        <div className='grid grid-cols-2 sm:grid-cols-4 gap-2 mb-6'>
          {TAB_ORDER.map(tab => (
            <button
              key={tab}
              onClick={() => onTabChange(tab)}
              className={`seg px-2 py-2.5 text-sm ${activeTab === tab ? 'seg--active' : ''}`}
            >
              {TAB_LABEL[tab]}
            </button>
          ))}
        </div>

        {children}
      </div>
    </div>
  </div>
);
