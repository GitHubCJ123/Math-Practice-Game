/**
 * Tiny logger that silences `log`/`info` calls in production builds.
 * `warn` and `error` always pass through.
 */
const isProd = (): boolean => {
  try {
    return import.meta.env?.PROD === true;
  } catch {
    return false;
  }
};

export const logger = {
  log: (...args: unknown[]): void => {
    if (isProd()) return;
    console.log(...args);
  },
  info: (...args: unknown[]): void => {
    if (isProd()) return;
    console.info(...args);
  },
  warn: (...args: unknown[]): void => {
    console.warn(...args);
  },
  error: (...args: unknown[]): void => {
    console.error(...args);
  },
};
