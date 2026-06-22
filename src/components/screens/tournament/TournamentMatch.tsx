import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Operation, Question } from '@shared/types';
import { useTournamentContext } from '../../../contexts/TournamentContext';
import { getPusherClient } from '../../../lib/multiplayer';
import { fetchTournament, submitMatch, updateMatchProgress } from '../../../lib/tournament';
import { Confetti } from '../../ui/Confetti';
import { CheckCircleIcon, XCircleIcon } from '../../ui/icons';
import { playWinSound } from '../../../lib/audio';

function getOperationSymbol(op: Operation): string {
  switch (op) {
    case 'multiplication':
      return '×';
    case 'division':
      return '÷';
    case 'squares':
      return '²';
    case 'square-roots':
      return '√';
    case 'negative-numbers':
      return '±';
    default:
      return '?';
  }
}

function calculateScore(questions: Question[], userAnswers: string[]): number {
  return questions.reduce((score, q, i) => {
    const userAnswer = userAnswers[i]?.trim();
    const correctAnswer = String(q.answer);
    if (userAnswer === correctAnswer) return score + 1;
    if (q.operation === 'fraction-to-percent' && userAnswer === correctAnswer.replace('%', '')) {
      return score + 1;
    }
    return score;
  }, 0);
}

/**
 * 1v1 bracket-match runner. Plays the round's shared question set, relays live
 * progress to the opponent on `tmatch-${matchId}`, submits, then shows the
 * win/loss result once both players finish (resolved server-side).
 */
