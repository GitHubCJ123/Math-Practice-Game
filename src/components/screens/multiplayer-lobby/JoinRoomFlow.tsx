import React from 'react';

interface JoinRoomFlowProps {
  joinCode: string;
  onJoinCodeChange: (code: string) => void;
  joinError: string | null;
  isJoining: boolean;
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
  onJoin,
}) => {
  const disabled = isJoining || !joinCode.trim();
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
        className='w-full px-4 py-3 rounded-2xl border-2 border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-white text-center text-2xl font-display tracking-widest focus:border-violet-500 focus:ring-2 focus:ring-violet-200 dark:focus:ring-violet-800 transition-all outline-hidden mb-4'
      />
      {joinError && <p className='text-rose-500 text-sm text-center mb-4 font-semibold'>{joinError}</p>}
      <button
        onClick={onJoin}
        disabled={disabled}
        className='btn3d btn3d--success w-full py-4 text-lg'
      >
        {isJoining ? 'Joining...' : 'Join Room'}
      </button>
    </div>
  );
};
