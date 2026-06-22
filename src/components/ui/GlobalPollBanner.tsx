import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { usePusherChannel } from '../../hooks/usePusherChannel';
import {
  GLOBAL_BROADCAST_CHANNEL,
  GLOBAL_POLL_STARTED_EVENT,
  GLOBAL_POLL_VOTE_EVENT,
  GLOBAL_POLL_CLOSED_EVENT,
} from '@shared/types';
import type { Poll, PollVote, PollClosed } from '@shared/types';

const pusherConfigured = Boolean(
  import.meta.env.VITE_PUSHER_KEY && import.meta.env.VITE_PUSHER_CLUSTER
);

/** A closed poll lingers this long (final results) before it disappears. */
const REMOVE_AFTER_CLOSE_MS = 30_000;

/**
 * A poll auto-closes this long after it starts if the admin never ends it, so a
 * forgotten poll can't stay open forever (the admin may have closed their tab or
 * moved to another device). The server enforces the same cutoff.
 */
const AUTO_CLOSE_AFTER_START_MS = 10 * 60_000;

/** Remembers which option this browser voted for, so a refresh stays locked. */
const votedStorageKey = (pollId: string) => `mathPollVoted:${pollId}`;

const readVotedOption = (pollId: string): string | null => {
  try {
    return localStorage.getItem(votedStorageKey(pollId));
  } catch {
    return null;
  }
};

/**
 * Listens for admin polls on the shared public Pusher channel and renders a
 * docked voting card for every player. Votes are relayed as individual events,
 * so each connected client aggregates the same stream into an identical live
 * tally. Rendered globally (not just for admins).
 */
