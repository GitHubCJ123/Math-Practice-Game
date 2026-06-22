import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Operation, TournamentMatch, TournamentSettings } from '@shared/types';
import { useThemeContext } from '../../../contexts/ThemeContext';
import { useTournamentContext } from '../../../contexts/TournamentContext';
import { advanceRound, setRoundSettings, startRound } from '../../../lib/tournament';
import { getNumbersForOperation, operationLabels } from '../multiplayer-lobby/types';
import { LobbyHeader } from '../multiplayer-lobby/LobbyHeader';
import { useToast } from '../../../hooks/useToast';
import { Toast } from '../../ui/Toast';
import { planBracket, buildBaseRound } from '@shared/bracket';

function roundName(matchCount: number, round: number): string {
  if (matchCount === 1) return 'Final';
  if (matchCount === 2) return 'Semifinals';
  if (matchCount === 4) return 'Quarterfinals';
  return `Round ${round}`;
}

type BracketCell =
  | { kind: 'match'; match: TournamentMatch }
  | { kind: 'preview'; p1: string | null; p2: string | null; key: string }
  | { kind: 'empty'; key: string };

/**
 * The bracket chart plus the organizer's round controls. Everyone sees the live
 * bracket; the organizer additionally gets Start Round / Advance / next-round
 * operation controls. Detailed live analytics live in the organizer dashboard.
 */