export const TournamentMatch: React.FC = () => {
  const navigate = useNavigate();
  const { tournament, participantId, myMatchId, myQuestions, clearMyMatch, setTournament } =
    useTournamentContext();

  const match = tournament?.matches.find(m => m.id === myMatchId) ?? null;
  const questions = myQuestions;

  // A player's "side" is themselves (individual) or their team (teams).
  const isTeams = tournament?.format === 'teams';
  const mySideId = tournament
    ? isTeams
      ? tournament.teams.find(t => t.memberIds.includes(participantId))?.teamId ?? null
      : participantId
    : null;
  const opponentId = match && mySideId ? (match.p1Id === mySideId ? match.p2Id : match.p1Id) : null;
  const opponentName = useMemo(() => {
    if (!tournament || !opponentId) return 'Opponent';
    if (tournament.format === 'teams') {
      return tournament.teams.find(t => t.teamId === opponentId)?.name ?? 'Opponent';
    }
    return tournament.participants.find(p => p.participantId === opponentId)?.name ?? 'Opponent';
  }, [tournament, opponentId]);
  const timeLimit = match?.roundSettings?.timeLimit ?? tournament?.settings.timeLimit ?? 0;

  const [answers, setAnswers] = useState<string[]>(() => Array(questions.length).fill(''));
  const [elapsed, setElapsed] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [opponentProgress, setOpponentProgress] = useState(0);
  const [opponentDone, setOpponentDone] = useState(false);
  const [celebrate, setCelebrate] = useState(false);

  const answersRef = useRef(answers);
  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);
  const submittedRef = useRef(submitted);
  useEffect(() => {
    submittedRef.current = submitted;
  }, [submitted]);
  const lastSentRef = useRef(0);
  const submitRef = useRef<() => void>(() => {});
  const celebratedRef = useRef(false);
  const refetchedRef = useRef(false);

  const resolved = match?.state === 'finished';
  const didWin = resolved && match?.winnerId === mySideId;

  const handleSubmit = async () => {
    if (submitted || !tournament || !match) return;
    setSubmitted(true);
    const score = calculateScore(questions, answersRef.current);
    await submitMatch(tournament.id, match.id, participantId, answersRef.current, score);
  };
  useEffect(() => {
    submitRef.current = handleSubmit;
  });

  // Elapsed-time ticker.
  useEffect(() => {
    if (submitted) return;
    const id = window.setInterval(() => setElapsed(e => e + 1), 1000);
    return () => window.clearInterval(id);
  }, [submitted]);

  // Auto-submit when the time limit is reached (async callback, not a sync effect set).
  useEffect(() => {
    if (timeLimit <= 0) return;
    const id = window.setTimeout(() => submitRef.current(), timeLimit * 1000);
    return () => window.clearTimeout(id);
  }, [timeLimit]);

  // Opponent's live progress on the per-match channel.
  useEffect(() => {
    if (!match) return;
    const pusher = getPusherClient();
    const channel = pusher.subscribe(`tmatch-${match.id}`);
    const onProgress = (data: { participantId: string; currentQuestion: number }) => {
      if (data.participantId !== participantId) setOpponentProgress(data.currentQuestion);
    };
    const onFinished = (data: { participantId: string }) => {
      if (data.participantId !== participantId) setOpponentDone(true);
    };
    channel.bind('match-progress', onProgress);
    channel.bind('match-opponent-finished', onFinished);
    return () => {
      channel.unbind('match-progress', onProgress);
      channel.unbind('match-opponent-finished', onFinished);
      pusher.unsubscribe(`tmatch-${match.id}`);
    };
  }, [match, participantId]);

  // Anti-cheat / disconnect handling: switching away from the tab locks in your
  // current answers (you can't keep solving while hidden), and closing the tab
  // forfeits via a beacon so your opponent isn't left waiting forever.
  useEffect(() => {
    if (!tournament || !match) return;
    const onVisibility = () => {
      if (document.hidden && !submittedRef.current) submitRef.current();
    };
    const onUnload = () => {
      if (submittedRef.current) return;
      const payload = {
        action: 'submit-match',
        tournamentId: tournament.id,
        matchId: match.id,
        participantId,
        answers: answersRef.current,
        score: calculateScore(questions, answersRef.current),
      };
      navigator.sendBeacon(
        '/api/tournament',
        new Blob([JSON.stringify(payload)], { type: 'application/json' })
      );
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('beforeunload', onUnload);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('beforeunload', onUnload);
    };
  }, [tournament, match, participantId, questions]);

  // Celebrate a win once the match resolves (sound + confetti), mirroring the
  // multiplayer results screen.
  useEffect(() => {
    if (!resolved || !didWin || celebratedRef.current) return;
    celebratedRef.current = true;
    playWinSound();
    setCelebrate(true);
    const t = window.setTimeout(() => setCelebrate(false), 6500);
    return () => window.clearTimeout(t);
  }, [resolved, didWin]);

  // When the match resolves, pull the full snapshot so the scoreboard shows both
  // sides' scores + finish times (the match-finished event carries only winnerId).
  useEffect(() => {
    if (!resolved || !tournament || refetchedRef.current) return;
    refetchedRef.current = true;
    void fetchTournament(tournament.id).then(snap => {
      if (snap) setTournament(snap.tournament);
    });
  }, [resolved, tournament, setTournament]);

  if (!tournament || !match || questions.length === 0) {
    return (
      <div className="w-full p-6 text-center">
        <button
          onClick={() => navigate('/tournament/bracket')}
          className="btn3d btn3d--neutral px-6 py-3"
        >
          Back to Bracket
        </button>
      </div>
    );
  }

  const handleAnswerChange = (index: number, value: string) => {
    setAnswers(prev => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
    const filled = answersRef.current.filter((a, i) => (i === index ? value.trim() : a.trim()) !== '').length;
    if (filled > lastSentRef.current) {
      lastSentRef.current = filled;
      void updateMatchProgress(tournament.id, match.id, participantId, filled);
    }
  };

  const answeredCount = answers.filter(a => a.trim() !== '').length;
  const remaining = timeLimit > 0 ? Math.max(0, timeLimit - elapsed) : null;

  // Result screen — full head-to-head scoreboard + your answer review, then a
  // way back to the bracket (mirrors the multiplayer results experience).
  if (resolved) {
    const iAmP1 = match.p1Id === mySideId;
    const myScore = (iAmP1 ? match.p1Score : match.p2Score) ?? 0;
    const oppScore = (iAmP1 ? match.p2Score : match.p1Score) ?? 0;
    const myFinishMs = iAmP1 ? match.p1FinishMs : match.p2FinishMs;
    const oppFinishMs = iAmP1 ? match.p2FinishMs : match.p1FinishMs;
    const mySideName = isTeams
      ? tournament.teams.find(t => t.teamId === mySideId)?.name ?? 'Your team'
      : tournament.participants.find(p => p.participantId === participantId)?.name ?? 'You';

    const fmtTime = (ms: number | null | undefined): string => {
      if (ms == null) return '—';
      const s = ms / 1000;
      return s < 60 ? `${s.toFixed(1)}s` : `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
    };
    const formatQ = (q: Question): string => {
      if (q.display) return q.display;
      if (q.operation === 'squares') return `${q.num1}²`;
      if (q.operation === 'square-roots') return `√${q.num1}`;
      return `${q.num1} ${getOperationSymbol(q.operation)} ${q.num2}`;
    };
    const isAnswerCorrect = (q: Question, raw: string): boolean => {
      const u = raw.trim();
      const c = String(q.answer);
      if (u === c) return true;
      if (q.operation === 'fraction-to-percent' && u === c.replace('%', '')) return true;
      return false;
    };

    const scoreRows = [
      { name: mySideName, you: true, score: myScore, finishMs: myFinishMs, winner: didWin },
      {
        name: opponentName,
        you: false,
        score: oppScore,
        finishMs: oppFinishMs,
        winner: !!opponentId && match.winnerId === opponentId,
      },
    ].sort((a, b) => Number(b.winner) - Number(a.winner));

    return (
      <div className="w-full p-2 md:p-4">
        {celebrate && <Confetti />}
        <div className="max-w-2xl mx-auto game-panel p-6 md:p-8 animate-fade-in">
          {/* Headline */}
          <div className="text-center mb-6">
            <div className="text-6xl mb-2">{didWin ? '🏆' : '😔'}</div>
            <h1 className="font-display text-3xl font-bold mb-1 text-slate-800 dark:text-white">
              {didWin ? (isTeams ? 'Your Team Won!' : 'You Won!') : isTeams ? 'Your Team Lost' : 'You Lost'}
            </h1>
            <p className="text-slate-500 dark:text-slate-400">
              {didWin
                ? `On to the next round — ${isTeams ? 'your team beat' : 'you beat'} ${opponentName}.`
                : `${opponentName} edged ${isTeams ? 'your team' : 'you'} out. Thanks for playing!`}
            </p>
          </div>

          {/* Head-to-head scoreboard */}
          <div className="space-y-2 mb-6">
            {scoreRows.map((r, i) => (
              <div
                key={i}
                className={`flex items-center gap-3 rounded-2xl border-2 px-4 py-3 ${
                  r.winner
                    ? 'border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/20'
                    : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50'
                }`}
              >
                <span className="text-2xl" aria-hidden="true">{r.winner ? '🥇' : '🥈'}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-display font-bold truncate text-slate-800 dark:text-white">
                      {r.name}
                    </span>
                    {r.you && (
                      <span className="text-xs font-semibold text-violet-500 dark:text-violet-400">You</span>
                    )}
                  </div>
                  <div className="text-xs text-slate-400">Finished in {fmtTime(r.finishMs)}</div>
                </div>
                <div className="text-right">
                  <div
                    className={`font-display text-2xl font-bold tabular-nums ${
                      r.winner ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-300'
                    }`}
                  >
                    {r.score}
                  </div>
                  <div className="text-[10px] uppercase tracking-wide text-slate-400">
                    {isTeams ? 'team pts' : 'correct'}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Your answer review (only when you actually played this match) */}
          {submitted && (
            <div className="mb-6">
              <h3 className="font-display text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-3">
                Your answers
                {isTeams && (
                  <span className="ml-2 normal-case font-normal text-violet-500 dark:text-violet-400">
                    (added to your team total)
                  </span>
                )}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {questions.map((q, i) => {
                  const raw = answers[i] ?? '';
                  const ok = isAnswerCorrect(q, raw);
                  return (
                    <div
                      key={i}
                      className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm ${
                        ok
                          ? 'border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/60 dark:bg-emerald-900/15'
                          : 'border-rose-200 dark:border-rose-800/60 bg-rose-50/60 dark:bg-rose-900/15'
                      }`}
                    >
                      {ok ? (
                        <CheckCircleIcon className="w-5 h-5 shrink-0 text-emerald-500" />
                      ) : (
                        <XCircleIcon className="w-5 h-5 shrink-0 text-rose-500" />
                      )}
                      <span className="font-display font-semibold text-slate-700 dark:text-slate-200">
                        {formatQ(q)}
                      </span>
                      <span className="text-slate-400">=</span>
                      <span
                        className={`font-bold ${
                          ok
                            ? 'text-emerald-700 dark:text-emerald-300'
                            : 'text-rose-600 dark:text-rose-300 line-through'
                        }`}
                      >
                        {raw.trim() || '—'}
                      </span>
                      {!ok && (
                        <span className="ml-auto text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                          {String(q.answer)}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <button
            onClick={() => {
              clearMyMatch();
              navigate('/tournament/bracket');
            }}
            className="btn3d btn3d--primary w-full py-3"
          >
            ← Back to Bracket
          </button>
        </div>
      </div>
    );
  }

  // Submitted, waiting for opponent.
  if (submitted) {
    return (
      <div className="w-full p-2 md:p-4">
        <div className="max-w-md mx-auto game-panel p-8 text-center animate-fade-in">
          <div className="text-5xl mb-3">⏳</div>
          <h1 className="font-display text-2xl font-bold mb-2 text-slate-800 dark:text-white">
            Answers submitted!
          </h1>
          <p className="text-slate-500 dark:text-slate-400">
            {opponentDone
              ? 'Calculating the result…'
              : `Waiting for ${opponentName} to finish…`}
          </p>
        </div>
      </div>
    );
  }

  // Active quiz.
  const usesDisplay =
    questions[0]?.operation === 'fraction-to-decimal' ||
    questions[0]?.operation === 'decimal-to-fraction' ||
    questions[0]?.operation === 'fraction-to-percent' ||
    questions[0]?.operation === 'percent-to-fraction' ||
    questions[0]?.operation === 'negative-numbers';

  return (
    <div className="w-full p-2 md:p-4">
      <div className="max-w-4xl mx-auto game-panel p-6 md:p-8 animate-fade-in">
        <div className="flex items-center justify-between mb-2">
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-gradient">Your Match</h1>
          {remaining !== null && (
            <span
              className={`font-display text-xl font-bold tabular-nums ${
                remaining <= 10 ? 'text-rose-500 animate-pulse' : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              ⏱ {remaining}s
            </span>
          )}
        </div>
        <p className="text-center text-slate-500 dark:text-slate-400 mb-4">
          vs <span className="font-semibold">{opponentName}</span>
        </p>
        {isTeams && (
          <p className="text-center text-xs text-violet-500 dark:text-violet-400 -mt-3 mb-4">
            Team match — your score adds to your team&apos;s total.
          </p>
        )}

        {/* Opponent progress */}
        <div className="mb-5">
          <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
            <span>{opponentName}{opponentDone ? ' — finished ✓' : ''}</span>
            <span>
              {opponentProgress}/{questions.length}
            </span>
          </div>
          <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-fuchsia-500 to-purple-600 transition-all"
              style={{ width: `${(opponentProgress / questions.length) * 100}%` }}
            />
          </div>
        </div>

        <form
          onSubmit={e => {
            e.preventDefault();
            void handleSubmit();
          }}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3.5">
            {questions.map((q, index) => {
              const isFilled = answers[index]?.trim() !== '';
              return (
                <div
                  key={index}
                  className={`flex items-center gap-3 p-3 sm:p-3.5 rounded-2xl border transition-all bg-slate-50 dark:bg-slate-800/50 ${
                    isFilled
                      ? 'border-violet-300 dark:border-violet-700/70'
                      : 'border-slate-200 dark:border-slate-700/50'
                  }`}
                >
                  <span
                    className={`grid place-items-center w-7 h-7 shrink-0 rounded-lg font-display font-bold text-sm ${
                      isFilled
                        ? 'bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white'
                        : 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {index + 1}
                  </span>
                  <div className="flex items-center gap-2 text-2xl font-display font-bold text-slate-700 dark:text-slate-200 w-full">
                    <span className="min-w-[3.5rem] text-right whitespace-nowrap">
                      {usesDisplay ? (
                        q.display
                      ) : q.operation === 'square-roots' ? (
                        <span>
                          {getOperationSymbol(q.operation)}
                          {q.num1}
                        </span>
                      ) : q.operation === 'squares' ? (
                        <span>
                          {q.num1}
                          <sup>2</sup>
                        </span>
                      ) : (
                        <span>
                          {q.num1}
                          <span className="mx-1.5 text-violet-500 dark:text-violet-400">
                            {getOperationSymbol(q.operation)}
                          </span>
                          {q.num2}
                        </span>
                      )}
                    </span>
                    <span className="text-violet-500 dark:text-violet-400">=</span>
                    <input
                      type="text"
                      inputMode="text"
                      value={answers[index]}
                      onChange={e => handleAnswerChange(index, e.target.value)}
                      className="w-24 shrink-0 p-2 text-center text-2xl font-display font-bold border-2 border-slate-300 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-violet-500 focus:border-violet-500 bg-white dark:bg-slate-900 text-slate-800 dark:text-white"
                      maxLength={7}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-8 text-center">
            <button type="submit" className="btn3d btn3d--success px-10 py-4 text-xl">
              Submit ({answeredCount}/{questions.length})
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
