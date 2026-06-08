import React from 'react';
import { SunIcon, MoonIcon } from '../../ui/icons';

interface LobbyHeaderProps {
  isDarkMode: boolean;
  toggleDarkMode: () => void;
  backLabel: string;
  onBack: () => void;
}

/**
 * Top bar shared by every lobby screen: back button on the left,
 * dark-mode toggle on the right.
 */
export const LobbyHeader: React.FC<LobbyHeaderProps> = ({
  isDarkMode,
  toggleDarkMode,
  backLabel,
  onBack,
}) => (
  <div className='flex justify-between items-center mb-8'>
    <button
      onClick={onBack}
      className='text-blue-600 dark:text-blue-400 hover:underline font-semibold'
    >
      {backLabel}
    </button>
    <button
      onClick={toggleDarkMode}
      className='p-2 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200'
      aria-label='Toggle dark mode'
    >
      {isDarkMode ? <SunIcon className='w-6 h-6' /> : <MoonIcon className='w-6 h-6' />}
    </button>
  </div>
);
