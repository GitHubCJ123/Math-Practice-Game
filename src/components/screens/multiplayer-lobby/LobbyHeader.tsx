import React from 'react';
import { SunIcon, MoonIcon, ArrowLeftIcon } from '../../ui/icons';

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
      className='inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-white/70 dark:bg-slate-800/70 text-violet-600 dark:text-violet-300 font-display font-semibold border border-slate-200 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-800 transition-colors shadow-sm'
    >
      <ArrowLeftIcon className='w-4 h-4' />
      {backLabel.replace('← ', '')}
    </button>
    <button
      onClick={toggleDarkMode}
      className='grid place-items-center w-11 h-11 rounded-2xl bg-slate-100 dark:bg-slate-800 text-amber-500 dark:text-sky-300 border border-slate-200 dark:border-slate-700 hover:scale-110 active:scale-95 transition-transform shadow-sm'
      aria-label='Toggle dark mode'
    >
      {isDarkMode ? <SunIcon className='w-6 h-6' /> : <MoonIcon className='w-6 h-6' />}
    </button>
  </div>
);
