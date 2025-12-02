
export type Operation = 'multiplication' | 'division' | 'squares' | 'square-roots' | 'fraction-to-decimal' | 'decimal-to-fraction';

export const DEFAULT_QUESTION_COUNT = 10;
export const MIN_QUESTION_COUNT = 5;
export const MAX_QUESTION_COUNT = 50;
export const MAX_CONVERSION_QUESTION_COUNT = 25; // Limited by available conversions

export interface Question {
  num1: number;
  num2?: number; // num2 is optional for unary operations like squares/roots
  operation: Operation;
  answer: number | string;
  display?: string;
}

export interface QuizResult {
  question: Question;
  userAnswer: string;
  isCorrect: boolean;
}

export type GameState = 'selection' | 'quiz' | 'results';

export interface HighScore {
  score: number;
  time: number;
  date: string;
}

export type HighScores = Record<string, HighScore>;

export interface NumberFrequency {
  [key: number]: number;
}

export interface QuizStats {
  totalQuizzes: number;
  totalCorrect: number;
  totalTime: number;
  numberFrequency: NumberFrequency;
}

export type AllQuizStats = Partial<Record<Operation, QuizStats>>;
