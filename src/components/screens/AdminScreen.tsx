import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MoonIcon, SunIcon, BrandMark } from '../ui/icons';
import { useAdminContext } from '../../contexts/AdminContext';

interface AdminScreenProps {
  isDarkMode: boolean;
  toggleDarkMode: () => void;
}

export const AdminScreen: React.FC<AdminScreenProps> = ({ isDarkMode, toggleDarkMode }) => {
  const { isAdmin, login, logout } = useAdminContext();
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (login(code)) {
      setCode('');
      setError('');
      // The admin panel is rendered globally; head back to the game where it
      // docks to the side of the screen.
      navigate('/');
    } else {
      setError('Incorrect admin code. Please try again.');
    }
  };

  return (
    <div className="game-panel w-full max-w-2xl mx-auto p-5 sm:p-7 lg:p-9 relative animate-fade-in">
      <button
        onClick={toggleDarkMode}
        aria-label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
        className="absolute top-4 right-4 z-10 grid place-items-center w-11 h-11 rounded-2xl bg-slate-100 dark:bg-slate-800 text-amber-500 dark:text-sky-300 border border-slate-200 dark:border-slate-700 hover:scale-110 active:scale-95 transition-transform shadow-sm"
      >
        {isDarkMode ? <SunIcon className="w-6 h-6" /> : <MoonIcon className="w-6 h-6" />}
      </button>

      <div className="flex flex-col items-center text-center mb-7 pt-2">
        <div className="flex items-center gap-3">
          <BrandMark className="w-11 h-11 sm:w-14 sm:h-14 animate-float drop-shadow-lg" />
          <h1 className="font-display text-3xl sm:text-5xl font-bold text-gradient leading-none pb-1">
            {isAdmin ? 'Admin Panel' : 'Admin Access'}
          </h1>
        </div>
        <p className="mt-3 text-slate-500 dark:text-slate-400 font-semibold">
          {isAdmin ? 'Signed in as admin.' : 'Enter your admin code to continue.'}
        </p>
      </div>

      {isAdmin ? (
        <div className="space-y-6">
          <div className="glass rounded-2xl p-5 text-center">
            <p className="text-slate-600 dark:text-slate-300">
              You&apos;re signed in. The admin panel is docked to the side of the
              screen while you use the game.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link to="/" className="btn3d btn3d--neutral w-full sm:w-auto px-6 py-3 text-base">
              Go to game
            </Link>
            <button
              onClick={logout}
              className="btn3d btn3d--danger w-full sm:w-auto px-6 py-3 text-base"
            >
              Log out
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="max-w-sm mx-auto space-y-4">
          <div>
            <label
              htmlFor="admin-code"
              className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2"
            >
              Admin code
            </label>
            <input
              id="admin-code"
              type="password"
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                setError('');
              }}
              placeholder="Enter admin code"
              autoFocus
              autoComplete="off"
              className="w-full px-4 py-3 text-lg border-2 border-slate-300 dark:border-slate-600 rounded-2xl focus:ring-2 focus:ring-violet-500 focus:border-violet-500 transition bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500"
            />
          </div>

          {error && (
            <div className="p-3 bg-red-100 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={!code.trim()}
            className="btn3d btn3d--primary w-full px-6 py-3 text-base"
          >
            Unlock Admin Panel
          </button>

          <div className="text-center">
            <Link
              to="/"
              className="text-sm font-semibold text-violet-600 dark:text-violet-400 hover:underline"
            >
              ← Back to game
            </Link>
          </div>
        </form>
      )}
    </div>
  );
};
