import React from 'react';
import type { AIDifficulty, Operation } from '@shared/types';
import { aiDifficultyLabels, getNumbersForOperation, operationLabels } from './types';

export interface AIModeFlowState {
  difficulty: AIDifficulty;
  operation: Operation;
  advancedMode: boolean;
  questionCount: number;
  timeLimit: number;
  selectedNumbers: number[];
}

interface AIModeFlowProps {
  state: AIModeFlowState;
  setState: React.Dispatch<React.SetStateAction<AIModeFlowState>>;
  playerName: string;
  isStartingAIGame: boolean;
  onStart: () => void;
}

const TIME_LIMIT_OPTIONS: Array<{ label: string; value: number }> = [
  { label: '30s', value: 30 },
  { label: '1m', value: 60 },
  { label: '2m', value: 120 },
  { label: '5m', value: 300 },
  { label: 'None', value: 0 },
];

/**
 * "AI Mode" tab content. Lets the player pick a difficulty / operation
 * and (optionally) tweak advanced settings before starting a solo game
 * against an AI opponent.
 */
export const AIModeFlow: React.FC<AIModeFlowProps> = ({
  state,
  setState,
  playerName,
  isStartingAIGame,
  onStart,
}) => {
  const {
    difficulty,
    operation,
    advancedMode,
    questionCount,
    timeLimit,
    selectedNumbers,
  } = state;

  const update = (patch: Partial<AIModeFlowState>) =>
    setState(prev => ({ ...prev, ...patch }));

  const availableNumbers = getNumbersForOperation(operation);
  const disabled = !playerName.trim() || isStartingAIGame;

  return (
    <div>
      <p className='text-slate-600 dark:text-slate-400 mb-4 text-center'>
        Practice against an AI opponent at your own pace.
      </p>

      <div className='mb-6'>
        <label className='block text-sm font-medium text-slate-600 dark:text-slate-400 mb-3'>
          AI Difficulty
        </label>
        <div className='grid grid-cols-2 gap-3'>
          {(Object.keys(aiDifficultyLabels) as AIDifficulty[]).map(diff => (
            <button
              key={diff}
              onClick={() => update({ difficulty: diff })}
              className={`p-4 rounded-xl border-2 text-left transition-all ${
                difficulty === diff
                  ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                  : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600'
              }`}
            >
              <div className='flex items-center gap-2 mb-1'>
                <span className='text-xl'>{aiDifficultyLabels[diff].emoji}</span>
                <span className='font-bold text-slate-800 dark:text-white'>
                  {aiDifficultyLabels[diff].name}
                </span>
              </div>
              <p className='text-xs text-slate-500 dark:text-slate-400'>
                {aiDifficultyLabels[diff].description}
              </p>
            </button>
          ))}
        </div>
      </div>

      <div className='mb-6'>
        <label className='block text-sm font-medium text-slate-600 dark:text-slate-400 mb-2'>
          Operation
        </label>
        <div className='grid grid-cols-2 md:grid-cols-3 gap-2'>
          {(Object.keys(operationLabels) as Operation[]).map(op => (
            <button
              key={op}
              onClick={() =>
                update({ operation: op, selectedNumbers: getNumbersForOperation(op) })
              }
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
      </div>

      <div className='mb-4'>
        <button
          onClick={() => update({ advancedMode: !advancedMode })}
          className='text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1'
        >
          {advancedMode ? '▼ Hide Advanced Settings' : '▶ Show Advanced Settings'}
        </button>
      </div>

      {advancedMode && (
        <div className='bg-slate-50 dark:bg-slate-800 rounded-xl p-4 mb-6 space-y-4'>
          <div>
            <label className='block text-sm font-medium text-slate-600 dark:text-slate-400 mb-2'>
              Number of Questions: {questionCount}
            </label>
            <input
              type='range'
              min='5'
              max='30'
              value={questionCount}
              onChange={e => update({ questionCount: parseInt(e.target.value, 10) })}
              className='w-full'
            />
          </div>

          <div>
            <label className='block text-sm font-medium text-slate-600 dark:text-slate-400 mb-2'>
              Time Limit
            </label>
            <div className='flex flex-wrap gap-2'>
              {TIME_LIMIT_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => update({ timeLimit: opt.value })}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    timeLimit === opt.value
                      ? 'bg-blue-600 text-white'
                      : 'bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-600'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className='flex items-center justify-between mb-2'>
              <label className='text-sm font-medium text-slate-600 dark:text-slate-400'>
                Numbers
              </label>
              <div className='flex gap-2'>
                <button
                  onClick={() => update({ selectedNumbers: availableNumbers })}
                  className='text-xs text-blue-600 dark:text-blue-400 hover:underline'
                >
                  Select All
                </button>
                <button
                  onClick={() => update({ selectedNumbers: [1] })}
                  className='text-xs text-slate-500 dark:text-slate-400 hover:underline'
                >
                  Clear
                </button>
              </div>
            </div>
            <div className='flex flex-wrap gap-2'>
              {availableNumbers.map(num => (
                <button
                  key={num}
                  onClick={() => {
                    const next = selectedNumbers.includes(num)
                      ? selectedNumbers.filter(n => n !== num)
                      : [...selectedNumbers, num];
                    if (next.length > 0) update({ selectedNumbers: next });
                  }}
                  className={`w-10 h-10 rounded-lg font-semibold transition-colors ${
                    selectedNumbers.includes(num)
                      ? 'bg-blue-600 text-white'
                      : 'bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-600'
                  }`}
                >
                  {num}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {!advancedMode && (
        <p className='text-xs text-slate-400 dark:text-slate-500 text-center mb-4'>
          Default: 10 questions, no time limit, all numbers
        </p>
      )}

      <button
        onClick={onStart}
        disabled={disabled}
        className={`w-full py-4 rounded-xl text-lg font-bold transition-colors ${
          disabled
            ? 'bg-slate-300 dark:bg-slate-700 text-slate-500 cursor-not-allowed'
            : 'bg-green-600 text-white hover:bg-green-700'
        }`}
      >
        {isStartingAIGame
          ? 'Starting...'
          : `Play vs ${aiDifficultyLabels[difficulty].emoji} ${aiDifficultyLabels[difficulty].name}`}
      </button>
    </div>
  );
};
