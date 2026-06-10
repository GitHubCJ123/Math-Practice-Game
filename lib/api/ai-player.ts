import type { AIDifficulty } from "../../shared/types.js";

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
