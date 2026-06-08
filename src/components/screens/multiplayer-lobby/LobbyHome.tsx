import React from 'react';
import { BetaFeedback } from '../../ui/BetaFeedback';
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
  children,
}) => (
  <div className='min-h-screen bg-slate-50 dark:bg-slate-950 p-4 md:p-8 transition-colors duration-300'>
    <div className='max-w-2xl mx-auto'>
      <LobbyHeader
        isDarkMode={isDarkMode}
        toggleDarkMode={toggleDarkMode}
        backLabel='← Back to Menu'
        onBack={onBack}
      />

      <div className='bg-white dark:bg-slate-900 rounded-3xl shadow-xl border border-slate-200 dark:border-slate-800 p-6 md:p-8'>
        <h1 className='text-3xl md:text-4xl font-bold text-center text-slate-800 dark:text-white mb-2'>
          Multiplayer Mode
        </h1>
        <p className='text-center text-slate-500 dark:text-slate-400 mb-4'>
          Challenge a friend or find a random opponent!
        </p>

        <BetaFeedback className='mb-6' />

        <div className='mb-6'>
          <label className='block text-sm font-medium text-slate-600 dark:text-slate-400 mb-2'>
            Your Name
          </label>
          <input
            type='text'
            value={playerName}
            onChange={e => onPlayerNameChange(e.target.value.substring(0, 20))}
            placeholder='Enter your name'
            maxLength={20}
            className='w-full px-4 py-3 rounded-xl border-2 border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-white focus:border-blue-500 focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800 transition-all outline-hidden'
          />
        </div>

        <div className='flex border-b border-slate-200 dark:border-slate-700 mb-6'>
          {TAB_ORDER.map(tab => (
            <button
              key={tab}
              onClick={() => onTabChange(tab)}
              className={`flex-1 py-3 text-sm font-semibold transition-colors ${
                activeTab === tab
                  ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
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
