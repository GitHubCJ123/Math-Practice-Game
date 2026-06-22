import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type {
  Question,
  Tournament,
  TournamentLiveState,
  TournamentMatch,
  TournamentParticipant,
  TournamentSettings,
} from '@shared/types';
import { usePusherChannel } from '../hooks/usePusherChannel';

interface TournamentState {
  tournament: Tournament | null;
  participantId: string;
  isOrganizer: boolean;
  // Set when a round starts and I have a live match this round.
  myMatchId: string | null;
  myQuestions: Question[];
  // Organizer dashboard: latest per-participant in-match progress.
  liveStates: TournamentLiveState[];
}

interface TournamentContextValue extends TournamentState {
  enterTournament: (tournament: Tournament, participantId: string) => void;
  setTournament: (t: Tournament) => void;
  setLiveStates: (s: TournamentLiveState[]) => void;
  clearMyMatch: () => void;
  exitTournament: () => void;
}

const TournamentContext = createContext<TournamentContextValue | null>(null);

const INITIAL: TournamentState = {
  tournament: null,
  participantId: '',
  isOrganizer: false,
  myMatchId: null,
  myQuestions: [],
  liveStates: [],
};

/**
 * Owns all cross-route tournament state and subscribes to the bracket-wide
 * `tournament-${id}` channel so every screen (lobby, bracket, dashboard, match,
 * results) reads a single, live source of truth. Mirrors MultiplayerContext.
 */
export const TournamentProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<TournamentState>(INITIAL);

  const enterTournament = useCallback((tournament: Tournament, participantId: string) => {
    setState(prev => ({
      ...prev,
      tournament,
      participantId,
      isOrganizer: tournament.organizerId === participantId,
    }));
  }, []);

  const setTournament = useCallback((t: Tournament) => {
    setState(prev => ({ ...prev, tournament: t }));
  }, []);

  const setLiveStates = useCallback((s: TournamentLiveState[]) => {
    setState(prev => ({ ...prev, liveStates: s }));
  }, []);

  const clearMyMatch = useCallback(() => {
    setState(prev => ({ ...prev, myMatchId: null, myQuestions: [] }));
  }, []);

  const exitTournament = useCallback(() => {
    setState(prev => ({ ...INITIAL, participantId: prev.participantId }));
  }, []);

  const channelName = state.tournament ? `tournament-${state.tournament.id}` : null;

  usePusherChannel(channelName, {
    'participant-joined': (data: { participant: TournamentParticipant }) => {
      setState(prev => {
        if (!prev.tournament) return prev;
        if (prev.tournament.participants.some(p => p.participantId === data.participant.participantId)) {
          return prev;
        }
        return {
          ...prev,
          tournament: {
            ...prev.tournament,
            participants: [...prev.tournament.participants, data.participant],
          },
        };
      });
    },
    'participant-left': (data: { participantId: string }) => {
      setState(prev =>
        prev.tournament
          ? {
              ...prev,
              tournament: {
                ...prev.tournament,
                participants: prev.tournament.participants.filter(
                  p => p.participantId !== data.participantId
                ),
              },
            }
          : prev
      );
    },
    'participant-kicked': (data: { participantId: string }) => {
      setState(prev =>
        prev.tournament
          ? {
              ...prev,
              tournament: {
                ...prev.tournament,
                participants: prev.tournament.participants.filter(
                  p => p.participantId !== data.participantId
                ),
              },
            }
          : prev
      );
    },
    'bracket-seeded': (data: { tournament: Tournament }) => setTournament(data.tournament),
    'teams-formed': (data: { tournament: Tournament }) => setTournament(data.tournament),
    'round-settings-updated': (data: {
      round: number;
      roundSettings: Record<string, TournamentSettings>;
    }) => {
      setState(prev =>
        prev.tournament
          ? { ...prev, tournament: { ...prev.tournament, roundSettings: data.roundSettings } }
          : prev
      );
    },
    'round-started': (data: { round: number; tournament: Tournament; questions: Question[] }) => {
      setState(prev => {
        // A player's "side" is themselves (individual) or their team (teams).
        const mySideId =
          data.tournament.format === 'teams'
            ? data.tournament.teams.find(t => t.memberIds.includes(prev.participantId))?.teamId ?? null
            : prev.participantId;
        const myMatch = mySideId
          ? data.tournament.matches.find(
              m =>
                m.round === data.round &&
                m.state === 'playing' &&
                (m.p1Id === mySideId || m.p2Id === mySideId)
            )
          : undefined;
        return {
          ...prev,
          tournament: data.tournament,
          myMatchId: myMatch ? myMatch.id : null,
          myQuestions: myMatch ? data.questions : [],
        };
      });
    },
    'match-finished': (data: { matchId: string; winnerId: string | null; round: number }) => {
      setState(prev => {
        if (!prev.tournament) return prev;
        const matches: TournamentMatch[] = prev.tournament.matches.map(m =>
          m.id === data.matchId ? { ...m, state: 'finished', winnerId: data.winnerId } : m
        );
        return { ...prev, tournament: { ...prev.tournament, matches } };
      });
    },
    'round-advanced': (data: { tournament: Tournament }) => setTournament(data.tournament),
    'tournament-finished': (data: { championId: string | null; tournament: Tournament }) =>
      setTournament(data.tournament),
  });

  const value = useMemo<TournamentContextValue>(
    () => ({
      ...state,
      enterTournament,
      setTournament,
      setLiveStates,
      clearMyMatch,
      exitTournament,
    }),
    [state, enterTournament, setTournament, setLiveStates, clearMyMatch, exitTournament]
  );

  return <TournamentContext.Provider value={value}>{children}</TournamentContext.Provider>;
};

export const useTournamentContext = (): TournamentContextValue => {
  const ctx = useContext(TournamentContext);
  if (!ctx) {
    throw new Error('useTournamentContext must be used within a TournamentProvider');
  }
  return ctx;
};
