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
