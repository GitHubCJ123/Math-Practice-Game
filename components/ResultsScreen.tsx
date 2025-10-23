import React, { useState, useEffect } from 'react';
import { OpenAIClient, AzureKeyCredential } from '@azure/openai';
import type { Operation, Question, HighScores, AllQuizStats } from '../types';
import { CheckCircleIcon, XCircleIcon, StarIcon } from './icons';

let ai: OpenAIClient | null = null;

async function getAiInstance(): Promise<OpenAIClient | null> {
  if (ai) {
    return ai;
  }
  try {
    const apiKey = import.meta.env.VITE_AZURE_API_KEY;
    const apiEndpoint = import.meta.env.VITE_AZURE_ENDPOINT;

    if (!apiKey || !apiEndpoint) {
      console.error("Azure API key or endpoint is not configured. AI features will be disabled.");
      return null;
    }
    
    ai = new OpenAIClient(apiEndpoint, new AzureKeyCredential(apiKey));
    return ai;
  } catch (error) {
    console.error("Failed to initialize Azure OpenAI Client. AI features will be disabled.", error);
    return null;
  }
}

const getFeedbackMessage = async (correctCount: number, totalQuestions: number, timeTaken: number, operation: string): Promise<string> => {
    const client = await getAiInstance();
    if (!client) return "Great effort! Keep practicing to become a math superstar!";
    try {
        const deploymentName = import.meta.env.VITE_AZURE_DEPLOYMENT_NAME;
        if (!deploymentName) {
            console.error("Azure deployment name is not configured.");
            return "Great effort! Keep practicing to become a math superstar!";
        }
        const prompt = `You are a helpful and motivating math tutor for middle school students. A student just finished a ${operation} quiz. They got ${correctCount} out of ${totalQuestions} correct in ${timeTaken} seconds. Write a short, encouraging message for them (2-3 sentences). If their score is low, offer constructive encouragement about improving. If they did well, acknowledge their good performance and perhaps suggest a next step or challenge. Address the student directly.`;

        const { choices } = await client.getChatCompletions(deploymentName, [{ role: "user", content: prompt }]);
        
        return choices[0].message?.content || "Great effort! Keep practicing to become a math superstar!";
    } catch (error) {
        console.error("Error generating feedback:", error);
        return "Great effort! Keep practicing to become a math superstar!";
    }
}

const getExplanation = async (num1: number, num2: number, operation: string, answer: number): Promise<string> => {
    const operationSymbol = operation === 'multiplication' ? '×' : '÷';
    const client = await getAiInstance();
    if (!client) return `To solve ${num1} ${operationSymbol} ${num2}, the answer is ${answer}. Keep trying!`;

    const prompt = `You are a math tutor for middle school students. Explain how to solve the problem "${num1} ${operationSymbol} ${num2}" step-by-step. The correct answer is ${answer}.
For multiplication, explain the standard algorithm or relevant properties of numbers.
For division, explain long division or how to handle remainders/decimals if applicable.
Keep the explanation clear, concise, and focused on the mathematical concepts.`;

    try {
        const deploymentName = import.meta.env.VITE_AZURE_DEPLOYMENT_NAME;
        if (!deploymentName) {
            console.error("Azure deployment name is not configured.");
            return `To solve ${num1} ${operationSymbol} ${num2}, the answer is ${answer}. Keep trying!`;
        }
        const { choices } = await client.getChatCompletions(deploymentName, [{ role: "user", content: prompt }]);
        
        return choices[0].message?.content || `To solve ${num1} ${operationSymbol} ${num2}, the answer is ${answer}. Keep trying!`;
    } catch (error) {
        console.error("Error generating explanation:", error);
        return `To solve ${num1} ${operationSymbol} ${num2}, the answer is ${answer}. Keep trying!`;
    }
}


interface ResultsScreenProps {
  questions: Question[];
  userAnswers: string[];
  timeTaken: number;
  onRestart: () => void;
  quizSettings: {
    operation: Operation;
    selectedNumbers: number[];
    timeLimit: number;
  };
}

