import React from 'react';

interface CreateRoomFlowProps {
  isCreating: boolean;
  playerName: string;
  onCreate: () => void;
}

/**
 * "Create Room" tab content. Pure presentational; the host flow itself
 * (settings, players, start) lives in `PrivateRoomScreen`.
 */
export const CreateRoomFlow: React.FC<CreateRoomFlowProps> = ({
  isCreating,
  playerName,
  onCreate,
}) => {
  const disabled = isCreating || !playerName.trim();
  return (
    <div className='text-center'>
      <p className='text-slate-600 dark:text-slate-400 mb-6'>
        Create a private room and invite a friend to play.
      </p>
      <button
        onClick={onCreate}
        disabled={disabled}
        className={`w-full py-4 rounded-xl text-lg font-bold transition-colors ${
          disabled
            ? 'bg-slate-300 dark:bg-slate-700 text-slate-500 cursor-not-allowed'
            : 'bg-blue-600 text-white hover:bg-blue-700'
        }`}
      >
        {isCreating ? 'Creating...' : 'Create Room'}
      </button>
    </div>
  );
};
