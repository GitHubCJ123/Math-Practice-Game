import React, { useState } from 'react';

interface BetaFeedbackProps {
  className?: string;
}

export const BetaFeedback: React.FC<BetaFeedbackProps> = ({ className = '' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [feedbackType, setFeedbackType] = useState<'feature' | 'bug'>('bug');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!message.trim()) {
      setErrorMessage('Please enter a message');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');

    try {
      const response = await fetch('/api/submit-feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: feedbackType,
          message: message.trim(),
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Failed to submit feedback');
      }

      setSubmitStatus('success');
      setMessage('');
      
      setTimeout(() => {
        setIsOpen(false);
        setSubmitStatus('idle');
      }, 2000);
    } catch (error) {
      setSubmitStatus('error');
      setErrorMessage(error instanceof Error ? error.message : 'An error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    setSubmitStatus('idle');
    setMessage('');
    setErrorMessage('');
  };

  return (
    <>
      {/* Inline beta banner with feedback button */}
      <div className={`flex items-center justify-center gap-2 text-sm ${className}`}>
        <span className="text-amber-600 dark:text-amber-400 font-medium">
          ⚠️ Multiplayer is still in beta — there may be issues.
        </span>
        <button
          onClick={() => setIsOpen(true)}
          className="inline-flex items-center gap-1 px-3 py-1 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 rounded-full transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
          </svg>
          Feedback
        </button>
      </div>

      {/* Modal backdrop */}
      {isOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          onClick={handleClose}
        >
          {/* Modal content */}
          <div 
            className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
              <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">
                Send Feedback
              </h2>
              <button
                onClick={handleClose}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Body */}
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {submitStatus === 'success' ? (
                <div className="text-center py-8">
                  <div className="w-16 h-16 mx-auto mb-4 flex items-center justify-center bg-green-100 dark:bg-green-900/30 rounded-full">
                    <svg className="w-8 h-8 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <p className="text-lg font-semibold text-slate-800 dark:text-slate-100">
                    Thank you for your feedback!
                  </p>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                    We appreciate you taking the time to help us improve.
                  </p>
                </div>
              ) : (
                <>
                  {/* Feedback type toggle */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      What would you like to share?
                    </label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setFeedbackType('feature')}
                        className={`flex-1 px-4 py-2 text-sm font-semibold rounded-lg transition-all duration-200 border-2 ${
                          feedbackType === 'feature'
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-700 hover:border-blue-500 dark:hover:border-blue-500'
                        }`}
                      >
                        💡 Feature Request
                      </button>
                      <button
                        type="button"
                        onClick={() => setFeedbackType('bug')}
                        className={`flex-1 px-4 py-2 text-sm font-semibold rounded-lg transition-all duration-200 border-2 ${
                          feedbackType === 'bug'
                            ? 'bg-red-600 text-white border-red-600'
                            : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-300 dark:border-slate-700 hover:border-red-500 dark:hover:border-red-500'
                        }`}
                      >
                        🐛 Bug Report
                      </button>
                    </div>
                  </div>

                  {/* Message textarea */}
                  <div>
                    <label htmlFor="feedback-message" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                      {feedbackType === 'feature' ? 'Describe your idea' : 'Describe the issue'}
                    </label>
                    <textarea
                      id="feedback-message"
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder={
                        feedbackType === 'feature'
                          ? "I'd love to see..."
                          : "I encountered a problem when..."
                      }
                      rows={4}
                      maxLength={2000}
                      className="w-full px-4 py-3 text-sm border-2 border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 resize-none"
                    />
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 text-right">
                      {message.length}/2000
                    </p>
                  </div>

                  {/* Error message */}
                  {errorMessage && (
                    <div className="p-3 bg-red-100 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg">
                      <p className="text-sm text-red-600 dark:text-red-400">{errorMessage}</p>
                    </div>
                  )}

                  {/* Submit button */}
                  <button
                    type="submit"
                    disabled={isSubmitting || !message.trim()}
                    className="w-full px-6 py-3 text-sm font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSubmitting ? (
                      <span className="flex items-center justify-center gap-2">
                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Submitting...
                      </span>
                    ) : (
                      'Submit Feedback'
                    )}
                  </button>
                </>
              )}
            </form>
          </div>
        </div>
      )}
    </>
  );
};
