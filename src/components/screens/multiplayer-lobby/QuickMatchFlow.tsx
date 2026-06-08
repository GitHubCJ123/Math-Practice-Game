import React from 'react';
import type { Operation } from '@shared/types';
import { operationLabels } from './types';

interface QuickMatchFlowProps {
  operation: Operation;
  onOperationChange: (op: Operation) => void;
  playerName: string;
  onSearch: () => void;
}

/**
 * "Quick Match" tab content. Selects an operation and triggers
 * matchmaking; the searching spinner is rendered separately by
 * `QuickMatchSearching`.
 */
export const QuickMatchFlow: React.FC<QuickMatchFlowProps> = ({
  operation,
  onOperationChange,
  playerName,
  onSearch,
}) => {
  const disabled = !playerName.trim();
  return (
    <div>
      <p className='text-slate-600 dark:text-slate-400 mb-4 text-center'>
        Select an operation and find a random opponent.
      </p>
      <div className='grid grid-cols-2 md:grid-cols-3 gap-2 mb-6'>
        {(Object.keys(operationLabels) as Operation[]).map(op => (
          <button
            key={op}
            onClick={() => onOperationChange(op)}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              operation === op
                ? 'bg-blue-600 text-white'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            {operationLabels[op]}
          </button>
        ))}
      </div>
      <button
        onClick={onSearch}
        disabled={disabled}
        className={`w-full py-4 rounded-xl text-lg font-bold transition-colors ${
          disabled
            ? 'bg-slate-300 dark:bg-slate-700 text-slate-500 cursor-not-allowed'
            : 'bg-purple-600 text-white hover:bg-purple-700'
        }`}
      >
        Find Opponent
      </button>
    </div>
  );
};

interface QuickMatchSearchingProps {
  operation: Operation;
  onCancel: () => void;
}

/**
 * Full-screen spinner shown while waiting for an opponent to match.
 */
export const QuickMatchSearching: React.FC<QuickMatchSearchingProps> = ({
  operation,
  onCancel,
}) => (
  <div className='min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4'>
    <div className='bg-white dark:bg-slate-900 rounded-3xl shadow-xl border border-slate-200 dark:border-slate-800 p-8 max-w-md w-full text-center'>
      <div className='animate-spin w-16 h-16 border-4 border-blue-200 dark:border-blue-800 border-t-blue-600 rounded-full mx-auto mb-6'></div>
      <h2 className='text-2xl font-bold text-slate-800 dark:text-white mb-2'>
        Searching for Opponent...
      </h2>
      <p className='text-slate-500 dark:text-slate-400 mb-6'>
        Looking for someone to play {operationLabels[operation]} with you
      </p>
      <button
        onClick={onCancel}
        className='px-6 py-3 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl font-semibold hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors'
      >
        Cancel
      </button>
    </div>
  </div>
);
