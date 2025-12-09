import React, { useState, useCallback, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import type { Operation, Question } from './types';
import { DEFAULT_QUESTION_COUNT } from './types';
import { SelectionScreen } from './components/SelectionScreen';
import { QuizScreen } from './components/QuizScreen';
import { ResultsScreen } from './components/ResultsScreen';
import { MathDashAd } from './components/MathDashAd';
import { conversions, formatPercentString } from './lib/conversions';
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { trackPageView } from './lib/ga';

const App: React.FC = () => {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [userAnswers, setUserAnswers] = useState<string[]>([]);
  const [timeTaken, setTimeTaken] = useState(0);
  const [quizSettings, setQuizSettings] = useState<{
    operation: Operation;
    selectedNumbers: number[];
    timeLimit: number;
    questionCount: number;
  } | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    const userPrefersDark = localStorage.getItem('theme') === 'dark';
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


  const generateQuestions = useCallback((operation: Operation, selectedNumbers: number[], questionCount: number = DEFAULT_QUESTION_COUNT): Question[] => {
    const newQuestions: Question[] = [];
    const questionSet = new Set<string>();

    if (
      operation === 'fraction-to-decimal' ||
      operation === 'decimal-to-fraction' ||
      operation === 'fraction-to-percent' ||
      operation === 'percent-to-fraction'
    ) {
        const shuffledConversions = [...conversions].sort(() => 0.5 - Math.random());
        const selectedConversions = shuffledConversions.slice(0, Math.min(questionCount, conversions.length));

        selectedConversions.forEach(conv => {
          switch (operation) {
            case 'fraction-to-decimal':
              newQuestions.push({
                  operation,
                  display: conv.fractionString,
                  answer: conv.decimalString,
                  num1: conv.numerator,
                  num2: conv.denominator,
              });
              break;
            case 'decimal-to-fraction':
              newQuestions.push({
                  operation,
                  display: conv.decimalString,
                  answer: conv.fractionString,
                  num1: conv.decimal,
              });
              break;
            case 'fraction-to-percent': {
              const percentString = formatPercentString(conv.decimal);
              newQuestions.push({
                  operation,
                  display: conv.fractionString,
                  answer: percentString,
                  num1: conv.numerator,
                  num2: conv.denominator,
              });
              break;
            }
            case 'percent-to-fraction': {
              const percentString = formatPercentString(conv.decimal);
              newQuestions.push({
                  operation,
                  display: percentString,
                  answer: conv.fractionString,
                  num1: percentString.endsWith('%') ? parseFloat(percentString.slice(0, -1)) : conv.decimal * 100,
              });
              break;
            }
          }
        });
        return newQuestions;
    }

    while (newQuestions.length < questionCount) {
      const baseNum = selectedNumbers[Math.floor(Math.random() * selectedNumbers.length)];
      
      let question: Question;
      let questionKey: string;

      if (operation === 'multiplication') {
        const multiplier = Math.floor(Math.random() * 12) + 1;
        const order = Math.random() < 0.5;
        question = {
          num1: order ? baseNum : multiplier,
          num2: order ? multiplier : baseNum,
          operation,
          answer: baseNum * multiplier,
        };
        questionKey = `${question.num1}x${question.num2}`;
      } else if (operation === 'division') {
        const multiplier = Math.floor(Math.random() * 12) + 1;
        question = {
          num1: baseNum * multiplier,
          num2: baseNum,
          operation,
          answer: multiplier,
        };
        questionKey = `${question.num1}/${question.num2}`;
      } else if (operation === 'squares') {
        question = {
          num1: baseNum,
          operation,
          answer: baseNum * baseNum,
        };
        questionKey = `${baseNum}^2`;
      } else { // square-roots
        question = {
          num1: baseNum * baseNum,
          operation,
          answer: baseNum,
        };
        questionKey = `sqrt(${baseNum*baseNum})`;
      }

      if (!questionSet.has(questionKey)) {
        questionSet.add(questionKey);
        newQuestions.push(question);
      }
    }
    return newQuestions;
  }, []);

  const handleStartQuiz = useCallback(
    (operation: Operation, selectedNumbers: number[], timeLimit: number, questionCount: number = DEFAULT_QUESTION_COUNT) => {
      setQuizSettings({ operation, selectedNumbers, timeLimit, questionCount });
      const generated = generateQuestions(operation, selectedNumbers, questionCount);
      setQuestions(generated);
      setUserAnswers(Array(generated.length).fill(''));
      setTimeTaken(0);
      // navigate('/quiz'); // This is handled by the wrapper component
    },
    [generateQuestions, /*navigate,*/ setQuestions, setQuizSettings, setTimeTaken, setUserAnswers]
  );

  const handleShowResults = (answers: string[], time: number) => {
    setUserAnswers(answers);
    setTimeTaken(time);
    // navigate('/results'); // This is handled by the wrapper component
  };

  // Expose the quiz finisher to the window for Cypress testing
  if (import.meta.env.VITE_NODE_ENV === 'test') {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    window.onFinishQuiz = (answers: string[], time: number) => {
      // In a test context, we need to ensure questions are set for the results screen
      if (questions.length === 0) {
        setQuizSettings({ operation: 'multiplication', selectedNumbers: [1,2,3,4,5,6,7,8,9,10,11,12], timeLimit: 0, questionCount: DEFAULT_QUESTION_COUNT });
        setQuestions(generateQuestions('multiplication', [1,2,3,4,5,6,7,8,9,10,11,12], DEFAULT_QUESTION_COUNT));
      }
      handleShowResults(answers, time);
      // We need a way to navigate in tests. This is a simple solution.
      setTimeout(() => window.location.pathname = '/results', 100);
    };
  }

  const handleRestart = () => {
    // navigate('/'); // This is handled by the wrapper component
    // This function can be used to reset state if needed in the future
  };

  return (
    <BrowserRouter>
      <RouteChangeTracker />
      <div className="w-full bg-blue-600 text-white text-center py-2 font-bold">
        Multiplayer Mode Coming Soon!
      </div>
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-4 transition-colors duration-300 relative">
        <main className="w-full flex justify-center">
          <Routes>
            <Route
              path="/"
              element={
                <SelectionScreenWrapper
                  toggleDarkMode={toggleDarkMode}
                  isDarkMode={isDarkMode}
                  initialSettings={quizSettings}
                  generateQuestions={generateQuestions}
                  setQuestions={setQuestions}
                  setUserAnswers={setUserAnswers}
                  setTimeTaken={setTimeTaken}
                  setQuizSettings={setQuizSettings}
                  handleStartQuiz={handleStartQuiz}
                />
              }
            />
            <Route
              path="/quiz"
              element={
                <QuizScreenWrapper
                  questions={questions}
                  quizSettings={quizSettings}
                  setUserAnswers={setUserAnswers}
                  setTimeTaken={setTimeTaken}
                  handleShowResults={handleShowResults}
                />
              }
            />
            <Route
              path="/results"
              element={
                <ResultsScreenWrapper
                  questions={questions}
                  userAnswers={userAnswers}
                  timeTaken={timeTaken}
                  quizSettings={quizSettings}
                  handleRestart={handleRestart}
                />
              }
            />
          </Routes>
        </main>
        
        <Analytics />
        <SpeedInsights />
      </div>
    </BrowserRouter>
  );
};

const RouteChangeTracker: React.FC = () => {
  const location = useLocation();

  useEffect(() => {
    trackPageView(location.pathname + location.search);
  }, [location.pathname, location.search]);

  return null;
};

interface SelectionScreenWrapperProps {
  toggleDarkMode: () => void;
  isDarkMode: boolean;
  initialSettings: any;
  generateQuestions: (operation: Operation, selectedNumbers: number[], questionCount: number) => Question[];
  setQuestions: (questions: Question[]) => void;
  setUserAnswers: (answers: string[]) => void;
  setTimeTaken: (time: number) => void;
  setQuizSettings: (settings: any) => void;
  handleStartQuiz: (operation: Operation, selectedNumbers: number[], timeLimit: number, questionCount: number) => void;
}

const SelectionScreenWrapper: React.FC<SelectionScreenWrapperProps> = ({
  toggleDarkMode,
  isDarkMode,
  initialSettings,
  generateQuestions,
  setQuestions,
  setUserAnswers,
  setTimeTaken,
  setQuizSettings,
  handleStartQuiz,
}) => {
  const navigate = useNavigate();

  const handleStartQuizClick = useCallback(
    (operation: Operation, selectedNumbers: number[], timeLimit: number, questionCount: number = DEFAULT_QUESTION_COUNT) => {
      setQuizSettings({ operation, selectedNumbers, timeLimit, questionCount });
      const generated = generateQuestions(operation, selectedNumbers, questionCount);
      setQuestions(generated);
      setUserAnswers(Array(generated.length).fill(''));
      setTimeTaken(0);
      navigate('/quiz', { replace: true });
    },
    [generateQuestions, navigate, setQuestions, setQuizSettings, setTimeTaken, setUserAnswers]
  );

  return (
    <div className="flex flex-col items-center w-full">
      <SelectionScreen
        onStartQuiz={handleStartQuizClick}
        initialSettings={initialSettings}
        isDarkMode={isDarkMode}
        toggleDarkMode={toggleDarkMode}
      />
      
      {/* Ad for large screens - absolute positioned */}
      <div className="absolute right-8 top-8 hidden 2xl:block">
        <MathDashAd />
      </div>
      
      {/* Ad for smaller screens - flows below content */}
      <div className="block 2xl:hidden mt-12 mb-8 w-full flex justify-center px-4">
        <MathDashAd />
      </div>
    </div>
  );
};

interface QuizScreenWrapperProps {
  questions: Question[];
  quizSettings: { timeLimit: number } | null;
  setUserAnswers: (answers: string[]) => void;
  setTimeTaken: (time: number) => void;
  handleShowResults: (answers: string[], time: number) => void;
}

const QuizScreenWrapper: React.FC<QuizScreenWrapperProps> = ({
  questions,
  quizSettings,
  setUserAnswers,
  setTimeTaken,
  handleShowResults,
}) => {
  const navigate = useNavigate();

  useEffect(() => {
    // Redirect to selection if there are no questions, e.g., on page refresh
    if (questions.length === 0) {
      navigate('/', { replace: true });
    }
  }, [questions, navigate]);


  const handleFinishQuiz = (answers: string[], time: number) => {
    setUserAnswers(answers);
    setTimeTaken(time);
    handleShowResults(answers, time);
    navigate('/results', { replace: true });
  };

  if (questions.length === 0) {
    return null; // or a loading indicator
  }

  return (
    <QuizScreen
      questions={questions}
      timeLimit={quizSettings?.timeLimit || 0}
      onFinishQuiz={handleFinishQuiz}
    />
  );
};


const ResultsScreenWrapper: React.FC<{
    questions: Question[];
    userAnswers: string[];
    timeTaken: number;
    quizSettings: any;
    handleRestart: () => void;
}> = ({ questions, userAnswers, timeTaken, quizSettings, handleRestart }) => {
    const navigate = useNavigate();

    const handleRestartClick = () => {
        handleRestart();
        navigate('/', { replace: true });
    };
    
    useEffect(() => {
        // Redirect if no questions are available (e.g., page refresh on results)
        if (questions.length === 0) {
            navigate('/', { replace: true });
        }
    }, [questions, navigate]);

    if (questions.length === 0 || !quizSettings) {
        return null; // Or a loading/redirecting indicator
    }

    return (
        <ResultsScreen
            questions={questions}
            userAnswers={userAnswers}
            timeTaken={timeTaken}
            onRestart={handleRestartClick}
            quizSettings={quizSettings}
        />
    );
};


export default App;
