/**
 * Server-side admin authorization. Shared by every privileged endpoint
 * (`api/broadcast.ts`, `api/poll.ts`) so the authoritative code check lives in
 * exactly one place.
 *
 * Authorized admin codes. Prefer setting `ADMIN_CODES` (comma-separated) in the
 * environment so codes never live in committed source. The fallback list keeps
 * the feature working out of the box and must stay in sync with the client gate
 * in `src/contexts/AdminContext.tsx`.
 */
const FALLBACK_ADMIN_CODES = ["sigma67eli", "coderjacobcj67!"];

export function getAdminCodes(): string[] {
  const fromEnv = process.env.ADMIN_CODES;
  if (fromEnv && fromEnv.trim()) {
    return fromEnv
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);
  }
  return FALLBACK_ADMIN_CODES;
}

/** Server-side authorization check for the privileged admin actions. */
export function isValidAdminCode(code: string): boolean {
  return getAdminCodes().includes(code);
}
