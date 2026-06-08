import { useEffect, useRef } from 'react';
import type { Channel } from 'pusher-js';
import { getPusherClient } from '../lib/multiplayer';

type PusherHandler<T = unknown> = {
  bivarianceHack(data: T): void;
}['bivarianceHack'];

type Handlers = Record<string, PusherHandler>;

/**
 * Subscribes to a Pusher channel, binds the given event handlers,
 * and tears everything down on unmount or when the channel name changes.
 *
 * Handlers can be updated freely between renders; the underlying
 * subscription is only torn down when the channel name changes.
 */
export function usePusherChannel(
  channelName: string | null,
  handlers: Handlers
): void {
  const handlersRef = useRef<Handlers>(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!channelName) return;
    const pusher = getPusherClient();
    const channel: Channel = pusher.subscribe(channelName);

    const eventNames = Object.keys(handlersRef.current);
    const boundFns: Record<string, (data: unknown) => void> = {};
    for (const event of eventNames) {
      const fn = (data: unknown) => {
        handlersRef.current[event]?.(data);
      };
      boundFns[event] = fn;
      channel.bind(event, fn);
    }

    return () => {
      for (const event of eventNames) {
        channel.unbind(event, boundFns[event]);
      }
      pusher.unsubscribe(channelName);
    };
  }, [channelName]);
}
