/**
 * Server-side logger that silences `log`/`info` in production. Vercel sets
 * `NODE_ENV=production` on deployed functions, while the local dev API (tsx)
 * leaves it unset — so verbose diagnostics stay available in development and
 * are stripped in production. `warn` and `error` always pass through.
 */
const isProd = process.env.NODE_ENV === "production";

export const logger = {
  log: (...args: unknown[]): void => {
    if (isProd) return;
    console.log(...args);
  },
  info: (...args: unknown[]): void => {
    if (isProd) return;
    console.info(...args);
  },
  warn: (...args: unknown[]): void => {
    console.warn(...args);
  },
  error: (...args: unknown[]): void => {
    console.error(...args);
  },
};
