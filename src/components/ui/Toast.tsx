import React from 'react';
import type { ToastMessage } from '../../hooks/useToast';

interface ToastProps {
  toast: ToastMessage | null;
  onDismiss?: () => void;
}

const toneClasses: Record<ToastMessage['tone'], string> = {
  error: 'from-rose-500 to-red-600',
  info: 'from-violet-500 to-indigo-600',
  success: 'from-emerald-500 to-teal-600',
};

export const Toast: React.FC<ToastProps> = ({ toast, onDismiss }) => {
  if (!toast) return null;
  return (
    <div
      role="alert"
      aria-live="assertive"
      className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl shadow-xl text-white bg-gradient-to-r ${toneClasses[toast.tone]} animate-bounce-in`}
    >
      <div className="flex items-center gap-3">
        <span className="font-display font-semibold">{toast.message}</span>
        {onDismiss && (
          <button
            onClick={onDismiss}
            aria-label="Dismiss notification"
            className="ml-2 text-white/80 hover:text-white text-lg leading-none"
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
};
