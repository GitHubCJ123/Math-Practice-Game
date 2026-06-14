import type { Operation } from '@shared/types';

export const OPERATION_LABELS: Record<Operation, string> = {
  multiplication: 'Multiplication',
  division: 'Division',
  squares: 'Squares',
  'square-roots': 'Square Roots',
  'fraction-to-decimal': 'Fraction → Decimal',
  'decimal-to-fraction': 'Decimal → Fraction',
  'fraction-to-percent': 'Fraction → Percent',
  'percent-to-fraction': 'Percent → Fraction',
  'negative-numbers': 'Negative Numbers',
};

// Gradient classes used to color-code each operation across the app
// (selection cards, progress panel, etc.).
export const OPERATION_TINTS: Record<Operation, string> = {
  multiplication: 'from-violet-500 to-purple-600',
  division: 'from-sky-500 to-blue-600',
  squares: 'from-emerald-500 to-teal-600',
  'square-roots': 'from-amber-500 to-orange-600',
  'fraction-to-decimal': 'from-fuchsia-500 to-pink-600',
  'decimal-to-fraction': 'from-pink-500 to-rose-600',
  'fraction-to-percent': 'from-cyan-500 to-sky-600',
  'percent-to-fraction': 'from-indigo-500 to-violet-600',
  'negative-numbers': 'from-rose-500 to-red-600',
};

// Short glyphs for compact badges where the full label is shown alongside.
export const OPERATION_SYMBOLS: Record<Operation, string> = {
  multiplication: '×',
  division: '÷',
  squares: 'x²',
  'square-roots': '√',
  'fraction-to-decimal': '½',
  'decimal-to-fraction': '.5',
  'fraction-to-percent': '%',
  'percent-to-fraction': '⅓',
  'negative-numbers': '±',
};

export const ALL_OPERATIONS: Operation[] = [
  'multiplication',
  'division',
  'squares',
  'square-roots',
  'fraction-to-decimal',
  'decimal-to-fraction',
  'fraction-to-percent',
  'percent-to-fraction',
  'negative-numbers',
];

export const getOperationDisplayName = (op: Operation): string => OPERATION_LABELS[op] ?? '';

export const getNumbersForOperation = (op: Operation): number[] => {
  if (op === 'squares' || op === 'square-roots') {
    return Array.from({ length: 20 }, (_, i) => i + 1);
  }
  if (op === 'negative-numbers') {
    return Array.from({ length: 10 }, (_, i) => i + 1);
  }
  return Array.from({ length: 12 }, (_, i) => i + 1);
};