export const GlobalPollBanner: React.FC = () => {
  const location = useLocation();
  const [poll, setPoll] = useState<Poll | null>(null);
  const [tallies, setTallies] = useState<Record<string, number>>({});
  const [votedOptionId, setVotedOptionId] = useState<string | null>(null);
  const [closed, setClosed] = useState(false);
  const [closedAt, setClosedAt] = useState<number | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Mirror the active poll into a ref so the mount-time snapshot fetch can tell
  // whether a live `poll-started` already populated state (avoids clobbering).
  const pollRef = useRef<Poll | null>(null);
  useEffect(() => {
    pollRef.current = poll;
  }, [poll]);

  usePusherChannel(pusherConfigured ? GLOBAL_BROADCAST_CHANNEL : null, {
    [GLOBAL_POLL_STARTED_EVENT]: (data: Poll) => {
      if (!data || !Array.isArray(data.options)) return;
      setPoll(data);
      setTallies(Object.fromEntries(data.options.map((o) => [o.id, 0])));
      setVotedOptionId(readVotedOption(data.id));
      setClosed(false);
      setClosedAt(null);
      setDismissed(false);
      setError('');
    },
    [GLOBAL_POLL_VOTE_EVENT]: (data: PollVote) => {
      // Read `poll` from the (always-fresh) handler closure and bump the tally
      // with a PURE functional updater. Never nest setState inside another
      // updater: StrictMode double-invokes updaters, which would double-count.
      if (!data || !poll || data.pollId !== poll.id) return;
      setTallies((prev) => ({
        ...prev,
        [data.optionId]: (prev[data.optionId] ?? 0) + 1,
      }));
    },
    [GLOBAL_POLL_CLOSED_EVENT]: (data: PollClosed) => {
      if (data && poll && data.pollId === poll.id) {
        setClosed(true);
        setClosedAt(Date.now());
      }
    },
  });

  const totalVotes = useMemo(
    () => Object.values(tallies).reduce((sum, n) => sum + n, 0),
    [tallies]
  );

  const castVote = useCallback(
    async (optionId: string) => {
      if (!poll || votedOptionId || closed || submitting) return;
      setSubmitting(true);
      setError('');
      try {
        const response = await fetch('/api/poll', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'vote', pollId: poll.id, optionId }),
        });
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error || 'Vote failed');
        }
        // The live tally updates when the relayed `poll-vote` event arrives, so
        // the count stays consistent for everyone. We only lock this browser.
        setVotedOptionId(optionId);
        try {
          localStorage.setItem(votedStorageKey(poll.id), optionId);
        } catch {
          // Storage may be unavailable (private mode); the in-memory lock holds.
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Vote failed');
      } finally {
        setSubmitting(false);
      }
    },
    [poll, votedOptionId, closed, submitting]
  );

  // Late join: a client that loads mid-poll asks the server for the active poll
  // so it appears immediately (Pusher only delivers events fired after you join).
  useEffect(() => {
    if (!pusherConfigured) return;
    let ignore = false;
    (async () => {
      try {
        const response = await fetch('/api/poll');
        if (ignore || !response.ok) return;
        const data = await response.json();
        // Don't clobber a poll a live `poll-started` may have already populated.
        if (ignore || !data?.poll || pollRef.current) return;
        const active = data.poll as Poll;
        const isClosed = Boolean(data.closed);
        setPoll(active);
        setTallies(
          (data.tallies as Record<string, number> | undefined) ??
            Object.fromEntries(active.options.map((o) => [o.id, 0]))
        );
        setVotedOptionId(readVotedOption(active.id));
        setClosed(isClosed);
        setClosedAt(
          isClosed ? (typeof data.closedAt === 'number' ? data.closedAt : Date.now()) : null
        );
      } catch {
        // Network hiccup — live Pusher events will still populate the poll.
      }
    })();
    return () => {
      ignore = true;
    };
  }, []);

  // Once closed, linger briefly with final results, then remove on every device.
  useEffect(() => {
    if (closedAt === null) return;
    const remaining = Math.max(0, REMOVE_AFTER_CLOSE_MS - (Date.now() - closedAt));
    const timer = window.setTimeout(() => {
      setPoll(null);
      setTallies({});
      setVotedOptionId(null);
      setClosed(false);
      setClosedAt(null);
      setDismissed(false);
    }, remaining);
    return () => window.clearTimeout(timer);
  }, [closedAt]);

  // Safety net: if the admin never ends the poll, every client closes its own
  // banner 10 minutes after the poll started (the server enforces the same
  // cutoff for votes + late joiners). The timer fires async, so no sync setState.
  useEffect(() => {
    if (!poll || closed) return;
    const closeAt = poll.startedAt + AUTO_CLOSE_AFTER_START_MS;
    const timer = window.setTimeout(() => {
      setClosed(true);
      setClosedAt(closeAt);
    }, Math.max(0, closeAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [poll, closed]);

  // Stay out of the way during a solo or multiplayer game; only surface on the
  // home screen. The component stays mounted elsewhere, so votes and the close
  // timer keep running in the background — it just isn't shown mid-game.
  const onHome = location.pathname === '/';
  if (!pusherConfigured || !poll || dismissed || !onHome) return null;

  const showResults = Boolean(votedOptionId) || closed;

  return (
    <div className="fixed inset-x-0 bottom-4 z-[55] flex justify-center px-3 pointer-events-none">
      <div
        key={poll.id}
        role="group"
        aria-label="Live poll"
        className="pointer-events-auto w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 ring-2 ring-violet-400/70 dark:ring-violet-500/60 shadow-2xl shadow-violet-500/40 overflow-hidden animate-bounce-in"
      >
        {/* Header */}
        <div className="flex items-start gap-2.5 px-4 py-3.5 bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white">
          <span className="text-xl leading-none mt-0.5" aria-hidden="true">📊</span>
          <div className="flex-1 min-w-0">
            <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-white/90">
              {!closed && (
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
                </span>
              )}
              {closed ? 'Poll closed' : 'Live poll · vote now'}
            </p>
            <p className="text-base font-bold break-words whitespace-pre-wrap leading-snug">
              {poll.question}
            </p>
          </div>
          <button
            onClick={() => setDismissed(true)}
            aria-label="Dismiss poll"
            className="shrink-0 p-1 -m-1 text-white/80 hover:text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-4 py-3 space-y-2">
          {poll.options.map((option) => {
            const count = tallies[option.id] ?? 0;
            const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
            const isMine = votedOptionId === option.id;

            if (showResults) {
              return (
                <div key={option.id} className="space-y-1">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span
                      className={`font-semibold break-words ${
                        isMine
                          ? 'text-violet-600 dark:text-violet-400'
                          : 'text-slate-700 dark:text-slate-200'
                      }`}
                    >
                      {isMine && <span aria-hidden="true">✓ </span>}
                      {option.text}
                    </span>
                    <span className="shrink-0 tabular-nums text-slate-500 dark:text-slate-400">
                      {pct}% · {count}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 transition-[width] duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            }

            return (
              <button
                key={option.id}
                onClick={() => castVote(option.id)}
                disabled={submitting}
                className="w-full text-left px-3 py-2 text-sm font-semibold rounded-xl border-2 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-violet-500 hover:bg-violet-50 dark:hover:bg-violet-900/20 disabled:opacity-60 transition-colors break-words"
              >
                {option.text}
              </button>
            );
          })}

          {error && (
            <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
          )}

          <p className="pt-0.5 text-[11px] text-slate-400 dark:text-slate-500">
            {showResults
              ? `${totalVotes} ${totalVotes === 1 ? 'vote' : 'votes'}${
                  closed ? '' : ' · live'
                }`
              : 'Tap an option to vote'}
          </p>
        </div>
      </div>
    </div>
  );
};
