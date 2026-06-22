import React, { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Operation, TournamentSettings } from '@shared/types';
import { useThemeContext } from '../../../contexts/ThemeContext';
import { useTournamentContext } from '../../../contexts/TournamentContext';
import { getOrCreatePlayerId } from '../../../lib/multiplayer';
import {
  createTournament,
  joinTournament,
  leaveTournament,
  kickParticipant,
  seedBracket,
  formTeams,
} from '../../../lib/tournament';
import { LobbyHeader } from '../multiplayer-lobby/LobbyHeader';
import { getNumbersForOperation, operationLabels } from '../multiplayer-lobby/types';
import { useToast } from '../../../hooks/useToast';
import { Toast } from '../../ui/Toast';

const QUESTION_COUNT_OPTIONS = [5, 10, 15, 20];
const TIME_LIMIT_OPTIONS: Array<{ label: string; value: number }> = [
  { label: '30s', value: 30 },
  { label: '1m', value: 60 },
  { label: '2m', value: 120 },
  { label: 'None', value: 0 },
];

/**
 * Tournament entry + waiting room. Before joining a tournament it shows the
 * Create/Join tabs; once in one (status 'lobby') it shows the shareable code,
 * the participant roster, and — for the organizer — seeding controls.
 */
export const TournamentLobby: React.FC = () => {
  const navigate = useNavigate();
  const { isDarkMode, toggleDarkMode } = useThemeContext();
  const { tournament, participantId, isOrganizer, enterTournament, exitTournament } =
    useTournamentContext();
  const { toast, showToast, dismiss } = useToast();

  const [tab, setTab] = useState<'create' | 'join'>('create');
  const [busy, setBusy] = useState(false);

  // Create form.
  const [name, setName] = useState('');
  const [operation, setOperation] = useState<Operation>('multiplication');
  const [questionCount, setQuestionCount] = useState(10);
  const [timeLimit, setTimeLimit] = useState(0);
  const [format, setFormat] = useState<'individual' | 'teams'>('individual');

  // Join form.
  const [joinCode, setJoinCode] = useState('');
  const [playerName, setPlayerName] = useState(
    () => localStorage.getItem('mathWhizPlayerName') || ''
  );

  // Organizer seeding order (defaults to roster order; editable before seeding).
  const [order, setOrder] = useState<string[] | null>(null);
  const roster = useMemo(() => tournament?.participants ?? [], [tournament]);
  const orderedRoster = useMemo(() => {
    if (!order) return roster;
    const byId = new Map(roster.map(p => [p.participantId, p]));
    return order.map(id => byId.get(id)).filter((p): p is NonNullable<typeof p> => Boolean(p));
  }, [order, roster]);

  // Team formation (teams format).
  const [teamCount, setTeamCount] = useState(2);
  const [assignment, setAssignment] = useState<Record<string, number>>({});
  const [editingTeams, setEditingTeams] = useState(false);
  const isTeamsFormat = tournament?.format === 'teams';
  const teams = useMemo(() => tournament?.teams ?? [], [tournament]);
  const teamsFormed = teams.length > 0;
  const orderedTeams = useMemo(() => {
    if (!order) return teams;
    const byId = new Map(teams.map(t => [t.teamId, t]));
    return order.map(id => byId.get(id)).filter((t): t is NonNullable<typeof t> => Boolean(t));
  }, [order, teams]);

  const handleCreate = async () => {
    if (!name.trim()) {
      showToast('Give your tournament a name.', 'error');
      return;
    }
    setBusy(true);
    try {
      const organizerId = getOrCreatePlayerId();
      const settings: TournamentSettings = {
        operation,
        selectedNumbers: getNumbersForOperation(operation),
        questionCount,
        timeLimit,
      };
      const res = await createTournament(organizerId, name.trim(), format, settings);
      if (res.success && res.tournament) {
        enterTournament(res.tournament, organizerId);
      } else {
        showToast(res.error || 'Could not create tournament.', 'error');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleJoin = async () => {
    if (!joinCode.trim() || !playerName.trim()) {
      showToast('Enter your name and the tournament code.', 'error');
      return;
    }
    setBusy(true);
    try {
      const myId = getOrCreatePlayerId();
      localStorage.setItem('mathWhizPlayerName', playerName.trim());
      const res = await joinTournament(joinCode.trim(), myId, playerName.trim());
      if (res.success && res.tournament) {
        enterTournament(res.tournament, myId);
      } else {
        showToast(res.error || 'Could not join tournament.', 'error');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleSeed = async (mode: 'auto' | 'manual') => {
    if (!tournament) return;
    const minEntrants = isTeamsFormat ? teams.length : roster.length;
    if (minEntrants < 2) {
      showToast(isTeamsFormat ? 'Form at least 2 teams first.' : 'Need at least 2 participants.', 'error');
      return;
    }
    setBusy(true);
    try {
      const orderIds =
        mode === 'manual'
          ? isTeamsFormat
            ? orderedTeams.map(t => t.teamId)
            : orderedRoster.map(p => p.participantId)
          : undefined;
      const res = await seedBracket(tournament.id, participantId, mode, orderIds);
      if (!res.success) showToast(res.error || 'Could not seed bracket.', 'error');
      // The bracket-seeded event drives navigation via the route component.
    } finally {
      setBusy(false);
    }
  };

  // Shuffle into a random order AND seed in one click (a random draw). The
  // shuffled list is passed straight to the server so it doesn't race setOrder.
  const handleRandomSeed = async () => {
    if (!tournament) return;
    const ids = isTeamsFormat
      ? orderedTeams.map(t => t.teamId)
      : orderedRoster.map(p => p.participantId);
    if (ids.length < 2) {
      showToast(isTeamsFormat ? 'Form at least 2 teams first.' : 'Need at least 2 participants.', 'error');
      return;
    }
    const shuffled = [...ids];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    setOrder(shuffled);
    setBusy(true);
    try {
      const res = await seedBracket(tournament.id, participantId, 'manual', shuffled);
      if (!res.success) showToast(res.error || 'Could not seed bracket.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleKick = async (targetId: string) => {
    if (!tournament) return;
    await kickParticipant(tournament.id, participantId, targetId);
  };

  const handleLeave = async () => {
    if (tournament && !isOrganizer) {
      await leaveTournament(tournament.id, participantId);
    }
    exitTournament();
    navigate('/multiplayer');
  };

  const dragIndexRef = useRef<number | null>(null);
  const reorderIds = (ids: string[], from: number, to: number) => {
    if (from === to || from < 0 || to < 0) return;
    const list = [...ids];
    const [moved] = list.splice(from, 1);
    list.splice(to, 0, moved);
    setOrder(list);
  };
  const shuffleIds = (ids: string[]) => {
    const list = [...ids];
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    setOrder(list);
  };

  // Team formation helpers (teams format, before teams exist).
  const maxTeams = Math.max(2, Math.min(8, roster.length));
  const teamOf = (playerId: string, index: number) => {
    const a = assignment[playerId];
    const base = a != null ? a : index % teamCount;
    return Math.min(base, teamCount - 1);
  };
  const setPlayerTeam = (playerId: string, team: number) =>
    setAssignment(prev => ({ ...prev, [playerId]: team }));
  const balanceEvenly = () => {
    const next: Record<string, number> = {};
    roster.forEach((p, i) => {
      next[p.participantId] = i % teamCount;
    });
    setAssignment(next);
  };
  const startReform = () => {
    const next: Record<string, number> = {};
    teams.forEach((t, ti) => t.memberIds.forEach(pid => { next[pid] = ti; }));
    setAssignment(next);
    setTeamCount(Math.max(2, teams.length));
    setEditingTeams(true);
  };
  const formationTeams = Array.from({ length: teamCount }, (_, t) => ({
    index: t,
    members: roster.filter((p, i) => teamOf(p.participantId, i) === t),
  }));
  const handleCreateTeams = async () => {
    if (!tournament) return;
    const payload = formationTeams.map((t, i) => ({
      teamId: `team-${i + 1}`,
      name: `Team ${i + 1}`,
      memberIds: t.members.map(m => m.participantId),
    }));
    if (payload.some(t => t.memberIds.length === 0)) {
      showToast('Every team needs at least one player.', 'error');
      return;
    }
    setBusy(true);
    try {
      const res = await formTeams(tournament.id, participantId, payload);
      if (!res.success) showToast(res.error || 'Could not form teams.', 'error');
      else {
        setOrder(null);
        setEditingTeams(false);
      }
    } finally {
      setBusy(false);
    }
  };

  // ---- Render: waiting room (already in a lobby-status tournament) ----
  if (tournament) {
    return (
      <div className="w-full p-2 md:p-4">
        <Toast toast={toast} onDismiss={dismiss} />
        <div className="max-w-2xl mx-auto">
          <LobbyHeader
            isDarkMode={isDarkMode}
            toggleDarkMode={toggleDarkMode}
            backLabel={isOrganizer ? '← Close' : '← Leave'}
            onBack={handleLeave}
          />
          <div className="game-panel p-6 md:p-8 animate-fade-in">
            <div className="flex items-center justify-center gap-2 mb-1">
              <span className="text-3xl">🏆</span>
              <h1 className="font-display text-2xl md:text-3xl font-bold text-gradient">
                {tournament.name}
              </h1>
            </div>
            <p className="text-center text-slate-500 dark:text-slate-400 mb-6">
              {isOrganizer ? 'You are the organizer' : 'Waiting for the organizer to start'}
            </p>

            <div className="rounded-2xl p-5 mb-6 text-center bg-gradient-to-br from-violet-50 to-fuchsia-50 dark:from-violet-900/20 dark:to-fuchsia-900/20 border border-violet-200 dark:border-violet-500/30">
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">Tournament Code</p>
              <p className="font-display text-4xl font-bold text-violet-600 dark:text-violet-300 tracking-[0.3em]">
                {tournament.code}
              </p>
            </div>

            {/* Team formation (teams format, before/while editing teams) */}
            {isTeamsFormat && (!teamsFormed || editingTeams) ? (
              <div className="mb-6">
                <h2 className="font-display text-lg font-bold text-slate-700 dark:text-slate-200 mb-3">
                  Form Teams · {roster.length} players
                </h2>
                {roster.length < 2 ? (
                  <p className="text-slate-400 text-center py-6">
                    Share the code so players can join…
                  </p>
                ) : isOrganizer ? (
                  <>
                    <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">
                      Number of teams
                    </label>
                    <div className="flex flex-wrap gap-2 items-center mb-4">
                      {Array.from({ length: Math.max(0, maxTeams - 1) }, (_, i) => i + 2).map(n => (
                        <button
                          key={n}
                          onClick={() => setTeamCount(n)}
                          className={`seg px-4 py-2 ${teamCount === n ? 'seg--active' : ''}`}
                        >
                          {n}
                        </button>
                      ))}
                      <button
                        onClick={balanceEvenly}
                        className="text-sm px-3 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700"
                      >
                        ⚖️ Balance
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {formationTeams.map(t => (
                        <div
                          key={t.index}
                          className="rounded-xl border-2 border-slate-200 dark:border-slate-700 p-3 bg-slate-50 dark:bg-slate-800"
                        >
                          <h3 className="font-display font-bold text-sm mb-2 text-violet-600 dark:text-violet-300">
                            Team {t.index + 1} ({t.members.length})
                          </h3>
                          <ul className="space-y-1.5">
                            {t.members.map(m => (
                              <li key={m.participantId} className="flex items-center gap-2">
                                <span className="flex-1 truncate text-sm text-slate-800 dark:text-white">
                                  {m.name}
                                  {m.participantId === participantId && ' (You)'}
                                </span>
                                <select
                                  value={teamOf(
                                    m.participantId,
                                    roster.findIndex(r => r.participantId === m.participantId)
                                  )}
                                  onChange={e => setPlayerTeam(m.participantId, Number(e.target.value))}
                                  aria-label={`Move ${m.name} to another team`}
                                  className="text-xs rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-1 py-0.5"
                                >
                                  {Array.from({ length: teamCount }, (_, ti) => (
                                    <option key={ti} value={ti}>
                                      Team {ti + 1}
                                    </option>
                                  ))}
                                </select>
                                <button
                                  onClick={() => handleKick(m.participantId)}
                                  aria-label={`Remove ${m.name}`}
                                  className="text-rose-500 hover:bg-rose-100 dark:hover:bg-rose-900/30 rounded px-1"
                                >
                                  ✕
                                </button>
                              </li>
                            ))}
                            {t.members.length === 0 && (
                              <li className="text-xs text-slate-400">No players</li>
                            )}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <ul className="space-y-2">
                    {roster.map(p => (
                      <li
                        key={p.participantId}
                        className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-800 dark:text-white truncate"
                      >
                        {p.name}
                        {p.participantId === participantId && ' (You)'}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              /* Seeding roster — individual players or formed teams */
              <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-display text-lg font-bold text-slate-700 dark:text-slate-200">
                    {isTeamsFormat ? `Teams (${teams.length})` : `Participants (${roster.length})`}
                  </h2>
                  {isOrganizer && (isTeamsFormat ? teams.length : roster.length) > 1 && (
                    <button
                      onClick={() =>
                        shuffleIds(
                          isTeamsFormat
                            ? orderedTeams.map(t => t.teamId)
                            : orderedRoster.map(p => p.participantId)
                        )
                      }
                      className="text-sm px-3 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                    >
                      🔀 Shuffle
                    </button>
                  )}
                </div>

                {(isTeamsFormat ? teams.length : roster.length) === 0 ? (
                  <p className="text-slate-400 text-center py-6">
                    Share the code so players can join…
                  </p>
                ) : (
                  <>
                    {isOrganizer && (
                      <p className="text-xs text-slate-400 mb-2">
                        Drag to reorder the list (or tap 🔀 Shuffle to mix it up).
                      </p>
                    )}
                    <ul className="space-y-2">
                      {(isTeamsFormat
                        ? orderedTeams.map(t => ({
                            id: t.teamId,
                            label: t.name,
                            sub: `${t.memberIds.length} players`,
                            kickable: false,
                          }))
                        : orderedRoster.map(p => ({
                            id: p.participantId,
                            label: `${p.name}${p.participantId === participantId ? ' (You)' : ''}`,
                            sub: '',
                            kickable: true,
                          }))
                      ).map((e, i) => (
                        <li
                          key={e.id}
                          draggable={isOrganizer}
                          onDragStart={() => {
                            dragIndexRef.current = i;
                          }}
                          onDragOver={ev => ev.preventDefault()}
                          onDrop={() => {
                            const from = dragIndexRef.current;
                            dragIndexRef.current = null;
                            if (from != null)
                              reorderIds(
                                isTeamsFormat
                                  ? orderedTeams.map(t => t.teamId)
                                  : orderedRoster.map(p => p.participantId),
                                from,
                                i
                              );
                          }}
                          className={`flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 transition-shadow ${
                            isOrganizer ? 'cursor-move hover:shadow-md' : ''
                          }`}
                        >
                          {isOrganizer && (
                            <span
                              className="text-slate-400 dark:text-slate-500 select-none"
                              aria-hidden="true"
                            >
                              ⠿
                            </span>
                          )}
                          <span className="grid place-items-center w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 text-white text-sm font-bold">
                            {i + 1}
                          </span>
                          <span className="font-display font-semibold text-slate-800 dark:text-white flex-1 truncate">
                            {e.label}
                            {e.sub && (
                              <span className="text-xs font-normal text-slate-400 ml-2">{e.sub}</span>
                            )}
                          </span>
                          {isOrganizer && e.kickable && (
                            <button
                              onClick={() => handleKick(e.id)}
                              aria-label={`Remove ${e.label}`}
                              title={`Remove ${e.label}`}
                              className="w-7 h-7 rounded-lg text-rose-500 hover:bg-rose-100 dark:hover:bg-rose-900/30"
                            >
                              ✕
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            )}

            {/* Actions */}
            {!isOrganizer ? (
              <p className="text-center text-slate-500 dark:text-slate-400 animate-pulse">
                Waiting for the organizer to start the bracket…
              </p>
            ) : isTeamsFormat && (!teamsFormed || editingTeams) ? (
              <button
                onClick={handleCreateTeams}
                disabled={busy || roster.length < 2}
                className="btn3d btn3d--primary w-full py-3 disabled:opacity-50"
              >
                {editingTeams ? 'Save Teams' : `Create ${teamCount} Teams`} →
              </button>
            ) : (
              <>
                <div className="text-xs text-slate-500 dark:text-slate-400 mb-2 leading-snug space-y-1">
                  <p>
                    <span className="font-semibold text-slate-600 dark:text-slate-300">Auto-Seed</span>:
                    line up {isTeamsFormat ? 'teams' : 'players'} in the order they joined.{' '}
                    <span className="font-semibold text-slate-600 dark:text-slate-300">🎲 Random Seed</span>:
                    mix everyone into a random draw.{' '}
                    <span className="font-semibold text-slate-600 dark:text-slate-300">Use This Order</span>:
                    keep the exact order shown above (drag names or tap 🔀 Shuffle to rearrange).
                  </p>
                  <p>
                    <span className="font-semibold text-slate-600 dark:text-slate-300">🔀 Shuffle</span>{' '}
                    only rearranges the list above — nothing starts until you tap a seed button.{' '}
                    <span className="font-semibold text-slate-600 dark:text-slate-300">🎲 Random Seed</span>{' '}
                    does both at once: it shuffles and locks in the bracket in one tap.
                  </p>
                  <p>
                    This order is a ranking from best (#1, at the top) to lowest (at the bottom). The
                    game uses it to decide who plays who: the best {isTeamsFormat ? 'teams' : 'players'}{' '}
                    are placed far apart, so they only meet near the end — and #1 starts against the
                    lowest-ranked one. If there are too many {isTeamsFormat ? 'teams' : 'players'} for an
                    even bracket, the lowest-ranked ones play one extra Play-In game first.
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-3">
                  {isTeamsFormat && (
                    <button
                      onClick={startReform}
                      disabled={busy}
                      className="btn3d btn3d--neutral flex-1 py-3 disabled:opacity-50"
                    >
                      ↩ Edit Teams
                    </button>
                  )}
                  <button
                    onClick={() => handleSeed('auto')}
                    disabled={busy || (isTeamsFormat ? teams.length : roster.length) < 2}
                    className="btn3d btn3d--neutral flex-1 py-3 disabled:opacity-50"
                  >
                    Auto-Seed
                  </button>
                  <button
                    onClick={handleRandomSeed}
                    disabled={busy || (isTeamsFormat ? teams.length : roster.length) < 2}
                    className="btn3d btn3d--neutral flex-1 py-3 disabled:opacity-50"
                  >
                    🎲 Random Seed
                  </button>
                  <button
                    onClick={() => handleSeed('manual')}
                    disabled={busy || (isTeamsFormat ? teams.length : roster.length) < 2}
                    className="btn3d btn3d--primary flex-1 py-3 disabled:opacity-50"
                  >
                    Use This Order →
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ---- Render: create / join ----
  return (
    <div className="w-full p-2 md:p-4">
      <Toast toast={toast} onDismiss={dismiss} />
      <div className="max-w-2xl mx-auto">
        <LobbyHeader
          isDarkMode={isDarkMode}
          toggleDarkMode={toggleDarkMode}
          backLabel="← Back to Multiplayer"
          onBack={() => navigate('/multiplayer')}
        />
        <div className="game-panel p-6 md:p-8 animate-fade-in">
          <div className="flex items-center justify-center gap-2 mb-1">
            <span className="text-3xl">🏆</span>
            <h1 className="font-display text-3xl md:text-4xl font-bold text-gradient leading-none pb-1">
              Tournament
            </h1>
            <span className="text-xs font-bold uppercase px-2 py-1 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
              Beta
            </span>
          </div>
          <p className="text-center text-slate-500 dark:text-slate-400 mb-6">
            Run a single-elimination bracket for up to 32 players.
          </p>

          <div className="grid grid-cols-2 gap-2 mb-6">
            <button
              onClick={() => setTab('create')}
              className={`seg px-2 py-2.5 ${tab === 'create' ? 'seg--active' : ''}`}
            >
              Create (Organizer)
            </button>
            <button
              onClick={() => setTab('join')}
              className={`seg px-2 py-2.5 ${tab === 'join' ? 'seg--active' : ''}`}
            >
              Join
            </button>
          </div>

          {tab === 'create' ? (
            <div className="space-y-4">
              <Field label="Tournament Name">
                <input
                  value={name}
                  onChange={e => setName(e.target.value.substring(0, 60))}
                  placeholder="Friday Math Cup"
                  maxLength={60}
                  className="w-full px-4 py-3 rounded-2xl border-2 border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-white outline-hidden focus:border-violet-500"
                />
              </Field>

              <Field label="Format">
                <div className="flex gap-2">
                  <button
                    onClick={() => setFormat('individual')}
                    className={`seg flex-1 px-4 py-2 ${format === 'individual' ? 'seg--active' : ''}`}
                  >
                    Individual (1v1)
                  </button>
                  <button
                    onClick={() => setFormat('teams')}
                    className={`seg flex-1 px-4 py-2 ${format === 'teams' ? 'seg--active' : ''}`}
                  >
                    Teams
                  </button>
                </div>
              </Field>

              <Field label="Operation (Round 1 — you can change it each round)">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {(Object.keys(operationLabels) as Operation[]).map(op => (
                    <button
                      key={op}
                      onClick={() => setOperation(op)}
                      className={`seg px-2 py-2 text-sm ${operation === op ? 'seg--active' : ''}`}
                    >
                      {operationLabels[op]}
                    </button>
                  ))}
                </div>
              </Field>

              <Field label="Questions per Match">
                <div className="flex gap-2">
                  {QUESTION_COUNT_OPTIONS.map(n => (
                    <button
                      key={n}
                      onClick={() => setQuestionCount(n)}
                      className={`seg px-4 py-2 ${questionCount === n ? 'seg--active' : ''}`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </Field>

              <Field label="Time Limit">
                <div className="flex gap-2">
                  {TIME_LIMIT_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setTimeLimit(opt.value)}
                      className={`seg px-4 py-2 ${timeLimit === opt.value ? 'seg--active' : ''}`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </Field>

              <button
                onClick={handleCreate}
                disabled={busy}
                className="btn3d btn3d--primary w-full py-4 text-xl disabled:opacity-50"
              >
                {busy ? 'Creating…' : 'Create Tournament'}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <Field label="Your Name">
                <input
                  value={playerName}
                  onChange={e => setPlayerName(e.target.value.substring(0, 20))}
                  placeholder="Enter your name"
                  maxLength={20}
                  className="w-full px-4 py-3 rounded-2xl border-2 border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-white outline-hidden focus:border-violet-500"
                />
              </Field>
              <Field label="Tournament Code">
                <input
                  value={joinCode}
                  onChange={e => setJoinCode(e.target.value.toUpperCase().substring(0, 6))}
                  placeholder="ABC123"
                  maxLength={6}
                  className="w-full px-4 py-3 rounded-2xl border-2 border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-white outline-hidden focus:border-violet-500 tracking-[0.3em] text-center font-display text-xl uppercase"
                />
              </Field>
              <button
                onClick={handleJoin}
                disabled={busy}
                className="btn3d btn3d--fuchsia w-full py-4 text-xl disabled:opacity-50"
              >
                {busy ? 'Joining…' : 'Join Tournament'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div>
    <label className="block text-sm font-display font-semibold text-slate-600 dark:text-slate-400 mb-2">
      {label}
    </label>
    {children}
  </div>
);