export const ResultsScreen: React.FC<ResultsScreenProps> = ({ questions, userAnswers, timeTaken, onRestart, quizSettings }) => {
  const [feedback, setFeedback] = useState('');
  const [isFeedbackLoading, setIsFeedbackLoading] = useState(true);
  const [isNewHighScore, setIsNewHighScore] = useState(false);

  const { operation, selectedNumbers } = quizSettings;

  type ExplanationState = {
    [key: number]: {
      text?: string;
      isLoading: boolean;
    }
  };
  const [explanations, setExplanations] = useState<ExplanationState>({});
  
  const results = questions.map((q, i) => ({
    question: q,
    userAnswer: userAnswers[i],
    isCorrect: parseInt(userAnswers[i], 10) === q.answer
  }));

  const correctCount = results.filter(r => r.isCorrect).length;

  useEffect(() => {
    const fetchFeedback = async () => {
      setIsFeedbackLoading(true);
      const message = await getFeedbackMessage(correctCount, questions.length, timeTaken, operation);
      setFeedback(message);
      setIsFeedbackLoading(false);
    };
    fetchFeedback();
  }, [correctCount, questions.length, timeTaken, operation]);

  useEffect(() => {
    // High Score Logic
    const HIGH_SCORES_KEY = 'mathWhizHighScores';
    try {
      const storedScoresRaw = localStorage.getItem(HIGH_SCORES_KEY);
      const highScores: HighScores = storedScoresRaw ? JSON.parse(storedScoresRaw) : {};
      
      const key = operation;
      const existingScore = highScores[key];

      const isBetterScore = !existingScore || 
                            correctCount > existingScore.score || 
                            (correctCount === existingScore.score && timeTaken < existingScore.time);
      
      if (isBetterScore) {
        highScores[key] = {
          score: correctCount,
          time: timeTaken,
          date: new Date().toISOString(),
        };
        localStorage.setItem(HIGH_SCORES_KEY, JSON.stringify(highScores));
        setIsNewHighScore(true);
      }
    } catch (error) {
      console.error("Failed to process high scores:", error);
    }

    // Statistics Logic
    const STATS_KEY = 'mathWhizStats';
    try {
        const storedStatsRaw = localStorage.getItem(STATS_KEY);
        const allStats: AllQuizStats = storedStatsRaw ? JSON.parse(storedStatsRaw) : {};
        
        const currentStats = allStats[operation] || {
            totalQuizzes: 0,
            totalCorrect: 0,
            totalTime: 0,
            numberFrequency: {}
        };

        currentStats.totalQuizzes += 1;
        currentStats.totalCorrect += correctCount;
        currentStats.totalTime += timeTaken;

        selectedNumbers.forEach(num => {
            currentStats.numberFrequency[num] = (currentStats.numberFrequency[num] || 0) + 1;
        });

        allStats[operation] = currentStats;
        localStorage.setItem(STATS_KEY, JSON.stringify(allStats));

    } catch (error) {
        console.error("Failed to process stats:", error);
    }

  }, [correctCount, timeTaken, operation, selectedNumbers]);

  const handleExplain = async (index: number) => {
    const question = questions[index];
    if (!question || explanations[index]?.isLoading || explanations[index]?.text) return;

    setExplanations(prev => ({ ...prev, [index]: { isLoading: true } }));
    const explanationText = await getExplanation(question.num1, question.num2, question.operation, question.answer);
    setExplanations(prev => ({ ...prev, [index]: { text: explanationText, isLoading: false } }));
  };
  
  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    const timeParts = [];
    if (minutes > 0) timeParts.push(`${minutes} minute${minutes > 1 ? 's' : ''}`);
    if (remainingSeconds > 0) timeParts.push(`${remainingSeconds} second${remainingSeconds > 1 ? 's' : ''}`);
    return timeParts.length > 0 ? timeParts.join(' and ') : '0 seconds';
  };
  
  const getOperationSymbol = (op: 'multiplication' | 'division') => {
    return op === 'multiplication' ? '×' : '÷';
  };

  return (
    <div className="max-w-4xl mx-auto p-6 bg-white dark:bg-slate-900 rounded-3xl shadow-xl border border-slate-200 dark:border-slate-800">
        <div className="text-center mb-8">
            <h1 className="text-4xl sm:text-5xl font-extrabold text-slate-800 dark:text-white mb-2">Results</h1>
            {isNewHighScore && (
                <div className="mt-4 p-3 bg-yellow-100 dark:bg-yellow-500/10 border-2 border-yellow-300 dark:border-yellow-500/30 rounded-lg flex items-center justify-center gap-3 animate-fade-in max-w-sm mx-auto">
                    <StarIcon className="w-8 h-8 text-yellow-500" />
                    <span className="text-xl font-bold text-yellow-700 dark:text-yellow-400">New High Score!</span>
                </div>
            )}
            {isFeedbackLoading ? (
              <div className="h-12 bg-slate-200 dark:bg-slate-700 rounded-md animate-pulse w-3/4 mx-auto my-4"></div>
            ) : (
              <p className="text-lg text-slate-600 dark:text-slate-300 my-4 p-3 bg-slate-100 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 italic">"{feedback}"</p>
            )}
            <p className="text-2xl font-bold text-slate-700 dark:text-slate-200">You scored <span className="text-green-600 dark:text-green-400">{correctCount} / {questions.length}</span></p>
            <p className="text-lg text-slate-500 dark:text-slate-400 mt-1">Total time taken: <span className="font-semibold">{formatTime(timeTaken)}</span></p>
        </div>
        
        <div className="space-y-3">
            {results.map((result, index) => (
                <div key={index} className={`p-4 rounded-lg border-l-4 ${result.isCorrect ? 'bg-green-50 dark:bg-green-500/10 border-green-500' : 'bg-red-50 dark:bg-red-500/10 border-red-500'}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                          <span className="text-slate-600 dark:text-slate-400 font-bold">{index + 1}.</span>
                          <p className="text-xl font-bold text-slate-800 dark:text-slate-200">
                              {result.question.num1} {getOperationSymbol(result.question.operation)} {result.question.num2} = <span className="text-blue-600 dark:text-blue-400">{result.question.answer}</span>
                          </p>
                      </div>
                      <div className="flex items-center gap-3">
                          {result.isCorrect ? (
                              <div className="flex items-center gap-2 text-green-600">
                                  <span className="font-bold text-lg">{result.userAnswer || 'N/A'}</span>
                                  <CheckCircleIcon className="w-7 h-7 animate-pop-in" style={{ animationDelay: `${index * 100}ms` }} />
                              </div>
                          ) : (
                              <div className="flex items-center gap-3 text-red-600">
                                  <span className="font-bold text-lg line-through">{result.userAnswer || 'N/A'}</span>
                                  <XCircleIcon className="w-7 h-7 animate-pop-in" style={{ animationDelay: `${index * 100}ms` }} />
                              </div>
                          )}
                      </div>
                    </div>
                    {!result.isCorrect && (
                      <div className="mt-3 border-t pt-3 border-red-200 dark:border-red-500/20">
                          {explanations[index]?.text ? (
                              <div className="p-3 bg-white dark:bg-slate-800 rounded-md text-slate-800 dark:text-slate-300 animate-fade-in">
                                  <div className="whitespace-pre-wrap text-sm sm:text-base">{explanations[index].text}</div>
                              </div>
                          ) : (
                              <button
                                  onClick={() => handleExplain(index)}
                                  disabled={explanations[index]?.isLoading}
                                  className="px-4 py-1.5 text-sm font-semibold text-white bg-blue-600 rounded-full hover:bg-blue-700 transition-transform hover:scale-105 disabled:bg-slate-400 dark:disabled:bg-slate-600 disabled:scale-100 disabled:cursor-not-allowed"
                              >
                                  {explanations[index]?.isLoading ? 'Thinking...' : 'Explain Answer'}
                              </button>
                          )}
                      </div>
                    )}
                </div>
            ))}
        </div>
        
        <div className="mt-10 text-center">
            <button
                onClick={onRestart}
                className="w-full sm:w-auto px-16 py-4 text-xl font-bold text-white bg-slate-700 hover:bg-slate-800 dark:bg-slate-600 dark:hover:bg-slate-500 rounded-full shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-300"
            >
                Play Again
            </button>
        </div>
    </div>
  );
};
