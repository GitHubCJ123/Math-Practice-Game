import React from 'react';
import type { Operation } from '@shared/types';
import { operationLabels } from './types';

interface QuickMatchFlowProps {
  operation: Operation;
  onOperationChange: (op: Operation) => void;
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
  onSearch,
}) => {
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
            className={`seg px-3 py-2 text-sm ${operation === op ? 'seg--active' : ''}`}
          >
            {operationLabels[op]}
          </button>
        ))}
      </div>
      <button
        onClick={onSearch}
        className='btn3d btn3d--fuchsia w-full py-4 text-lg'
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
  <div className='w-full flex items-center justify-center p-4'>
    <div className='game-panel p-8 max-w-md w-full text-center animate-fade-in'>
      <div className='animate-spin w-16 h-16 border-4 border-violet-200 dark:border-violet-900 border-t-violet-600 rounded-full mx-auto mb-6'></div>
      <h2 className='font-display text-2xl font-bold text-slate-800 dark:text-white mb-2'>
        Searching for Opponent...
      </h2>
      <p className='text-slate-500 dark:text-slate-400 mb-6'>
        Looking for someone to play {operationLabels[operation]} with you
      </p>
      <button
        onClick={onCancel}
        className='btn3d btn3d--neutral px-6 py-3'
      >
        Cancel
      </button>
    </div>
  </div>
);
