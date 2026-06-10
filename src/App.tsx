import React, { useCallback, useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import type {
  GameMode,
  MultiplayerResult,
  Operation,
  Player,
  Question,
  RematchPayload,
  Team,
  TeamResult,
} from '@shared/types';
import { DEFAULT_QUESTION_COUNT } from '@shared/types';
import { SelectionScreen } from './components/screens/SelectionScreen';
import { QuizScreen } from './components/screens/QuizScreen';
import { ResultsScreen } from './components/screens/ResultsScreen';
import { MultiplayerLobbyScreen } from './components/screens/multiplayer-lobby';
import { MultiplayerQuizScreen } from './components/screens/MultiplayerQuizScreen';
import { MultiplayerResultsScreen } from './components/screens/MultiplayerResultsScreen';
import { MathDashAd } from './components/ui/MathDashAd';
import { FeedbackButton } from './components/ui/FeedbackButton';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { trackPageView } from './lib/ga';
import { generateQuestions } from '@shared/questions';
import { ThemeProvider, useThemeContext } from './contexts/ThemeContext';
import { MultiplayerProvider, useMultiplayerContext } from './contexts/MultiplayerContext';

interface QuizSettings {
  operation: Operation;
  selectedNumbers: number[];
  timeLimit: number;
  questionCount: number;
}

const App: React.FC = () => {
  return (
    <ThemeProvider>
      <MultiplayerProvider>
        <BrowserRouter>
          <RouteChangeTracker />
          <AppShell />
        </BrowserRouter>
      </MultiplayerProvider>
    </ThemeProvider>
  );
};

const AppShell: React.FC = () => {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [userAnswers, setUserAnswers] = useState<string[]>([]);
  const [timeTaken, setTimeTaken] = useState(0);
  const [quizSettings, setQuizSettings] = useState<QuizSettings | null>(null);

  const handleStartQuiz = useCallback(
    (operation: Operation, selectedNumbers: number[], timeLimit: number, questionCount: number = DEFAULT_QUESTION_COUNT) => {
      setQuizSettings({ operation, selectedNumbers, timeLimit, questionCount });
      const generated = generateQuestions(operation, selectedNumbers, questionCount);
      setQuestions(generated);
      setUserAnswers(Array(generated.length).fill(''));
      setTimeTaken(0);
    },
    []
  );

  const handleShowResults = useCallback((answers: string[], time: number) => {
    setUserAnswers(answers);
    setTimeTaken(time);
  }, []);

  // Test hook for E2E suites; gated to test mode only.
  useEffect(() => {
    if (import.meta.env.VITE_NODE_ENV !== 'test') return;
    window.onFinishQuiz = (answers: string[], time: number) => {
      setQuestions(prev => {
        if (prev.length > 0) return prev;
        const defaults: Operation = 'multiplication';
        const nums = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
        setQuizSettings({ operation: defaults, selectedNumbers: nums, timeLimit: 0, questionCount: DEFAULT_QUESTION_COUNT });
        return generateQuestions(defaults, nums, DEFAULT_QUESTION_COUNT);
      });
      handleShowResults(answers, time);
      setTimeout(() => {
        window.location.pathname = '/results';
      }, 100);
    };
    return () => {
      delete window.onFinishQuiz;
    };
  }, [handleShowResults]);

  return (
    <div className="arcade-bg min-h-screen flex flex-col items-center justify-center p-4 transition-colors duration-300 relative overflow-x-hidden">
      <BackdropDecor />
      <main className="w-full flex justify-center">
        <Routes>
          <Route
            path="/"
            element={
              <SelectionScreenWrapper
                initialSettings={quizSettings}
                onStartQuiz={handleStartQuiz}
              />
            }
          />
          <Route
            path="/quiz"
            element={
              <QuizScreenWrapper
                questions={questions}
                quizSettings={quizSettings}
                onShowResults={handleShowResults}
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
              />
            }
          />
          <Route path="/multiplayer" element={<MultiplayerLobbyRoute />} />
          <Route path="/join/:roomCode" element={<MultiplayerLobbyRoute />} />
          <Route path="/multiplayer/quiz" element={<MultiplayerQuizRoute />} />
          <Route path="/multiplayer/results" element={<MultiplayerResultsRoute />} />
        </Routes>
      </main>

      <Analytics />
      <SpeedInsights />
      <FeedbackButtonConditional />
    </div>
  );
};

const RouteChangeTracker: React.FC = () => {
  const location = useLocation();
  useEffect(() => {
    trackPageView(location.pathname + location.search);
  }, [location.pathname, location.search]);
  return null;
};

/**
 * Purely decorative floating math glyphs rendered behind all content. Fixed,
 * pointer-events-none, and aria-hidden so they never interfere with the UI.
 */
const BackdropDecor: React.FC = () => {
  const glyphs = [
    { ch: '+', top: '12%', left: '8%', size: '3.5rem', delay: '0s' },
    { ch: '×', top: '22%', left: '86%', size: '4rem', delay: '1.2s' },
    { ch: '÷', top: '70%', left: '6%', size: '3rem', delay: '0.6s' },
    { ch: '√', top: '80%', left: '90%', size: '3.6rem', delay: '1.8s' },
    { ch: '=', top: '46%', left: '94%', size: '2.6rem', delay: '2.4s' },
    { ch: '−', top: '60%', left: '14%', size: '3rem', delay: '3s' },
    { ch: '%', top: '8%', left: '54%', size: '2.4rem', delay: '0.9s' },
  ];
  return (
    <div aria-hidden="true">
      {glyphs.map((g, i) => (
        <span
          key={i}
          className="floaty"
          style={{ top: g.top, left: g.left, fontSize: g.size, animationDelay: g.delay }}
        >
          {g.ch}
        </span>
      ))}
    </div>
  );
};

const FeedbackButtonConditional: React.FC = () => {
  const location = useLocation();
  if (location.pathname !== '/') return null;
  return <FeedbackButton />;
};

const SelectionScreenWrapper: React.FC<{
  initialSettings: QuizSettings | null;
  onStartQuiz: (operation: Operation, selectedNumbers: number[], timeLimit: number, questionCount: number) => void;
}> = ({ initialSettings, onStartQuiz }) => {
  const navigate = useNavigate();
  const { isDarkMode, toggleDarkMode } = useThemeContext();

  const handleStart = useCallback(
    (operation: Operation, selectedNumbers: number[], timeLimit: number, questionCount: number = DEFAULT_QUESTION_COUNT) => {
      onStartQuiz(operation, selectedNumbers, timeLimit, questionCount);
      navigate('/quiz', { replace: true });
    },
    [onStartQuiz, navigate]
  );

  return (
    <div className="flex flex-col items-center w-full">
      <SelectionScreen
        onStartQuiz={handleStart}
        initialSettings={initialSettings}
        isDarkMode={isDarkMode}
        toggleDarkMode={toggleDarkMode}
      />
      <div className="absolute right-0 top-8 hidden 2xl:flex 2xl:items-center 2xl:justify-center" style={{ width: 'calc((100vw - 896px) / 2)' }}>
        <MathDashAd />
      </div>
      <div className="block 2xl:hidden mt-12 mb-8 w-full flex justify-center px-4">
        <MathDashAd />
      </div>
    </div>
  );
};

const QuizScreenWrapper: React.FC<{
  questions: Question[];
  quizSettings: { timeLimit: number } | null;
  onShowResults: (answers: string[], time: number) => void;
}> = ({ questions, quizSettings, onShowResults }) => {
  const navigate = useNavigate();

  useEffect(() => {
    if (questions.length === 0) navigate('/', { replace: true });
  }, [questions, navigate]);

  const handleFinishQuiz = (answers: string[], time: number) => {
    onShowResults(answers, time);
    navigate('/results', { replace: true });
  };

  if (questions.length === 0) return null;
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
  quizSettings: QuizSettings | null;
}> = ({ questions, userAnswers, timeTaken, quizSettings }) => {
  const navigate = useNavigate();

  useEffect(() => {
    if (questions.length === 0) navigate('/', { replace: true });
  }, [questions, navigate]);

  if (questions.length === 0 || !quizSettings) return null;
  return (
    <ResultsScreen
      questions={questions}
      userAnswers={userAnswers}
      timeTaken={timeTaken}
      onRestart={() => navigate('/', { replace: true })}
      quizSettings={quizSettings}
    />
  );
};

const MultiplayerLobbyRoute: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isDarkMode, toggleDarkMode } = useThemeContext();
  const mp = useMultiplayerContext();

  const handleGameStart = (
    roomId: string,
    playerId: string,
    playerName: string,
    questions: Question[],
    isHost: boolean,
    players: Player[],
    teams: Team[],
    gameMode: GameMode,
    timeLimit?: number
  ) => {
    mp.startGame({ roomId, playerId, playerName, questions, isHost, players, teams, gameMode, timeLimit });
    navigate('/multiplayer/quiz', { replace: true });
  };

  useEffect(() => {
    if (mp.rematchData) {
      navigate('/multiplayer', { replace: true });
    }
  }, [mp.rematchData, navigate]);

  return (
    <MultiplayerLobbyScreen
      key={location.search}
      isDarkMode={isDarkMode}
      toggleDarkMode={toggleDarkMode}
      onGameStart={handleGameStart}
      rematchData={mp.rematchData}
      onRematchConsumed={mp.consumeRematch}
    />
  );
};

