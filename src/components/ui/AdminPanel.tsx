import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAdminContext } from '../../contexts/AdminContext';
import { useOnlineCount } from '../../contexts/OnlineCountContext';

const MAX_BROADCAST_LENGTH = 280;
const MAX_POLL_QUESTION_LENGTH = 200;
const MAX_POLL_OPTION_LENGTH = 80;
const MAX_POLL_OPTIONS = 6;

type SendStatus = 'idle' | 'sending' | 'sent' | 'error';
type PollStatus = 'idle' | 'starting' | 'live' | 'closing' | 'error';

/**
 * Admin-only control surface rendered inline in the page, directly below the
 * Math Dash ad. Clicking the header collapses it to a single bar. The first
 * tool is a global chat broadcast that pins a message to the top of every
 * player's screen via Pusher.
 *
 * Renders nothing for non-admins.
 */
export const AdminPanel: React.FC = () => {
  const { isAdmin, adminCode, logout } = useAdminContext();
  const onlineCount = useOnlineCount();
  const [expanded, setExpanded] = useState(true);
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<SendStatus>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [recent, setRecent] = useState<string[]>([]);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState<string[]>(['', '']);
  const [pollStatus, setPollStatus] = useState<PollStatus>('idle');
  const [activePollId, setActivePollId] = useState<string | null>(null);
  const [pollError, setPollError] = useState('');

  if (!isAdmin) return null;

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = message.trim();
    if (!trimmed || status === 'sending') return;

    setStatus('sending');
    setErrorMessage('');

    try {
      const response = await fetch('/api/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: adminCode, message: trimmed }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to send broadcast');
      }

      setStatus('sent');
      setRecent((log) => [trimmed, ...log].slice(0, 5));
      setMessage('');
      window.setTimeout(() => setStatus('idle'), 2000);
    } catch (error) {
      setStatus('error');
      setErrorMessage(error instanceof Error ? error.message : 'An error occurred');
    }
  };

  const updatePollOption = (index: number, value: string) => {
    setPollOptions((opts) => opts.map((o, i) => (i === index ? value : o)));
  };
  const addPollOption = () => {
    setPollOptions((opts) => (opts.length >= MAX_POLL_OPTIONS ? opts : [...opts, '']));
  };
  const removePollOption = (index: number) => {
    setPollOptions((opts) => (opts.length <= 2 ? opts : opts.filter((_, i) => i !== index)));
  };

  const handleStartPoll = async (e: React.FormEvent) => {
    e.preventDefault();
    const question = pollQuestion.trim();
    const options = pollOptions.map((o) => o.trim()).filter(Boolean);
    if (!question || options.length < 2 || pollStatus === 'starting') return;

    setPollStatus('starting');
    setPollError('');
    try {
      const response = await fetch('/api/poll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start', code: adminCode, question, options }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to start poll');
      }
      setActivePollId(data.poll.id);
      setPollStatus('live');
    } catch (error) {
      setPollStatus('error');
      setPollError(error instanceof Error ? error.message : 'An error occurred');
    }
  };

  const handleEndPoll = async () => {
    if (!activePollId || pollStatus === 'closing') return;
    setPollStatus('closing');
    setPollError('');
    try {
      const response = await fetch('/api/poll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'close', code: adminCode, pollId: activePollId }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || 'Failed to end poll');
      }
      setActivePollId(null);
      setPollStatus('idle');
      setPollQuestion('');
      setPollOptions(['', '']);
    } catch (error) {
      setPollStatus('error');
      setPollError(error instanceof Error ? error.message : 'An error occurred');
    }
  };

  const canStartPoll =
    pollQuestion.trim().length > 0 &&
    pollOptions.filter((o) => o.trim()).length >= 2;

  return (
    <div className="w-full max-w-[400px] rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-xl overflow-hidden">
      {/* Header — click to expand / collapse */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
      >
        <span className="font-display text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          <span aria-hidden="true">🛠️</span>
          Admin Panel
        </span>
        <span className="flex items-center gap-2.5">
          <span
            title="People connected right now (live)"
            className="inline-flex items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 text-xs font-bold px-2 py-0.5"
          >
            <span aria-hidden="true">👥</span>
            {onlineCount ?? '—'}
          </span>
          <svg
            className={`w-5 h-5 text-slate-400 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </span>
      </button>

      {expanded && (
        <>
          {/* Body */}
          <div className="px-4 pt-4 pb-4 space-y-4 border-t border-slate-200 dark:border-slate-700">
            {onlineCount !== null && (
              <p className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                <span aria-hidden="true">👥</span>
                <span>
                  <span className="font-bold text-slate-700 dark:text-slate-200">{onlineCount}</span>{' '}
                  {onlineCount === 1 ? 'person' : 'people'} online right now
                </span>
              </p>
            )}
            <section>
              <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">Global chat</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Broadcasts to the top of every player&apos;s screen in real time.
              </p>

              <form onSubmit={handleSend} className="mt-3 space-y-2">
                <textarea
                  value={message}
                  onChange={(e) => {
                    setMessage(e.target.value);
                    if (status === 'error') setStatus('idle');
                  }}
                  placeholder="Type an announcement…"
                  rows={3}
                  maxLength={MAX_BROADCAST_LENGTH}
                  className="w-full px-3 py-2 text-sm border-2 border-slate-300 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-violet-500 focus:border-violet-500 transition bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 resize-none"
                />
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400 dark:text-slate-500">
                    {message.length}/{MAX_BROADCAST_LENGTH}
                  </span>
                  {status === 'sent' && (
                    <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                      Broadcast sent!
                    </span>
                  )}
                </div>

                {status === 'error' && (
                  <div className="p-2 bg-red-100 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg">
                    <p className="text-xs text-red-600 dark:text-red-400">{errorMessage}</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={!message.trim() || status === 'sending'}
                  className="btn3d btn3d--primary w-full px-4 py-2.5 text-sm"
                >
                  {status === 'sending' ? 'Broadcasting…' : 'Broadcast to everyone'}
                </button>
              </form>
            </section>

            {/* Poll */}
            <section className="border-t border-slate-200 dark:border-slate-700 pt-4">
              <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">Poll</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Ask a question and let every player vote in real time.
              </p>

              {activePollId ? (
                <div className="mt-3 space-y-3">
                  <div className="flex items-center gap-2 p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                    </span>
                    <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                      Poll is live — results update on every screen.
                    </p>
                  </div>
                  {pollError && (
                    <p className="text-xs text-red-600 dark:text-red-400">{pollError}</p>
                  )}
                  <button
                    onClick={handleEndPoll}
                    disabled={pollStatus === 'closing'}
                    className="btn3d btn3d--danger w-full px-4 py-2.5 text-sm"
                  >
                    {pollStatus === 'closing' ? 'Ending…' : 'End poll'}
                  </button>
                </div>
              ) : (
                <form onSubmit={handleStartPoll} className="mt-3 space-y-2">
                  <input
                    value={pollQuestion}
                    onChange={(e) => setPollQuestion(e.target.value)}
                    placeholder="Poll question…"
                    maxLength={MAX_POLL_QUESTION_LENGTH}
                    className="w-full px-3 py-2 text-sm border-2 border-slate-300 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-violet-500 focus:border-violet-500 transition bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500"
                  />

                  <div className="space-y-2">
                    {pollOptions.map((option, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <input
                          value={option}
                          onChange={(e) => updatePollOption(index, e.target.value)}
                          placeholder={`Option ${index + 1}`}
                          maxLength={MAX_POLL_OPTION_LENGTH}
                          className="flex-1 px-3 py-2 text-sm border-2 border-slate-300 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-violet-500 focus:border-violet-500 transition bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500"
                        />
                        {pollOptions.length > 2 && (
                          <button
                            type="button"
                            onClick={() => removePollOption(index)}
                            aria-label={`Remove option ${index + 1}`}
                            className="shrink-0 p-1.5 text-slate-400 hover:text-rose-500 transition-colors"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  {pollOptions.length < MAX_POLL_OPTIONS && (
                    <button
                      type="button"
                      onClick={addPollOption}
                      className="text-xs font-semibold text-violet-600 dark:text-violet-400 hover:underline"
                    >
                      + Add option
                    </button>
                  )}

                  {pollError && (
                    <p className="text-xs text-red-600 dark:text-red-400">{pollError}</p>
                  )}

                  <button
                    type="submit"
                    disabled={!canStartPoll || pollStatus === 'starting'}
                    className="btn3d btn3d--primary w-full px-4 py-2.5 text-sm"
                  >
                    {pollStatus === 'starting' ? 'Starting…' : 'Start poll'}
                  </button>
                </form>
              )}
            </section>

            {recent.length > 0 && (
              <section>
                <h3 className="text-xs font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                  Recently sent
                </h3>
                <ul className="mt-2 space-y-1.5">
                  {recent.map((text, i) => (
                    <li
                      key={i}
                      className="text-xs text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded-lg px-2.5 py-1.5 break-words"
                    >
                      {text}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between">
            <Link
              to="/admin"
              className="text-xs font-semibold text-violet-600 dark:text-violet-400 hover:underline"
            >
              Admin home
            </Link>
            <button
              onClick={logout}
              className="text-xs font-semibold text-rose-600 dark:text-rose-400 hover:underline"
            >
              Log out
            </button>
          </div>
        </>
      )}
    </div>
  );
};
