import React from 'react';

interface JoinRoomFlowProps {
  joinCode: string;
  onJoinCodeChange: (code: string) => void;
  joinError: string | null;
  isJoining: boolean;
  playerName: string;
  onJoin: () => void;
}

/**
 * "Join Room" tab content. Captures an 8-character code and submits it.
 */
export const JoinRoomFlow: React.FC<JoinRoomFlowProps> = ({
  joinCode,
  onJoinCodeChange,
  joinError,
  isJoining,
  playerName,
  onJoin,
}) => {
  const disabled = isJoining || !playerName.trim() || !joinCode.trim();
  return (
    <div>
      <p className='text-slate-600 dark:text-slate-400 mb-4 text-center'>
        Enter the 8-character room code to join.
      </p>
      <input
        type='text'
        value={joinCode}
        onChange={e => onJoinCodeChange(e.target.value.toUpperCase().substring(0, 8))}
        placeholder='ABCD1234'
        maxLength={8}
        className='w-full px-4 py-3 rounded-xl border-2 border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-white text-center text-2xl font-mono tracking-widest focus:border-blue-500 focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800 transition-all outline-none mb-4'
      />
      {joinError && <p className='text-red-500 text-sm text-center mb-4'>{joinError}</p>}
      <button
        onClick={onJoin}
        disabled={disabled}
        className={`w-full py-4 rounded-xl text-lg font-bold transition-colors ${
          disabled
            ? 'bg-slate-300 dark:bg-slate-700 text-slate-500 cursor-not-allowed'
            : 'bg-green-600 text-white hover:bg-green-700'
        }`}
      >
        {isJoining ? 'Joining...' : 'Join Room'}
      </button>
    </div>
  );
};