export const BracketView: React.FC = () => {
  const navigate = useNavigate();
  const { isDarkMode, toggleDarkMode } = useThemeContext();
  const { tournament, participantId, isOrganizer, setTournament } = useTournamentContext();
  const { toast, showToast, dismiss } = useToast();
  const [busy, setBusy] = useState(false);

  // Build the adaptive bracket: an optional Play-In column (when the field
  // isn't a power of two) plus the main round-of-`base` -> final tree. Main
  // rounds not yet in the DB render as a preview (direct-entry seeds placed,
  // play-in seats labelled) so the bracket looks complete from the start.
  const bracket = useMemo(() => {
    if (!tournament) return null;
    const entrantIds =
      tournament.format === 'teams'
        ? tournament.teams.map(t => t.teamId)
        : tournament.participants.map(p => p.participantId);
    if (entrantIds.length < 2 || tournament.matches.length === 0) return null;

    const plan = planBracket(entrantIds.length);
    const mainStart = plan.playInCount > 0 ? 2 : 1;

    // Preview occupants of the round-of-base: top seeds placed directly, the
    // remaining (play-in) seats left null until the round is built on advance.
    const occupants: (string | null)[] = entrantIds.slice(0, plan.directEntrants);
    while (occupants.length < plan.base) occupants.push(null);
    const previewBase = buildBaseRound(mainStart, occupants);

    const cols: { round: number; cells: BracketCell[] }[] = [];
    for (let r = mainStart, count = plan.base / 2; count >= 1; r++, count = Math.floor(count / 2)) {
      const cells: BracketCell[] = [];
      for (let slot = 0; slot < count; slot++) {
        const match = tournament.matches.find(m => m.round === r && m.slot === slot);
        if (match) {
          cells.push({ kind: 'match', match });
        } else if (r === mainStart) {
          const pm = previewBase[slot];
          cells.push({ kind: 'preview', p1: pm?.p1Id ?? null, p2: pm?.p2Id ?? null, key: `${r}-${slot}` });
        } else {
          cells.push({ kind: 'empty', key: `${r}-${slot}` });
        }
      }
      cols.push({ round: r, cells });
    }

    const playIn =
      plan.playInCount > 0
        ? tournament.matches.filter(m => m.round === 1).sort((a, b) => a.slot - b.slot)
        : [];

    return { cols, playIn };
  }, [tournament]);

  if (!tournament) return null;

  const nameOf = (id: string | null): string => {
    if (!id) return '—';
    if (tournament.format === 'teams') {
      return tournament.teams.find(t => t.teamId === id)?.name ?? 'Bye';
    }
    return tournament.participants.find(p => p.participantId === id)?.name ?? 'Bye';
  };

  const currentRound = tournament.currentRound;
  const thisRound = tournament.matches.filter(m => m.round === currentRound);
  const needsStart = thisRound.some(m => m.state === 'pending' && m.p1Id && m.p2Id);
  const roundComplete = thisRound.length > 0 && thisRound.every(m => m.state === 'finished');
  const winnersThisRound = thisRound.filter(m => m.winnerId).length;
  const isFinished = tournament.status === 'finished';

  // The round whose operation the next "Start Round" will use.
  const targetRound = needsStart ? currentRound : currentRound + 1;
  const targetSettings: TournamentSettings =
    tournament.roundSettings?.[String(targetRound)] ?? tournament.settings;

  const handleStart = async () => {
    setBusy(true);
    try {
      const res = await startRound(tournament.id, participantId, currentRound);
      if (!res.success) showToast(res.error || 'Could not start the round.', 'error');
      else if (res.tournament) setTournament(res.tournament);
    } finally {
      setBusy(false);
    }
  };

  const handleAdvance = async () => {
    setBusy(true);
    try {
      const res = await advanceRound(tournament.id, participantId);
      if (!res.success) showToast(res.error || 'Could not advance.', 'error');
      else if (res.tournament) setTournament(res.tournament);
    } finally {
      setBusy(false);
    }
  };

  const handleSetOperation = async (op: Operation) => {
    const settings: TournamentSettings = {
      ...targetSettings,
      operation: op,
      selectedNumbers: getNumbersForOperation(op),
    };
    const res = await setRoundSettings(tournament.id, participantId, targetRound, settings);
    if (res.success && res.tournament) setTournament(res.tournament);
    else if (!res.success) showToast(res.error || 'Could not change the operation.', 'error');
  };

  const championName = isFinished && tournament.championId ? nameOf(tournament.championId) : null;

  // A viewer's "side" is themselves (individual) or their team (teams).
  const mySideId =
    tournament.format === 'teams'
      ? tournament.teams.find(t => t.memberIds.includes(participantId))?.teamId ?? null
      : participantId;
  const myMatchThisRound = tournament.matches.find(
    m => m.round === currentRound && (m.p1Id === mySideId || m.p2Id === mySideId)
  );
  const amEliminated =
    !isOrganizer &&
    tournament.participants.find(p => p.participantId === participantId)?.eliminatedRound != null;

  return (
    <div className="w-full p-2 md:p-4">
      <Toast toast={toast} onDismiss={dismiss} />
      <div className="max-w-6xl mx-auto">
        <LobbyHeader
          isDarkMode={isDarkMode}
          toggleDarkMode={toggleDarkMode}
          backLabel="← Exit"
          onBack={() => navigate('/multiplayer')}
        />

        <div className="game-panel p-4 md:p-6 animate-fade-in">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2">
              <span className="text-2xl">🏆</span>
              <h1 className="font-display text-xl md:text-2xl font-bold text-gradient">
                {tournament.name}
              </h1>
              <span className="text-xs px-2 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                {tournament.code}
              </span>
            </div>
            {isOrganizer && (
              <button
                onClick={() => navigate('/tournament/dashboard')}
                className="text-sm px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
              >
                📊 Live Dashboard
              </button>
            )}
          </div>

          {/* Champion banner */}
          {championName && (
            <div className="rounded-2xl p-6 mb-6 text-center bg-gradient-to-br from-amber-100 to-yellow-100 dark:from-amber-900/30 dark:to-yellow-900/20 border border-amber-300 dark:border-amber-500/40">
              <div className="text-5xl mb-2">🥇</div>
              <p className="text-sm uppercase tracking-wide text-amber-700 dark:text-amber-300">
                Champion
              </p>
              <p className="font-display text-3xl font-bold text-amber-800 dark:text-amber-200">
                {championName}
              </p>
            </div>
          )}

          {/* Participant status */}
          {!isOrganizer && !isFinished && (
            <div className="mb-4 text-center text-slate-600 dark:text-slate-300">
              {amEliminated ? (
                <span className="text-rose-500 font-semibold">
                  You were eliminated — thanks for playing! You can keep watching.
                </span>
              ) : myMatchThisRound && myMatchThisRound.state === 'playing' ? (
                <span className="text-emerald-600 dark:text-emerald-400 font-semibold animate-pulse">
                  Your match is live — head to the play screen!
                </span>
              ) : (
                <span className="animate-pulse">Waiting for the next round to start…</span>
              )}
            </div>
          )}

          {/* Organizer controls */}
          {isOrganizer && !isFinished && (
            <div className="rounded-2xl p-4 mb-6 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
              <div className="flex flex-wrap items-end gap-4">
                <div className="flex-1 min-w-[220px]">
                  <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                    {needsStart ? `Round ${targetRound} operation` : `Next round operation`}
                  </label>
                  <select
                    value={targetSettings.operation}
                    onChange={e => handleSetOperation(e.target.value as Operation)}
                    className="w-full px-3 py-2 rounded-xl border-2 border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-white"
                  >
                    {(Object.keys(operationLabels) as Operation[]).map(op => (
                      <option key={op} value={op}>
                        {operationLabels[op]}
                      </option>
                    ))}
                  </select>
                </div>
                {needsStart ? (
                  <button
                    onClick={handleStart}
                    disabled={busy}
                    className="btn3d btn3d--success px-6 py-3 disabled:opacity-50"
                  >
                    ▶ Start Round {currentRound}
                  </button>
                ) : roundComplete ? (
                  <button
                    onClick={handleAdvance}
                    disabled={busy}
                    className="btn3d btn3d--primary px-6 py-3 disabled:opacity-50"
                  >
                    {winnersThisRound <= 1 ? '👑 Crown Champion' : `Advance to Round ${currentRound + 1} →`}
                  </button>
                ) : (
                  <span className="text-sm text-slate-500 dark:text-slate-400 py-3">
                    Round {currentRound} in progress…
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Bracket chart */}
          <div className="overflow-x-auto pb-2 rounded-2xl bg-slate-50/60 dark:bg-slate-900/20 border border-slate-100 dark:border-slate-800 p-4 md:p-6">
            {!bracket ? (
              <p className="text-center text-slate-400 py-12">The bracket has not been seeded yet.</p>
            ) : (
              <div className="flex items-stretch w-max mx-auto">
                {/* Play-In round — only when the field isn't a power of two. */}
                {bracket.playIn.length > 0 && (
                  <div className="flex flex-col mr-10 min-w-[210px]">
                    <h3 className="mb-2 text-center">
                      <span className="inline-block font-display text-xs font-bold text-amber-600 dark:text-amber-300 uppercase tracking-wider px-3 py-1 rounded-full bg-amber-100/70 dark:bg-amber-900/30">
                        Play-In
                      </span>
                    </h3>
                    <p className="text-center text-[11px] leading-snug text-slate-500 dark:text-slate-400 mb-4 max-w-[190px] mx-auto">
                      When there are too many players for an even bracket, the lowest seeds play
                      here first — winners advance into the main bracket.
                    </p>
                    <div className="flex-1 flex flex-col justify-around gap-4">
                      {bracket.playIn.map(m => (
                        <MatchCard
                          key={m.id}
                          match={m}
                          p1Name={m.p1Id ? nameOf(m.p1Id) : '—'}
                          p2Name={m.p2Id ? nameOf(m.p2Id) : '—'}
                          meId={mySideId ?? ''}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Main bracket: clean round-of-base → final halving tree. */}
                <div className="tt-bracket">
                  {bracket.cols.map(col => (
                    <div key={col.round} className="tt-round">
                      <h3 className="tt-round__title mb-4 text-center">
                        <span className="inline-block font-display text-xs font-bold text-violet-600 dark:text-violet-300 uppercase tracking-wider px-3 py-1 rounded-full bg-violet-100/70 dark:bg-violet-900/30">
                          {roundName(col.cells.length, col.round)}
                        </span>
                      </h3>
                      <div className="tt-round__body">
                        {col.cells.map(cell => (
                          <div
                            key={cell.kind === 'match' ? cell.match.id : cell.key}
                            className="tt-match-wrap"
                          >
                            {cell.kind === 'match' ? (
                              <MatchCard
                                match={cell.match}
                                p1Name={
                                  cell.match.p1Id
                                    ? nameOf(cell.match.p1Id)
                                    : cell.match.p2Id
                                    ? 'Bye'
                                    : '—'
                                }
                                p2Name={
                                  cell.match.p2Id
                                    ? nameOf(cell.match.p2Id)
                                    : cell.match.p1Id
                                    ? 'Bye'
                                    : '—'
                                }
                                meId={mySideId ?? ''}
                              />
                            ) : cell.kind === 'preview' ? (
                              <PreviewCard
                                p1={cell.p1 ? nameOf(cell.p1) : 'Play-In Winner'}
                                p2={cell.p2 ? nameOf(cell.p2) : 'Play-In Winner'}
                              />
                            ) : (
                              <PlaceholderCard />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const MatchCard: React.FC<{
  match: TournamentMatch;
  p1Name: string;
  p2Name: string;
  meId: string;
}> = ({ match, p1Name, p2Name, meId }) => {
  const row = (
    id: string | null,
    name: string,
    score: number | null,
    isWinner: boolean
  ) => {
    const isMe = !!id && id === meId;
    const dimmed = match.state === 'finished' && !isWinner && !!id;
    return (
      <div
        className={`flex items-center gap-2 px-3 py-2 ${
          isWinner ? 'bg-emerald-50 dark:bg-emerald-900/25' : ''
        }`}
      >
        <span
          className={`flex-1 truncate text-sm ${
            isWinner
              ? 'font-bold text-emerald-700 dark:text-emerald-300'
              : id
              ? 'text-slate-800 dark:text-white'
              : 'text-slate-400 dark:text-slate-500'
          } ${dimmed ? 'opacity-60' : ''}`}
        >
          {name}
          {isMe && <span className="text-violet-500 dark:text-violet-400"> (You)</span>}
        </span>
        {isWinner && <span className="text-xs" aria-hidden="true">🏆</span>}
        <span
          className={`min-w-[1.25rem] text-right text-sm tabular-nums font-semibold ${
            isWinner ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-400'
          }`}
        >
          {score ?? (match.state === 'playing' ? '·' : '')}
        </span>
      </div>
    );
  };

  return (
    <div
      className={`tt-match rounded-xl border-2 overflow-hidden bg-white dark:bg-slate-800 transition-shadow hover:shadow-lg ${
        match.state === 'playing'
          ? 'border-emerald-400 dark:border-emerald-600 shadow-md shadow-emerald-500/10'
          : match.winnerId
          ? 'border-emerald-300 dark:border-emerald-700/70'
          : 'border-slate-200 dark:border-slate-700'
      }`}
    >
      {row(match.p1Id, p1Name, match.p1Score, match.winnerId === match.p1Id && !!match.p1Id)}
      <div className="border-t border-slate-200 dark:border-slate-700" />
      {row(match.p2Id, p2Name, match.p2Score, match.winnerId === match.p2Id && !!match.p2Id)}
      {match.state === 'playing' && (
        <div className="text-[10px] text-center py-0.5 bg-emerald-500 text-white uppercase tracking-wide animate-pulse">
          Live
        </div>
      )}
    </div>
  );
};

const PlaceholderCard: React.FC = () => (
  <div className="tt-match rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700 overflow-hidden bg-white/40 dark:bg-slate-800/30">
    <div className="px-3 py-2 text-sm text-slate-300 dark:text-slate-600">TBD</div>
    <div className="border-t border-dashed border-slate-200 dark:border-slate-700" />
    <div className="px-3 py-2 text-sm text-slate-300 dark:text-slate-600">TBD</div>
  </div>
);

// A round-of-base seat that isn't a real DB match yet: a direct-entry seed or a
// pending "Play-In Winner". Display-only, so the bracket looks complete up front.
const PreviewCard: React.FC<{ p1: string; p2: string }> = ({ p1, p2 }) => (
  <div className="tt-match rounded-xl border-2 border-slate-200 dark:border-slate-700 overflow-hidden bg-white/70 dark:bg-slate-800/40">
    <div className="px-3 py-2 text-sm truncate text-slate-500 dark:text-slate-400">{p1}</div>
    <div className="border-t border-slate-200 dark:border-slate-700" />
    <div className="px-3 py-2 text-sm truncate text-slate-500 dark:text-slate-400">{p2}</div>
  </div>
);
