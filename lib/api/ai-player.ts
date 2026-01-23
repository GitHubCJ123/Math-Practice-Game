import type { AIDifficulty, Question, PlayerGameState } from "../../types.js";

// AI difficulty profiles - defines speed and accuracy for each level
export interface AIProfile {
  name: string;
  accuracy: number; // Probability of getting answer correct (0.0 - 1.0)
  minTimePerQuestion: number; // Minimum ms per question
  maxTimePerQuestion: number; // Maximum ms per question
  description: string;
}

export const AI_PROFILES: Record<AIDifficulty, AIProfile> = {
  easy: {
    name: "Easy Bot",
    accuracy: 0.75, // 75% correct
    minTimePerQuestion: 4000, // 4-6 seconds
    maxTimePerQuestion: 6000,
    description: "A beginner-friendly opponent",
  },
  medium: {
    name: "Medium Bot",
    accuracy: 0.85, // 85% correct
    minTimePerQuestion: 2000, // 2-4 seconds
    maxTimePerQuestion: 4000,
    description: "A balanced challenge",
  },
  hard: {
    name: "Hard Bot",
    accuracy: 0.95, // 95% correct
    minTimePerQuestion: 1000, // 1-2 seconds
    maxTimePerQuestion: 2000,
    description: "A tough competitor",
  },
  expert: {
    name: "Expert Bot",
    accuracy: 1.0, // 100% correct
    minTimePerQuestion: 500, // 0.5-1 second
    maxTimePerQuestion: 1000,
    description: "Nearly unbeatable",
  },
};

// Generate a random time within the profile's range
function getRandomTime(profile: AIProfile): number {
  return Math.random() * (profile.maxTimePerQuestion - profile.minTimePerQuestion) + profile.minTimePerQuestion;
}

// Generate a wrong answer for a question (for when AI "makes a mistake")
function generateWrongAnswer(question: Question): string {
  const correctAnswer = question.answer;
  
  if (typeof correctAnswer === "number") {
    // For numeric answers, offset by 1-3
    const offset = Math.floor(Math.random() * 3) + 1;
    const direction = Math.random() < 0.5 ? -1 : 1;
    return String(correctAnswer + (offset * direction));
  }
  
  // For string answers (fractions, percentages), just return a common wrong answer
  if (question.operation === "fraction-to-decimal") {
    return "0.5";
  }
  if (question.operation === "decimal-to-fraction" || question.operation === "percent-to-fraction") {
    return "1/2";
  }
  if (question.operation === "fraction-to-percent") {
    return "50%";
  }
  
  return String(correctAnswer);
}

// Simulate an AI player's game - calculates what the AI would have answered
// Called when the human player finishes to determine AI's results
export function simulateAIGame(
  difficulty: AIDifficulty,
  questions: Question[],
  humanFinishTime: number // How long the human took in ms
): { answers: string[]; totalTime: number; score: number } {
  const profile = AI_PROFILES[difficulty];
  const answers: string[] = [];
  let totalTime = 0;
  let score = 0;
  
  for (const question of questions) {
    // Calculate time for this question
    const questionTime = getRandomTime(profile);
    totalTime += questionTime;
    
    // Determine if AI gets this question correct
    const isCorrect = Math.random() < profile.accuracy;
    
    if (isCorrect) {
      answers.push(String(question.answer));
      score++;
    } else {
      answers.push(generateWrongAnswer(question));
    }
  }
  
  return { answers, totalTime, score };
}

// Get AI player name based on difficulty
export function getAIPlayerName(difficulty: AIDifficulty): string {
  return AI_PROFILES[difficulty].name;
}

// Create an AI player object
export function createAIPlayer(difficulty: AIDifficulty): {
  id: string;
  name: string;
  isHost: boolean;
  isReady: boolean;
  connected: boolean;
  isAI: boolean;
  aiDifficulty: AIDifficulty;
} {
  return {
    id: `ai_${difficulty}_${Date.now()}`,
    name: AI_PROFILES[difficulty].name,
    isHost: false,
    isReady: true, // AI is always ready
    connected: true,
    isAI: true,
    aiDifficulty: difficulty,
  };
}

// Calculate what question the AI would be on at a given elapsed time
export function getAIProgressAtTime(
  difficulty: AIDifficulty,
  elapsedTime: number,
  totalQuestions: number
): number {
  const profile = AI_PROFILES[difficulty];
  const avgTimePerQuestion = (profile.minTimePerQuestion + profile.maxTimePerQuestion) / 2;
  const estimatedProgress = Math.floor(elapsedTime / avgTimePerQuestion);
  return Math.min(estimatedProgress, totalQuestions);
}
