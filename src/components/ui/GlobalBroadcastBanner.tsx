import React, { useEffect, useState } from 'react';
import { usePusherChannel } from '../../hooks/usePusherChannel';
import { GLOBAL_BROADCAST_CHANNEL, GLOBAL_BROADCAST_EVENT } from '@shared/types';
import type { BroadcastMessage } from '@shared/types';

/** How long a broadcast stays pinned before it auto-dismisses. */
const AUTO_DISMISS_MS = 12_000;

const pusherConfigured = Boolean(
  import.meta.env.VITE_PUSHER_KEY && import.meta.env.VITE_PUSHER_CLUSTER
);

/**
 * Listens for admin broadcasts on a public Pusher channel and pins the latest
 * one to the top of the screen for every player. Rendered globally for all
 * users (not just admins).
 */
export const GlobalBroadcastBanner: React.FC = () => {
  const [current, setCurrent] = useState<BroadcastMessage | null>(null);

  usePusherChannel(pusherConfigured ? GLOBAL_BROADCAST_CHANNEL : null, {
    [GLOBAL_BROADCAST_EVENT]: (data: BroadcastMessage) => {
      if (data && typeof data.message === 'string') {
        setCurrent(data);
      }
    },
  });

  useEffect(() => {
    if (!current) return;
    const timer = window.setTimeout(() => setCurrent(null), AUTO_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [current]);

  if (!current) return null;

  return (
    <div className="flex justify-center px-3 pt-3 pointer-events-none">
      <div
        key={current.id}
        role="status"
        aria-live="polite"
        className="pointer-events-auto flex items-start gap-3 w-full max-w-2xl px-4 py-3 rounded-2xl shadow-2xl shadow-violet-500/30 bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white animate-bounce-in"
      >
        <span className="text-xl leading-none mt-0.5" aria-hidden="true">📣</span>
        <p className="flex-1 text-sm sm:text-base font-semibold break-words whitespace-pre-wrap">
          {current.message}
        </p>
        <button
          onClick={() => setCurrent(null)}
          aria-label="Dismiss announcement"
          className="shrink-0 p-1 -m-1 text-white/80 hover:text-white transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
};
