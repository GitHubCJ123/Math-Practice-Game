import { useCallback, useState } from 'react';
import { logger } from '../lib/logger';

const buildFallback = (answer: string | number) =>
  `The correct answer is ${answer}. Keep trying!`;

export interface ExplanationState {
  text?: string;
  isLoading: boolean;
}

/**
 * Fetches a worked explanation for an incorrect answer from
 * `/api/get-explanation`. Returns a map keyed by question index so callers
 * can request explanations for individual results lazily.
 */
export function useExplanation(): {
  explanations: Record<number, ExplanationState>;
  fetchExplanation: (
    index: number,
    num1: number,
    num2: number | undefined,
    operation: string,
    answer: string | number
  ) => Promise<void>;
} {
  const [explanations, setExplanations] = useState<Record<number, ExplanationState>>({});

  const fetchExplanation = useCallback(
    async (
      index: number,
      num1: number,
      num2: number | undefined,
      operation: string,
      answer: string | number
    ) => {
      setExplanations(prev => ({ ...prev, [index]: { isLoading: true } }));

      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 10_000);

      try {
        const response = await fetch('/api/get-explanation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ num1, num2, operation, answer }),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('Failed to fetch explanation');
        const data = await response.json();
        setExplanations(prev => ({
          ...prev,
          [index]: { text: data.explanation || buildFallback(answer), isLoading: false },
        }));
      } catch (error) {
        logger.error('Error fetching explanation:', error);
        setExplanations(prev => ({
          ...prev,
          [index]: { text: buildFallback(answer), isLoading: false },
        }));
      } finally {
        window.clearTimeout(timeout);
      }
    },
    []
  );

  return { explanations, fetchExplanation };
}
