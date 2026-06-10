import React from 'react';

interface CreateRoomFlowProps {
  isCreating: boolean;
  onCreate: () => void;
}

/**
 * "Create Room" tab content. Pure presentational; the host flow itself
 * (settings, players, start) lives in `PrivateRoomScreen`.
 */
export const CreateRoomFlow: React.FC<CreateRoomFlowProps> = ({
  isCreating,
  onCreate,
}) => {
  return (
    <div className='text-center'>
      <p className='text-slate-600 dark:text-slate-400 mb-6'>
        Create a private room and invite a friend to play.
      </p>
      <button
        onClick={onCreate}
        disabled={isCreating}
        className='btn3d btn3d--primary w-full py-4 text-lg'
      >
        {isCreating ? 'Creating...' : 'Create Room'}
      </button>
    </div>
  );
};
