export interface Conversion {
  numerator: number;
  denominator: number;
  decimal: number;
  fractionString: string;
  decimalString: string;
}

// Helper to keep percent formatting consistent across the app
export const formatPercentString = (decimal: number) => {
  const percentValue = Number((decimal * 100).toFixed(1));
  if (Number.isInteger(percentValue)) {
    return `${percentValue.toFixed(0)}%`;
  }
  return `${percentValue.toFixed(1)}%`;
};

export const conversions: Conversion[] = [
  { numerator: 1, denominator: 2, decimal: 0.5, fractionString: '1/2', decimalString: '0.5' },
  { numerator: 1, denominator: 3, decimal: 0.333, fractionString: '1/3', decimalString: '0.333' },
  { numerator: 2, denominator: 3, decimal: 0.666, fractionString: '2/3', decimalString: '0.666' },
  { numerator: 1, denominator: 4, decimal: 0.25, fractionString: '1/4', decimalString: '0.25' },
  { numerator: 3, denominator: 4, decimal: 0.75, fractionString: '3/4', decimalString: '0.75' },
  { numerator: 1, denominator: 5, decimal: 0.2, fractionString: '1/5', decimalString: '0.2' },
  { numerator: 2, denominator: 5, decimal: 0.4, fractionString: '2/5', decimalString: '0.4' },
  { numerator: 3, denominator: 5, decimal: 0.6, fractionString: '3/5', decimalString: '0.6' },
  { numerator: 4, denominator: 5, decimal: 0.8, fractionString: '4/5', decimalString: '0.8' },
  { numerator: 1, denominator: 6, decimal: 0.166, fractionString: '1/6', decimalString: '0.166' },
  { numerator: 5, denominator: 6, decimal: 0.833, fractionString: '5/6', decimalString: '0.833' },
  { numerator: 1, denominator: 8, decimal: 0.125, fractionString: '1/8', decimalString: '0.125' },
  { numerator: 3, denominator: 8, decimal: 0.375, fractionString: '3/8', decimalString: '0.375' },
  { numerator: 5, denominator: 8, decimal: 0.625, fractionString: '5/8', decimalString: '0.625' },
  { numerator: 7, denominator: 8, decimal: 0.875, fractionString: '7/8', decimalString: '0.875' },
  { numerator: 1, denominator: 9, decimal: 0.111, fractionString: '1/9', decimalString: '0.111' },
  { numerator: 2, denominator: 9, decimal: 0.222, fractionString: '2/9', decimalString: '0.222' },
  { numerator: 4, denominator: 9, decimal: 0.444, fractionString: '4/9', decimalString: '0.444' },
  { numerator: 5, denominator: 9, decimal: 0.555, fractionString: '5/9', decimalString: '0.555' },
  { numerator: 7, denominator: 9, decimal: 0.777, fractionString: '7/9', decimalString: '0.777' },
  { numerator: 8, denominator: 9, decimal: 0.888, fractionString: '8/9', decimalString: '0.888' },
  { numerator: 1, denominator: 10, decimal: 0.1, fractionString: '1/10', decimalString: '0.1' },
  { numerator: 3, denominator: 10, decimal: 0.3, fractionString: '3/10', decimalString: '0.3' },
  { numerator: 7, denominator: 10, decimal: 0.7, fractionString: '7/10', decimalString: '0.7' },
  { numerator: 9, denominator: 10, decimal: 0.9, fractionString: '9/10', decimalString: '0.9' },
];

