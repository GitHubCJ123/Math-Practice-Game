import React from 'react';
import type { ToastMessage } from '../../hooks/useToast';

interface ToastProps {
  toast: ToastMessage | null;
  onDismiss?: () => void;
}

const toneClasses: Record<ToastMessage['tone'], string> = {
  error: 'bg-red-600 text-white',
  info: 'bg-blue-600 text-white',
  success: 'bg-green-600 text-white',
};

export const Toast: React.FC<ToastProps> = ({ toast, onDismiss }) => {
  if (!toast) return null;
  return (
    <div
      role="alert"
      aria-live="assertive"
      className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl shadow-lg ${toneClasses[toast.tone]}`}
    >
      <div className="flex items-center gap-3">
        <span className="font-semibold">{toast.message}</span>
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
