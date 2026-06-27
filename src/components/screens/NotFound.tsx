import { Link } from 'react-router-dom';

/**
 * Friendly soft-404 for unmatched routes. Marked noindex by RouteSeo so search
 * engines do not index unknown URLs.
 */
export function NotFound() {
  return (
    <div className="w-full max-w-xl mx-auto text-center bg-white/90 dark:bg-slate-900/80 backdrop-blur rounded-3xl shadow-xl border border-slate-200 dark:border-slate-700 px-8 py-14">
      <div className="text-7xl mb-4" aria-hidden="true">
        🧮
      </div>
      <h1 className="font-display text-4xl font-bold text-slate-800 dark:text-slate-100">
        404: Page Not Found
      </h1>
      <p className="mt-3 text-slate-500 dark:text-slate-400">
        We couldn&apos;t find that page. Let&apos;s get you back to the math.
      </p>
      <Link to="/" className="btn3d btn3d--party mt-8 inline-flex px-7 py-3.5 text-lg">
        Back to Math Practice
      </Link>
    </div>
  );
}