const MultiplayerQuizRoute: React.FC = () => {
  const navigate = useNavigate();
  const mp = useMultiplayerContext();

  useEffect(() => {
    if (!mp.roomId || mp.questions.length === 0 || mp.players.length === 0) {
      navigate('/multiplayer', { replace: true });
    }
  }, [mp.roomId, mp.questions.length, mp.players.length, navigate]);

  const handleFinish = (results: MultiplayerResult[], teamResults?: TeamResult[]) => {
    mp.finishGame(results, teamResults);
    navigate('/multiplayer/results', { replace: true });
  };

  if (!mp.roomId || mp.questions.length === 0 || mp.players.length === 0) {
    return null;
  }

  return (
    <MultiplayerQuizScreen
      roomId={mp.roomId}
      playerId={mp.playerId}
      playerName={mp.playerName}
      questions={mp.questions}
      timeLimit={mp.timeLimit}
      players={mp.players}
      teams={mp.teams}
      gameMode={mp.gameMode}
      onFinish={handleFinish}
    />
  );
};

const MultiplayerResultsRoute: React.FC = () => {
  const mp = useMultiplayerContext();
  const navigate = useNavigate();

  // Accepting a rematch calls beginRematch, which sets rematchData and clears
  // results. Navigate to the lobby so it can consume rematchData and drop into
  // the ready screen; without this we'd be stuck on "Loading results...".
  useEffect(() => {
    if (mp.rematchData) {
      navigate('/multiplayer', { replace: true });
    }
  }, [mp.rematchData, navigate]);

  const handleRematch = (data: RematchPayload) => {
    mp.beginRematch(data);
  };

  const handleExit = () => {
    mp.exitMultiplayer();
    navigate('/', { replace: true });
  };

  if (mp.rematchData) return null;

  return (
    <MultiplayerResultsScreen
      roomId={mp.roomId ?? ''}
      playerId={mp.playerId}
      playerName={mp.playerName}
      results={mp.results}
      teams={mp.teams}
      gameMode={mp.gameMode}
      teamResults={mp.teamResults}
      players={mp.players}
      onRematch={handleRematch}
      onExit={handleExit}
    />
  );
};

export default App;
