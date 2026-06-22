import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { TournamentMatch } from '@shared/types';
import { useThemeContext } from '../../../contexts/ThemeContext';
import { useTournamentContext } from '../../../contexts/TournamentContext';
import { getPusherClient } from '../../../lib/multiplayer';
import { fetchTournament } from '../../../lib/tournament';
import { LobbyHeader } from '../multiplayer-lobby/LobbyHeader';

const key = (matchId: string, participantId: string) => `${matchId}:${participantId}`;

/**
 * Organizer-only live analytics. Streams every current-round match's progress
 * (via the per-match `tmatch-${id}` channels the organizer fans in) on top of a
 * durable snapshot fetched on load, plus a round leaderboard and global stats.
 */
export const OrganizerDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { isDarkMode, toggleDarkMode } = useThemeContext();
  const { tournament } = useTournamentContext();

  const [progress, setProgress] = useState<Record<string, number>>({});
  const [finished, setFinished] = useState<Record<string, boolean>>({});

  const currentRound = tournament?.currentRound ?? 0;
  const roundMatches = useMemo(
    () =>
      (tournament?.matches ?? [])
        .filter(m => m.round === currentRound)
        .sort((a, b) => a.slot - b.slot),
    [tournament, currentRound]
  );
  const questionCount =
    tournament?.roundSettings?.[String(currentRound)]?.questionCount ??
    tournament?.settings.questionCount ??
    1;

  const tournamentId = tournament?.id;

  // Durable snapshot on load / round change (survives refresh).
  useEffect(() => {
    if (!tournamentId) return;
    let cancelled = false;
    void fetchTournament(tournamentId).then(snap => {
      if (cancelled || !snap) return;
      const p: Record<string, number> = {};
      const f: Record<string, boolean> = {};
      for (const s of snap.liveStates) {
        p[key(s.matchId, s.participantId)] = s.currentQuestion;
        if (s.finished) f[key(s.matchId, s.participantId)] = true;
      }
      setProgress(p);
      setFinished(f);
    });
    return () => {
      cancelled = true;
    };
  }, [tournamentId, currentRound]);

  // Fan in every playing match's per-match channel for live progress.
  const playingIds = useMemo(
    () => roundMatches.filter(m => m.state === 'playing').map(m => m.id),
    [roundMatches]
  );
  const playingKey = playingIds.join(',');

  useEffect(() => {
    if (playingIds.length === 0) return;
    const pusher = getPusherClient();
    const channels = playingIds.map(id => pusher.subscribe(`tmatch-${id}`));
    const onProgress = (matchId: string) => (data: { participantId: string; currentQuestion: number }) => {
      setProgress(prev => ({ ...prev, [key(matchId, data.participantId)]: data.currentQuestion }));
    };
    const onFinished = (matchId: string) => (data: { participantId: string }) => {
      setFinished(prev => ({ ...prev, [key(matchId, data.participantId)]: true }));
    };
    const handlers = playingIds.map(id => ({ id, p: onProgress(id), f: onFinished(id) }));
    channels.forEach((ch, i) => {
      ch.bind('match-progress', handlers[i].p);
      ch.bind('match-opponent-finished', handlers[i].f);
    });
    return () => {
      channels.forEach((ch, i) => {
        ch.unbind('match-progress', handlers[i].p);
        ch.unbind('match-opponent-finished', handlers[i].f);
        pusher.unsubscribe(`tmatch-${playingIds[i]}`);
      });
    };
  }, [playingKey]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!tournament) return null;

  const nameOf = (id: string | null) => {
    if (!id) return '—';
    if (tournament.format === 'teams') {
      return tournament.teams.find(t => t.teamId === id)?.name ?? 'Bye';
    }
    return tournament.participants.find(p => p.participantId === id)?.name ?? 'Bye';
  };

  const alive = tournament.participants.filter(p => p.eliminatedRound == null).length;
  const matchesDone = tournament.matches.filter(m => m.state === 'finished').length;
  const playing = roundMatches.filter(m => m.state === 'playing').length;

  // Round leaderboard from finished matches this round.
  const leaderboard = roundMatches
    .flatMap(m => [
      m.p1Id ? { id: m.p1Id, score: m.p1Score, finishMs: m.p1FinishMs } : null,
      m.p2Id ? { id: m.p2Id, score: m.p2Score, finishMs: m.p2FinishMs } : null,
    ])
    .filter((x): x is { id: string; score: number | null; finishMs: number | null } => Boolean(x && x.score != null))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || (a.finishMs ?? 0) - (b.finishMs ?? 0));

  return (
    <div className="w-full p-2 md:p-4">
      <div className="max-w-5xl mx-auto">
        <LobbyHeader
          isDarkMode={isDarkMode}
          toggleDarkMode={toggleDarkMode}
          backLabel="← Back to Bracket"
          onBack={() => navigate('/tournament/bracket')}
        />

        <div className="game-panel p-4 md:p-6 animate-fade-in">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h1 className="font-display text-xl md:text-2xl font-bold text-gradient">
              📊 {tournament.name} — Live
            </h1>
            <span className="text-sm px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
              Round {currentRound} · {tournament.status}
            </span>
          </div>

          {/* Global stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <Stat label="Still Alive" value={alive} />
            <Stat label="Matches Live" value={playing} />
            <Stat label="Matches Done" value={matchesDone} />
            <Stat label="Participants" value={tournament.participants.length} />
          </div>

          {/* Live match grid */}
          <h2 className="font-display text-lg font-bold text-slate-700 dark:text-slate-200 mb-3">
            Round {currentRound} matches
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
            {roundMatches.map(m => (
              <LiveMatchCard
                key={m.id}
                match={m}
                p1Name={nameOf(m.p1Id)}
                p2Name={nameOf(m.p2Id)}
                questionCount={questionCount}
                progress={progress}
                finished={finished}
              />
            ))}
            {roundMatches.length === 0 && (
              <p className="text-slate-400">No matches in this round yet.</p>
            )}
          </div>

          {/* Round leaderboard */}
          {leaderboard.length > 0 && (
            <>
              <h2 className="font-display text-lg font-bold text-slate-700 dark:text-slate-200 mb-3">
                Round {currentRound} leaderboard
              </h2>
              <ol className="space-y-1.5">
                {leaderboard.map((entry, i) => (
                  <li
                    key={entry.id}
                    className="flex items-center gap-3 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                  >
                    <span className="w-6 text-center font-bold text-slate-500 dark:text-slate-400">
                      {i + 1}
                    </span>
                    <span className="flex-1 truncate font-semibold text-slate-800 dark:text-white">
                      {nameOf(entry.id)}
                    </span>
                    <span className="tabular-nums text-sm text-slate-600 dark:text-slate-300">
                      {entry.score} pts
                    </span>
                    {entry.finishMs != null && (
                      <span className="tabular-nums text-xs text-slate-400">
                        {(entry.finishMs / 1000).toFixed(1)}s
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

const Stat: React.FC<{ label: string; value: number }> = ({ label, value }) => (
  <div className="rounded-2xl p-4 text-center bg-gradient-to-br from-violet-50 to-fuchsia-50 dark:from-violet-900/20 dark:to-fuchsia-900/20 border border-violet-200 dark:border-violet-500/30">
    <div className="font-display text-3xl font-bold text-violet-600 dark:text-violet-300">{value}</div>
    <div className="text-xs text-slate-500 dark:text-slate-400">{label}</div>
  </div>
);

const LiveMatchCard: React.FC<{
  match: TournamentMatch;
  p1Name: string;
  p2Name: string;
  questionCount: number;
  progress: Record<string, number>;
  finished: Record<string, boolean>;
}> = ({ match, p1Name, p2Name, questionCount, progress, finished }) => {
  const row = (id: string | null, name: string, score: number | null) => {
    const cq = id ? progress[key(match.id, id)] ?? 0 : 0;
    const isDone = id ? finished[key(match.id, id)] || match.state === 'finished' : false;
    const isWinner = match.winnerId === id && !!id;
    return (
      <div className="py-1.5">
        <div className="flex justify-between text-sm mb-1">
          <span
            className={`truncate ${isWinner ? 'font-bold text-emerald-600 dark:text-emerald-400' : 'text-slate-700 dark:text-slate-200'}`}
          >
            {name} {isWinner && '👑'}
          </span>
          <span className="tabular-nums text-slate-500 dark:text-slate-400">
            {match.state === 'finished' && score != null ? `${score} pts` : `${cq}/${questionCount}`}
            {isDone && match.state !== 'finished' && ' ✓'}
          </span>
        </div>
        <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
          <div
            className={`h-full transition-all ${isWinner ? 'bg-emerald-500' : 'bg-gradient-to-r from-violet-500 to-fuchsia-500'}`}
            style={{ width: `${Math.min(100, (cq / Math.max(1, questionCount)) * 100)}%` }}
          />
        </div>
      </div>
    );
  };

  return (
    <div
      className={`rounded-2xl p-3 border-2 ${
        match.state === 'playing'
          ? 'border-emerald-300 dark:border-emerald-700'
          : 'border-slate-200 dark:border-slate-700'
      } bg-white dark:bg-slate-800`}
    >
      <div className="flex justify-between items-center mb-1">
        <span className="text-xs uppercase tracking-wide text-slate-400">Slot {match.slot + 1}</span>
        <span
          className={`text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full ${
            match.state === 'playing'
              ? 'bg-emerald-500 text-white'
              : match.state === 'finished'
              ? 'bg-slate-300 dark:bg-slate-600 text-slate-700 dark:text-slate-200'
              : 'bg-slate-100 dark:bg-slate-700 text-slate-500'
          }`}
        >
          {match.state}
        </span>
      </div>
      {row(match.p1Id, p1Name, match.p1Score)}
      {row(match.p2Id, p2Name, match.p2Score)}
    </div>
  );
};
