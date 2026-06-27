import { useState } from 'react';
import { Link } from 'react-router-dom';

/**
 * Crawlable, keyword-rich supporting content for the home page (rendered below
 * the interactive tool and leaderboards). Gives search engines real on-page text
 * about the product and an FAQ. The questions/answers here are mirrored by the
 * FAQPage JSON-LD in index.html, so keep them in sync.
 */

const faqs: { q: string; a: string }[] = [
  {
    q: 'Is Math Practice Game free?',
    a: 'Yes. It is completely free to play, with nothing to buy and no account required.',
  },
  {
    q: 'What math topics can kids practice?',
    a: 'Multiplication and times tables, division, squares, square roots, negative-number arithmetic, and fraction, decimal, and percent conversions.',
  },
  {
    q: 'Can I play math games with friends?',
    a: 'Yes. Create a multiplayer room and share the code to race friends in real time, or practice against AI opponents.',
  },
  {
    q: 'Do I need an account to play?',
    a: 'No. You can start instantly. A nickname is only used for multiplayer matches and the leaderboards.',
  },
  {
    q: 'What age group is it for?',
    a: 'It works well for elementary and middle-school students, and for anyone who wants to sharpen their mental math.',
  },
  {
    q: 'Does it work on phones and tablets?',
    a: 'Yes. It runs in any modern browser on phones, tablets, and computers.',
  },
];

export function HomeSeoContent() {
  const [open, setOpen] = useState(false);
  return (
    <section
      aria-labelledby="about-heading"
      className="mt-12 pt-8 border-t border-slate-200 dark:border-slate-700"
    >
      <div className="flex justify-center">
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          aria-expanded={open}
          aria-controls="about-content"
          className="btn3d btn3d--neutral px-5 py-2 text-sm"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            className={`w-4 h-4 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
            aria-hidden="true"
          >
            <path
              d="M6 9l6 6 6-6"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {open ? 'Hide info' : 'About Math Practice Game'}
        </button>
      </div>
      <div id="about-content" className={`mx-auto max-w-2xl text-left ${open ? 'mt-8' : 'hidden'}`}>
        <h2
          id="about-heading"
          className="font-display text-2xl sm:text-3xl font-bold text-slate-800 dark:text-slate-100"
        >
          Free math practice for kids
        </h2>
        <p className="mt-3 text-slate-600 dark:text-slate-300 leading-relaxed">
          Math Practice Game is a free, browser-based way for kids to build mental-math fluency.
          Practice multiplication and times tables, division, squares, square roots, and conversions
          between fractions, decimals, and percents. Every round is a short, timed sprint with
          instant feedback, so learners improve quickly and stay motivated.
        </p>
        <p className="mt-3 text-slate-600 dark:text-slate-300 leading-relaxed">
          Play solo to beat your best time, or start a{' '}
          <Link to="/multiplayer" className="text-violet-600 dark:text-violet-400 font-semibold underline-offset-2 hover:underline">
            live multiplayer room
          </Link>{' '}
          to race friends and AI opponents. Monthly global leaderboards keep things competitive and
          fun. There is no download and no sign-up. Pick a topic above and start practicing in
          seconds.
        </p>

        <h3 className="mt-8 font-display text-lg font-bold text-slate-800 dark:text-slate-100">
          What you can practice
        </h3>
        <ul className="mt-3 space-y-2 text-slate-600 dark:text-slate-300 list-disc pl-5">
          <li>Multiplication and times tables (1 to 12 and beyond)</li>
          <li>Division facts</li>
          <li>Squares and square roots</li>
          <li>Fraction, decimal, and percent conversions</li>
          <li>Adding and subtracting negative numbers</li>
        </ul>

        <h2 className="mt-10 font-display text-2xl sm:text-3xl font-bold text-slate-800 dark:text-slate-100">
          Frequently asked questions
        </h2>
        <dl className="mt-4">
          {faqs.map(({ q, a }) => (
            <div key={q} className="mt-5">
              <dt className="font-display text-lg font-semibold text-slate-800 dark:text-slate-100">
                {q}
              </dt>
              <dd className="mt-1 text-slate-600 dark:text-slate-300 leading-relaxed">{a}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
