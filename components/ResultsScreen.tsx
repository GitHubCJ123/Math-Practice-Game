import React, { useState, useEffect } from 'react';
import { OpenAIClient, AzureKeyCredential } from '@azure/openai';
import type { Operation, Question, HighScores, AllQuizStats } from '../types';
import { CheckCircleIcon, XCircleIcon, StarIcon, TrophyIcon } from './icons';
import { feedbackMessages } from '../lib/feedbackMessages';

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

const getExplanation = async (num1: number, num2: number | undefined, operation: string, answer: string | number): Promise<string> => {
    let prompt = '';

    switch(operation) {
        case 'multiplication':
        case 'division':
        case 'squares':
        case 'square-roots':
            const problemString = operation === 'multiplication' ? `${num1} × ${num2}` :
                                  operation === 'division' ? `${num1} ÷ ${num2}` :
                                  operation === 'squares' ? `${num1}²` : `√${num1}`;
            prompt = `You are a math speed coach. A student needs to solve "${problemString}" quickly. 
            1. Briefly explain the standard method.
            2. Provide a mental math trick or shortcut to solve it faster. For example, for 99÷9, you could explain that 9*10=90, and one more 9 makes 99, so the answer is 11.
            Keep the entire explanation concise and encouraging. The correct answer is ${answer}.`;
            break;

        case 'fraction-to-decimal':
            prompt = `You are a math speed coach. A student needs to convert the fraction ${num1}/${num2} to a decimal.
            1. Briefly explain the long division method (numerator divided by denominator).
            2. Explain how to handle repeating decimals by rounding to three decimal places.
            Keep the explanation concise and clear. The correct answer is ${answer}.`;
            break;

        case 'decimal-to-fraction':
            prompt = `You are a math speed coach. A student needs to convert the decimal ${num1} to a fraction in simplest form.
            1. Explain how to convert the decimal to a fraction based on its place value (e.g., 0.75 = 75/100).
            2. Explain how to simplify the fraction to its lowest terms by finding the greatest common divisor.
            Keep the explanation concise and clear. The correct answer is ${answer}.`;
            break;
            
        default:
            return "Sorry, an explanation could not be generated for this problem.";
    }
    
    const client = await getAiInstance();
    if (!client) return `The correct answer is ${answer}. Keep trying!`;

    try {
        const deploymentName = import.meta.env.VITE_AZURE_DEPLOYMENT_NAME;
        if (!deploymentName) {
            console.error("Azure deployment name is not configured.");
            return `The correct answer is ${answer}. Keep trying!`;
        }
        const { choices } = await client.getChatCompletions(deploymentName, [{ role: "user", content: prompt }]);
        
        return choices[0].message?.content || `The correct answer is ${answer}. Keep trying!`;
    } catch (error) {
        console.error("Error generating explanation:", error);
        return `The correct answer is ${answer}. Keep trying!`;
    }
}

