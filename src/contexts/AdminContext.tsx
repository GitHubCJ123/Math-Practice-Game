import React, { createContext, useCallback, useContext, useState } from 'react';

/**
 * Client-side gate codes. These ship inside the JS bundle, so on their own they
 * are only a soft gate for the admin UI — NOT real security. The actual
 * privileged action (broadcasting) is re-validated server-side in
 * `api/broadcast.ts`, which should be driven by the `ADMIN_CODES` env var in
 * production. Keep this list in sync with that endpoint's fallback codes.
 */
const ADMIN_CODES = ['sigma67eli', 'coderjacobcj67!'];

/** Stored so the validated code survives a refresh and can sign broadcasts. */
const ADMIN_CODE_KEY = 'mathAdminCode';

interface AdminContextValue {
  isAdmin: boolean;
  /** The validated admin code, sent with privileged requests. */
  adminCode: string | null;
  /** Validates a code; on success persists it and returns true. */
  login: (code: string) => boolean;
  logout: () => void;
}

const AdminContext = createContext<AdminContextValue | null>(null);

const readStoredCode = (): string | null => {
  try {
    const stored = sessionStorage.getItem(ADMIN_CODE_KEY);
    return stored && ADMIN_CODES.includes(stored) ? stored : null;
  } catch {
    return null;
  }
};

export const AdminProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [adminCode, setAdminCode] = useState<string | null>(readStoredCode);

  const login = useCallback((code: string): boolean => {
    const trimmed = code.trim();
    if (!ADMIN_CODES.includes(trimmed)) return false;
    try {
      sessionStorage.setItem(ADMIN_CODE_KEY, trimmed);
    } catch {
      // Storage may be unavailable (private mode); auth still holds in memory.
    }
    setAdminCode(trimmed);
    return true;
  }, []);

  const logout = useCallback(() => {
    try {
      sessionStorage.removeItem(ADMIN_CODE_KEY);
    } catch {
      // Ignore storage failures.
    }
    setAdminCode(null);
  }, []);

  const value: AdminContextValue = {
    isAdmin: adminCode !== null,
    adminCode,
    login,
    logout,
  };

  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
};

export const useAdminContext = (): AdminContextValue => {
  const ctx = useContext(AdminContext);
  if (!ctx) {
    throw new Error('useAdminContext must be used within an AdminProvider');
  }
  return ctx;
};
