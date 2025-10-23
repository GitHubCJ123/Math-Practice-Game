
import React, { useState, useCallback, useEffect } from 'react';
import type { Operation, Question, GameState } from './types';
import { SelectionScreen } from './components/SelectionScreen';
import { QuizScreen } from './components/QuizScreen';
import { ResultsScreen } from './components/ResultsScreen';

const App: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>('selection');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [userAnswers, setUserAnswers] = useState<string[]>([]);
  const [timeTaken, setTimeTaken] = useState(0);
  const [quizSettings, setQuizSettings] = useState<{
    operation: Operation;
    selectedNumbers: number[];
    timeLimit: number;
  } | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    const userPrefersDark = localStorage.getItem('theme') === 'dark' || 
                           (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches);
    setIsDarkMode(userPrefersDark);
  }, []);

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDarkMode]);

  const toggleDarkMode = () => {
    setIsDarkMode(prev => !prev);
  };


  const generateQuestions = useCallback((operation: Operation, selectedNumbers: number[]): Question[] => {
    const newQuestions: Question[] = [];
    const questionSet = new Set<string>();

    while (newQuestions.length < 10) {
      const baseNum = selectedNumbers[Math.floor(Math.random() * selectedNumbers.length)];
      const multiplier = Math.floor(Math.random() * 12) + 1;
      
      let question: Question;
      let questionKey: string;

      if (operation === 'multiplication') {
        const order = Math.random() < 0.5;
        question = {
          num1: order ? baseNum : multiplier,
          num2: order ? multiplier : baseNum,
          operation,
          answer: baseNum * multiplier,
        };
        questionKey = `${question.num1}x${question.num2}`;
      } else { // division
        question = {
          num1: baseNum * multiplier,
          num2: baseNum,
          operation,
          answer: multiplier,
        };
        questionKey = `${question.num1}/${question.num2}`;
      }

      if (!questionSet.has(questionKey)) {
        questionSet.add(questionKey);
        newQuestions.push(question);
      }
    }
    return newQuestions;
  }, []);

  const handleStartQuiz = useCallback((operation: Operation, selectedNumbers: number[], timeLimit: number) => {
    setQuizSettings({ operation, selectedNumbers, timeLimit });
    const generated = generateQuestions(operation, selectedNumbers);
    setQuestions(generated);
    setUserAnswers(Array(10).fill(''));
    setTimeTaken(0);
    setGameState('quiz');
  }, [generateQuestions]);

  const handleFinishQuiz = (answers: string[], time: number) => {
    setUserAnswers(answers);
    setTimeTaken(time);
    setGameState('results');
  };

  const handleRestart = () => {
    setGameState('selection');
  };

  const renderGameState = () => {
    switch (gameState) {
      case 'quiz':
        return (
          <QuizScreen
            questions={questions}
            timeLimit={quizSettings?.timeLimit || 0}
            onFinishQuiz={handleFinishQuiz}
          />
        );
      case 'results':
        return (
          <ResultsScreen
            questions={questions}
            userAnswers={userAnswers}
            timeTaken={timeTaken}
            onRestart={handleRestart}
            quizSettings={quizSettings!}
          />
        );
      case 'selection':
      default:
        return <SelectionScreen 
          onStartQuiz={handleStartQuiz} 
          initialSettings={quizSettings} 
          isDarkMode={isDarkMode}
          toggleDarkMode={toggleDarkMode}
        />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4 transition-colors duration-300">
      <main>
        {renderGameState()}
      </main>
    </div>
  );
};

export default App;
