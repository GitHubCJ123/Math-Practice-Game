import React, { useState, useCallback, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useNavigate, useLocation, useParams } from 'react-router-dom';
import type { Operation, Question, MultiplayerResult, Team, GameMode, TeamResult, Player } from '../types';
import { DEFAULT_QUESTION_COUNT } from '../types';
import { SelectionScreen } from './components/screens/SelectionScreen';
import { QuizScreen } from './components/screens/QuizScreen';
import { ResultsScreen } from './components/screens/ResultsScreen';
import { MultiplayerLobbyScreen } from './components/screens/MultiplayerLobbyScreen';
import { MultiplayerQuizScreen } from './components/screens/MultiplayerQuizScreen';
import { MultiplayerResultsScreen } from './components/screens/MultiplayerResultsScreen';
import { MathDashAd } from './components/ui/MathDashAd';
import { FeedbackButton } from './components/ui/FeedbackButton';
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

  // Multiplayer state
  const [multiplayerRoomId, setMultiplayerRoomId] = useState<string | null>(null);
  const [multiplayerPlayerId, setMultiplayerPlayerId] = useState<string>('');
  const [multiplayerPlayerName, setMultiplayerPlayerName] = useState<string>('');
  const [multiplayerQuestions, setMultiplayerQuestions] = useState<Question[]>([]);
  const [multiplayerPlayers, setMultiplayerPlayers] = useState<Player[]>([]);
  const [multiplayerTeams, setMultiplayerTeams] = useState<Team[]>([]);
  const [multiplayerGameMode, setMultiplayerGameMode] = useState<GameMode>('ffa');
  const [multiplayerIsHost, setMultiplayerIsHost] = useState(false);
  const [multiplayerResults, setMultiplayerResults] = useState<MultiplayerResult[]>([]);
  const [multiplayerTeamResults, setMultiplayerTeamResults] = useState<TeamResult[]>([]);
  const [multiplayerTimeLimit, setMultiplayerTimeLimit] = useState(0);
  const [rematchData, setRematchData] = useState<{
    roomId: string;
    roomCode: string;
    isQuickMatch: boolean;
    players: Player[];
    settings: any;
    teams: Team[];
  } | null>(null);

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
      } else if (operation === 'square-roots') {
        question = {
          num1: baseNum * baseNum,
          operation,
          answer: baseNum,
        };
        questionKey = `sqrt(${baseNum*baseNum})`;
      } else { // negative-numbers
        // Pick a second number from selected numbers
        const secondNum = selectedNumbers[Math.floor(Math.random() * selectedNumbers.length)];
        
        // Problem types that ensure at least one negative is involved:
        // 0: negative + positive (e.g., -5 + 3)
        // 1: positive + negative (e.g., 5 + (-3))
        // 2: negative + negative (e.g., -5 + (-3))
        // 3: negative - positive (e.g., -5 - 3)
        // 4: positive - negative (e.g., 5 - (-3))
        // 5: negative - negative (e.g., -5 - (-3))
        // 6: positive - larger positive (e.g., 3 - 7 = -4)
        const problemType = Math.floor(Math.random() * 7);
        
        let operand1: number;
        let operand2: number;
        let isAddition: boolean;
        
        switch (problemType) {
          case 0: // negative + positive
            operand1 = -baseNum;
            operand2 = secondNum;
            isAddition = true;
            break;
          case 1: // positive + negative
            operand1 = baseNum;
            operand2 = -secondNum;
            isAddition = true;
            break;
          case 2: // negative + negative
            operand1 = -baseNum;
            operand2 = -secondNum;
            isAddition = true;
            break;
          case 3: // negative - positive
            operand1 = -baseNum;
            operand2 = secondNum;
            isAddition = false;
            break;
          case 4: // positive - negative
            operand1 = baseNum;
            operand2 = -secondNum;
            isAddition = false;
            break;
          case 5: // negative - negative
            operand1 = -baseNum;
            operand2 = -secondNum;
            isAddition = false;
            break;
          default: // positive - larger positive (ensures negative result)
            operand1 = Math.min(baseNum, secondNum);
            operand2 = Math.max(baseNum, secondNum);
            // Only use this type if they're different, otherwise fall back
            if (operand1 === operand2) {
              operand1 = -baseNum;
              operand2 = secondNum;
            }
            isAddition = false;
            break;
        }
        
        let answer: number;
        let displayString: string;
        
        if (isAddition) {
          answer = operand1 + operand2;
          // Format: "a + b" or "a + (-b)"
          if (operand2 >= 0) {
            displayString = `${operand1} + ${operand2}`;
          } else {
            displayString = `${operand1} + (${operand2})`;
          }
        } else {
          answer = operand1 - operand2;
          // Format: "a - b" or "a - (-b)"
          if (operand2 >= 0) {
            displayString = `${operand1} - ${operand2}`;
          } else {
            displayString = `${operand1} - (${operand2})`;
          }
        }
        
        question = {
          num1: operand1,
          num2: operand2,
          operation,
          answer,
          display: displayString,
        };
        questionKey = displayString;
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

  // Multiplayer handlers
  const handleMultiplayerGameStart = useCallback(
    (roomId: string, odId: string, odName: string, mpQuestions: Question[], isHost: boolean, players: Player[], teams: Team[], gameMode: GameMode, timeLimit: number = 0) => {
      setMultiplayerRoomId(roomId);
      setMultiplayerPlayerId(odId);
      setMultiplayerPlayerName(odName);
      setMultiplayerQuestions(mpQuestions);
      setMultiplayerIsHost(isHost);
      setMultiplayerPlayers(players);
      setMultiplayerTeams(teams);
      setMultiplayerGameMode(gameMode);
      setMultiplayerTimeLimit(timeLimit);
      setMultiplayerResults([]);
      setMultiplayerTeamResults([]);
    },
    []
  );

  const handleMultiplayerFinish = useCallback((results: MultiplayerResult[], teamResults?: TeamResult[]) => {
    setMultiplayerResults(results);
    if (teamResults) {
      setMultiplayerTeamResults(teamResults);
    }
  }, []);

  const handleMultiplayerRematch = useCallback((data: { newRoomId: string; newRoomCode: string; isQuickMatch: boolean; players: any[]; settings: any; teams: Team[] }) => {
    // Set rematch state so the lobby knows to show the ready screen
    setRematchData({
      roomId: data.newRoomId,
      roomCode: data.newRoomCode,
      isQuickMatch: data.isQuickMatch,
      players: data.players,
      settings: data.settings,
      teams: data.teams || [],
    });
    setMultiplayerRoomId(data.newRoomId);
    setMultiplayerQuestions([]);
    setMultiplayerResults([]);
    setMultiplayerTeamResults([]);
  }, []);

  const handleMultiplayerExit = useCallback(() => {
    setMultiplayerRoomId(null);
    setMultiplayerQuestions([]);
    setMultiplayerResults([]);
    setMultiplayerTeamResults([]);
    setMultiplayerPlayers([]);
    setMultiplayerTeams([]);
    setMultiplayerGameMode('ffa');
  }, []);

  return (
    <BrowserRouter>
      <RouteChangeTracker />
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
            {/* Multiplayer Routes */}
            <Route
              path="/multiplayer"
              element={
                <MultiplayerLobbyWrapper
                  isDarkMode={isDarkMode}
                  toggleDarkMode={toggleDarkMode}
                  onGameStart={handleMultiplayerGameStart}
                  rematchData={rematchData}
                  onRematchConsumed={() => setRematchData(null)}
                />
              }
            />
            <Route
              path="/join/:roomCode"
              element={
                <MultiplayerLobbyWrapper
                  isDarkMode={isDarkMode}
                  toggleDarkMode={toggleDarkMode}
                  onGameStart={handleMultiplayerGameStart}
                  rematchData={null}
                  onRematchConsumed={() => {}}
                />
              }
            />
            <Route
              path="/multiplayer/quiz"
              element={
                <MultiplayerQuizWrapper
                  roomId={multiplayerRoomId}
                  odId={multiplayerPlayerId}
                  odName={multiplayerPlayerName}
                  questions={multiplayerQuestions}
                  timeLimit={multiplayerTimeLimit}
                  players={multiplayerPlayers}
                  teams={multiplayerTeams}
                  gameMode={multiplayerGameMode}
                  onFinish={handleMultiplayerFinish}
                />
              }
            />
            <Route
              path="/multiplayer/results"
              element={
                <MultiplayerResultsWrapper
                  roomId={multiplayerRoomId}
                  odId={multiplayerPlayerId}
                  odName={multiplayerPlayerName}
                  results={multiplayerResults}
                  teams={multiplayerTeams}
                  gameMode={multiplayerGameMode}
                  teamResults={multiplayerTeamResults}
                  players={multiplayerPlayers}
                  onRematch={handleMultiplayerRematch}
                  onExit={handleMultiplayerExit}
                />
              }
            />
          </Routes>
        </main>
        
        <Analytics />
        <SpeedInsights />
        <FeedbackButtonConditional />
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

// Only show feedback button on home screen (not during quizzes or results)
const FeedbackButtonConditional: React.FC = () => {
  const location = useLocation();
  const isHomeScreen = location.pathname === '/';
  
  if (!isHomeScreen) return null;
  return <FeedbackButton />;
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
      
      {/* Ad for large screens - absolute positioned, centered in right gap */}
      <div className="absolute right-0 top-8 hidden 2xl:flex 2xl:items-center 2xl:justify-center" style={{ width: 'calc((100vw - 896px) / 2)' }}>
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

// Multiplayer Wrappers
interface MultiplayerLobbyWrapperProps {
  isDarkMode: boolean;
  toggleDarkMode: () => void;
  onGameStart: (roomId: string, odId: string, odName: string, questions: Question[], isHost: boolean, players: Player[], teams: Team[], gameMode: GameMode, timeLimit?: number) => void;
  rematchData: {
    roomId: string;
    roomCode: string;
    isQuickMatch: boolean;
    players: any[];
    settings: any;
    teams: Team[];
  } | null;
  onRematchConsumed: () => void;
}

const MultiplayerLobbyWrapper: React.FC<MultiplayerLobbyWrapperProps> = ({
  isDarkMode,
  toggleDarkMode,
  onGameStart,
  rematchData,
  onRematchConsumed,
}) => {
  const navigate = useNavigate();

  const handleGameStart = (
    roomId: string,
    odId: string,
    odName: string,
    questions: Question[],
    isHost: boolean,
    players: Player[],
    teams: Team[],
    gameMode: GameMode,
    timeLimit?: number
  ) => {
    onGameStart(roomId, odId, odName, questions, isHost, players, teams, gameMode, timeLimit);
    navigate('/multiplayer/quiz', { replace: true });
  };

  // If coming from rematch, navigate is already happening via the results screen
  useEffect(() => {
    if (rematchData) {
      // Navigate to /multiplayer so the lobby picks up the rematch data
      navigate('/multiplayer', { replace: true });
    }
  }, [rematchData, navigate]);

  const location = useLocation();

  return (
    <MultiplayerLobbyScreen
      key={location.search} // Force remount when query params change
      isDarkMode={isDarkMode}
      toggleDarkMode={toggleDarkMode}
      onGameStart={handleGameStart}
      rematchData={rematchData}
      onRematchConsumed={onRematchConsumed}
    />
  );
};

interface MultiplayerQuizWrapperProps {
  roomId: string | null;
  odId: string;
  odName: string;
  questions: Question[];
  timeLimit: number;
  players: Player[];
  teams: Team[];
  gameMode: GameMode;
  onFinish: (results: MultiplayerResult[], teamResults?: TeamResult[]) => void;
}

const MultiplayerQuizWrapper: React.FC<MultiplayerQuizWrapperProps> = ({
  roomId,
  odId,
  odName,
  questions,
  timeLimit,
  players,
  teams,
  gameMode,
  onFinish,
}) => {
  const navigate = useNavigate();

  useEffect(() => {
    if (!roomId || questions.length === 0 || players.length === 0) {
      navigate('/multiplayer', { replace: true });
    }
  }, [roomId, questions, players, navigate]);

  const handleFinish = (results: MultiplayerResult[], teamResults?: TeamResult[]) => {
    onFinish(results, teamResults);
    navigate('/multiplayer/results', { replace: true });
  };

  if (!roomId || questions.length === 0 || players.length === 0) {
    return null;
  }

  return (
    <MultiplayerQuizScreen
      roomId={roomId}
      odId={odId}
      odName={odName}
      questions={questions}
      timeLimit={timeLimit}
      players={players}
      teams={teams}
      gameMode={gameMode}
      onFinish={handleFinish}
    />
  );
};

interface MultiplayerResultsWrapperProps {
  roomId: string | null;
  odId: string;
  odName: string;
  results: MultiplayerResult[];
  teams: Team[];
  gameMode: GameMode;
  teamResults?: TeamResult[];
  players: Player[];
  onRematch: (data: { newRoomId: string; newRoomCode: string; isQuickMatch: boolean; players: any[]; settings: any; teams: Team[] }) => void;
  onExit: () => void;
}

const MultiplayerResultsWrapper: React.FC<MultiplayerResultsWrapperProps> = ({
  roomId,
  odId,
  odName,
  results,
  teams,
  gameMode,
  teamResults,
  players,
  onRematch,
  onExit,
}) => {
  const navigate = useNavigate();

  useEffect(() => {
    if (!roomId || results.length === 0) {
      navigate('/multiplayer', { replace: true });
    }
  }, [roomId, results, navigate]);

  const handleRematch = (data: { newRoomId: string; newRoomCode: string; isQuickMatch: boolean; players: any[]; settings: any; teams: Team[] }) => {
    onRematch(data);
    navigate('/multiplayer', { replace: true });
  };

  const handlePlayAgainAI = () => {
    onExit();
    navigate('/multiplayer?tab=aimode', { replace: true });
  };

  const handleExit = () => {
    onExit();
    navigate('/', { replace: true });
  };

  if (!roomId || results.length === 0) {
    return null;
  }

  return (
    <MultiplayerResultsScreen
      roomId={roomId}
      odId={odId}
      odName={odName}
      results={results}
      teams={teams}
      gameMode={gameMode}
      teamResults={teamResults}
      players={players}
      onRematch={handleRematch}
      onPlayAgainAI={handlePlayAgainAI}
      onExit={handleExit}
    />
  );
};


export default App;
