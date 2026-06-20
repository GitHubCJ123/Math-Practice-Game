import React, { useEffect, useState } from 'react';

/**
 * A slim, always-on announcement bar pinned to the very top of every screen.
 * Unlike the admin broadcast (which is transient and auto-dismisses), this bar
 * is permanent. It rotates through a short list of messages. The admin broadcast
 * banner is rendered directly beneath it, so an incoming broadcast stacks below
 * this bar instead of covering it.
 */
const MESSAGES = [
  '🏆 Multiplayer tournament mode is coming soon!',
  '✨ New design is here — do you like it? Let us know in Feedback!',
];

const ROTATE_MS = 5000;

export const AnnouncementBanner: React.FC = () => {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (MESSAGES.length < 2) return;
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % MESSAGES.length);
    }, ROTATE_MS);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="w-full bg-gradient-to-r from-violet-600 via-fuchsia-600 to-violet-600 text-white shadow-lg">
      <p
        key={index}
        className="px-4 py-2 text-center text-xs sm:text-sm font-semibold tracking-wide truncate animate-fade-in"
      >
        {MESSAGES[index]}
      </p>
    </div>
  );
};
