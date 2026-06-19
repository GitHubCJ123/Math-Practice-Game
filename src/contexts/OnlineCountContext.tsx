import React, { createContext, useContext, useState } from 'react';
import { usePusherChannel } from '../hooks/usePusherChannel';
import { GLOBAL_BROADCAST_CHANNEL } from '@shared/types';

const pusherConfigured = Boolean(
  import.meta.env.VITE_PUSHER_KEY && import.meta.env.VITE_PUSHER_CLUSTER
);

/**
 * Live count of clients connected to the public `global-broadcast` channel —
 * i.e. roughly how many people have the site open. Everyone already subscribes
 * to that channel for announcements/polls, so this adds no extra connections;
 * it just reads Pusher's `pusher:subscription_count` event.
 *
 * Requires "subscription counting" to be enabled for the app in the Pusher
 * dashboard; until then (or if Pusher isn't configured) the value stays `null`.
 *
 * Caveat: it counts connections/tabs, not unique people (one person with two
 * tabs counts twice).
 */
const OnlineCountContext = createContext<number | null>(null);

export const OnlineCountProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [count, setCount] = useState<number | null>(null);

  usePusherChannel(pusherConfigured ? GLOBAL_BROADCAST_CHANNEL : null, {
    'pusher:subscription_count': (data: { subscription_count?: number }) => {
      if (data && typeof data.subscription_count === 'number') {
        setCount(data.subscription_count);
      }
    },
  });

  return <OnlineCountContext.Provider value={count}>{children}</OnlineCountContext.Provider>;
};

/** Number of connected clients, or `null` if not yet known / unavailable. */
export const useOnlineCount = (): number | null => useContext(OnlineCountContext);
