import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAdminContext } from '../../contexts/AdminContext';

const MAX_BROADCAST_LENGTH = 280;

type SendStatus = 'idle' | 'sending' | 'sent' | 'error';

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
  const [expanded, setExpanded] = useState(true);
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<SendStatus>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [recent, setRecent] = useState<string[]>([]);

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
        <svg
          className={`w-5 h-5 text-slate-400 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <>
          {/* Body */}
          <div className="px-4 pt-4 pb-4 space-y-4 border-t border-slate-200 dark:border-slate-700">
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