const getFeedbackMessage = (correctCount: number, totalQuestions: number, timeTaken: number): string => {
    const score = correctCount / totalQuestions;
    const averageTimePerQuestion = timeTaken / totalQuestions;

    let category: keyof typeof feedbackMessages;

    if (score === 1) { // Perfect
        if (averageTimePerQuestion <= 3) category = 'perfect_rapid';
        else if (averageTimePerQuestion <= 6) category = 'perfect_fast';
        else if (averageTimePerQuestion <= 10) category = 'perfect_methodical';
        else category = 'perfect_deliberate';
    } else if (score >= 0.8) { // Great
        if (averageTimePerQuestion <= 4) category = 'great_rapid';
        else if (averageTimePerQuestion <= 7) category = 'great_fast';
        else if (averageTimePerQuestion <= 12) category = 'great_methodical';
        else category = 'great_deliberate';
    } else if (score >= 0.5) { // Good
        if (averageTimePerQuestion <= 5) category = 'good_rapid';
        else if (averageTimePerQuestion <= 8) category = 'good_fast';
        else if (averageTimePerQuestion <= 15) category = 'good_methodical';
        else category = 'good_deliberate';
    } else { // Practice
        category = 'practice';
    }

    const messages = feedbackMessages[category];
    return messages[Math.floor(Math.random() * messages.length)];
};


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
  const [isNewHighScore, setIsNewHighScore] = useState(false);

  const [isTopScore, setIsTopScore] = useState<boolean | null>(null);
  const [playerName, setPlayerName] = useState('');
  const [submissionStatus, setSubmissionStatus] = useState<'idle' | 'submitting' | 'submitted' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const { operation, selectedNumbers } = quizSettings;

  type ExplanationState = {
    [key: number]: {
      text?: string;
      isLoading: boolean;
    }
  };
  const [explanations, setExplanations] = useState<ExplanationState>({});
  
  const results = questions.map((q, i) => {
    let userAnswer = userAnswers[i]?.trim();
    if (q.operation === 'fraction-to-decimal' && userAnswer?.startsWith('.')) {
        userAnswer = '0' + userAnswer;
    }
    const isCorrect = userAnswer === String(q.answer);
    return {
        question: q,
        userAnswer: userAnswers[i],
        isCorrect: isCorrect
    };
  });

  const correctCount = results.filter(r => r.isCorrect).length;

  useEffect(() => {
    // Check if score is a top score
    const checkScore = async () => {
      const isConversionMode = operation === 'fraction-to-decimal' || operation === 'decimal-to-fraction';
      
      const numbersForOperation = operation === 'squares' || operation === 'square-roots'
        ? Array.from({ length: 20 }, (_, i) => i + 1)
        : Array.from({ length: 12 }, (_, i) => i + 1);

      const allNumbersSelected = selectedNumbers.length === numbersForOperation.length;
      
      // Eligibility for leaderboard: perfect score and all numbers selected (for non-conversion modes)
      const isEligible = correctCount === questions.length && 
                         questions.length > 0 && 
                         (isConversionMode || allNumbersSelected);

      console.log('[ResultsScreen] Leaderboard eligibility check', {
        operation,
        correctCount,
        totalQuestions: questions.length,
        isConversionMode,
        allNumbersSelected,
        isEligible,
      });

      if (isEligible) {
        const scoreInMs = Math.round(timeTaken * 1000);
        try {
          console.log('[ResultsScreen] Submitting check-score request', {
            operation,
            scoreInMs,
          });
          const response = await fetch(`/api/scores?action=check&operationType=${operation}&score=${scoreInMs}`);
          const data = await response.json();
          console.log('[ResultsScreen] check-score response', data);
          setIsTopScore(data.isTopScore);
        } catch (error) {
          console.error("Failed to check score:", error);
          setIsTopScore(false);
        }
      } else {
        setIsTopScore(false);
      }
    };
    checkScore();
  }, [correctCount, questions.length, timeTaken, operation, selectedNumbers]);

  useEffect(() => {
    const message = getFeedbackMessage(correctCount, questions.length, timeTaken);
    setFeedback(message);
  }, [correctCount, questions.length, timeTaken]);

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

  const handleSubmitScore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!playerName.trim() || submissionStatus === 'submitting') return;

    setSubmissionStatus('submitting');
    setErrorMessage('');
    const scoreInMs = Math.round(timeTaken * 1000);

    try {
      const response = await fetch('/api/scores?action=submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'submit',
          playerName: playerName.trim(),
          score: scoreInMs,
          operationType: operation,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'An error occurred.');
      }

      setSubmissionStatus('submitted');
    } catch (error) {
      setSubmissionStatus('error');
      setErrorMessage(error.message);
    }
  };

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
  
  const getOperationSymbol = (op: Operation) => {
    switch (op) {
      case 'multiplication': return '×';
      case 'division': return '÷';
      case 'squares': return '²';
      case 'square-roots': return '√';
      default: return '?';
    }
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
            <p className="text-lg text-slate-600 dark:text-slate-300 my-4 p-3 bg-slate-100 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 italic">"{feedback}"</p>
            <p className="text-2xl font-bold text-slate-700 dark:text-slate-200">You scored <span className="text-green-600 dark:text-green-400">{correctCount} / {questions.length}</span></p>
            <p className="text-lg text-slate-500 dark:text-slate-400 mt-1">Total time taken: <span className="font-semibold">{formatTime(timeTaken)}</span></p>
        </div>

        {isTopScore && submissionStatus !== 'submitted' && (
          <div className="my-6 p-6 bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-500 rounded-2xl animate-fade-in text-center relative">
            <button 
              onClick={() => setIsTopScore(false)}
              className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
              aria-label="Close submission form"
            >
              <XCircleIcon className="w-6 h-6" />
            </button>
            <div className="flex items-center justify-center gap-3 mb-3">
              <TrophyIcon className="w-8 h-8 text-blue-500" />
              <h2 className="text-2xl font-bold text-blue-800 dark:text-blue-300">You're in the Top 5!</h2>
            </div>
            <p className="text-blue-700 dark:text-blue-400 mb-1">Enter your name to be added to the global leaderboard.</p>
            <p className="text-sm text-blue-600 dark:text-blue-500 mb-4">(First name or nickname recommended)</p>
            <form onSubmit={handleSubmitScore} className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <input 
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="Enter your name"
                maxLength={50}
                required
                className="w-full sm:w-64 px-4 py-2 text-lg border-2 border-slate-300 dark:border-slate-600 rounded-full focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100"
              />
              <button 
                type="submit"
                disabled={submissionStatus === 'submitting'}
                className="w-full sm:w-auto px-8 py-2 text-lg font-bold text-white bg-blue-600 rounded-full shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submissionStatus === 'submitting' ? 'Submitting...' : 'Submit Score'}
              </button>
            </form>
            {submissionStatus === 'error' && <p className="text-red-500 mt-3">{errorMessage}</p>}
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-4 italic">
              If you're already on the leaderboard, use the same name to replace your old score (only if this one is better).
            </p>
          </div>
        )}
        
        {submissionStatus === 'submitted' && (
          <div className="my-6 p-4 bg-green-100 dark:bg-green-500/10 border-2 border-green-500 rounded-lg text-center animate-fade-in">
            <p className="font-bold text-green-700 dark:text-green-300">Your score has been submitted to the leaderboard!</p>
          </div>
        )}

        <div className="space-y-3">
            {results.map((result, index) => (
                <div key={index} className={`p-4 rounded-lg border-l-4 ${result.isCorrect ? 'bg-green-50 dark:bg-green-500/10 border-green-500' : 'bg-red-50 dark:bg-red-500/10 border-red-500'}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                          <span className="text-slate-600 dark:text-slate-400 font-bold">{index + 1}.</span>
                          <p className="text-xl font-bold text-slate-800 dark:text-slate-200">
                              {result.question.display ? (
                                <span>{result.question.display}</span>
                              ) : (
                                <>
                                  {result.question.operation === 'square-roots' && getOperationSymbol(result.question.operation)}
                                  {result.question.num1}
                                  {result.question.operation === 'squares' ? <sup>2</sup> : (result.question.operation !== 'square-roots' && getOperationSymbol(result.question.operation))}
                                  {result.question.num2 && ` ${result.question.num2}`}
                                </>
                              )}
                               = <span className="text-blue-600 dark:text-blue-400">{String(result.question.answer)}</span>
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
