import { useCallback, useEffect, useState } from 'react';

export interface ToastMessage {
  id: number;
  message: string;
  tone: 'error' | 'info' | 'success';
}

/**
 * Lightweight toast queue. Currently surfaces only the most recent message
 * but is structured so a list can be rendered later if needed.
 */
export function useToast(autoDismissMs: number = 4000): {
  toast: ToastMessage | null;
  showToast: (message: string, tone?: ToastMessage['tone']) => void;
  dismiss: () => void;
} {
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const showToast = useCallback(
    (message: string, tone: ToastMessage['tone'] = 'error') => {
      setToast({ id: Date.now(), message, tone });
    },
    []
  );

  const dismiss = useCallback(() => setToast(null), []);

  useEffect(() => {
    if (!toast || autoDismissMs <= 0) return;
    const id = window.setTimeout(() => setToast(null), autoDismissMs);
    return () => window.clearTimeout(id);
  }, [toast, autoDismissMs]);

  return { toast, showToast, dismiss };
}
