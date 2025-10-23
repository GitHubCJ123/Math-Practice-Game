
export type Operation = 'multiplication' | 'division';

export interface Question {
  num1: number;
  num2: number;
  operation: Operation;
  answer: number;
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
