import type { MultiplayerResult, TeamResult, Room } from "../../shared/types.js";

/**
 * Randomly split a room's players into Team A / Team B, mutating the in-memory
 * room object only (no persistence). Used as a defensive fallback inside
 * {@link buildGameResults} when a team-mode room somehow reaches the end without
 * teams assigned. The authoritative team assignment happens server-side in the
 * `mp_*` Postgres functions.
 */
export function assignRandomTeams(room: Room): void {
  const playerIds = room.players.map(p => p.id);

  for (let i = playerIds.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [playerIds[i], playerIds[j]] = [playerIds[j], playerIds[i]];
  }

  const halfPoint = Math.ceil(playerIds.length / 2);
  const teamAPlayerIds = playerIds.slice(0, halfPoint);
  const teamBPlayerIds = playerIds.slice(halfPoint);

  room.teams = [
    { id: "team-a", name: "Team A", playerIds: teamAPlayerIds },
    { id: "team-b", name: "Team B", playerIds: teamBPlayerIds },
  ];

  for (const player of room.players) {
    player.teamId = teamAPlayerIds.includes(player.id) ? "team-a" : "team-b";
  }
}

/**
 * Build the final ranked results (and team results in team mode) for a finished
 * room. Pure: derives everything from the loaded {@link Room}. Shared by the
 * submit and disconnect end-of-game paths so both emit an identical, fully
 * ranked payload (FFA rank + teamId + team winner).
 */
export function buildGameResults(room: Room): { results: MultiplayerResult[]; teamResults?: TeamResult[] } {
  const rankedStates = [...room.playerStates].sort((a, b) => {
    // Sort by score descending, then by time ascending
    if (b.score !== a.score) return b.score - a.score;
    return (a.finishTime ?? Infinity) - (b.finishTime ?? Infinity);
  });

  const getPlayerTeamId = (pid: string): string | undefined => {
    const player = room.players.find(p => p.id === pid);
    if (player?.teamId) return player.teamId;
    for (const team of room.teams) {
      if (team.playerIds.includes(pid)) return team.id;
    }
    return undefined;
  };

  const results: MultiplayerResult[] = rankedStates.map((ps, index) => ({
    playerId: ps.playerId,
    playerName: ps.playerName,
    score: ps.score,
    totalQuestions: room.questions.length,
    timeTaken: ps.finishTime || 0,
    answers: ps.answers,
    questions: room.questions,
    teamId: getPlayerTeamId(ps.playerId),
    rank: index + 1,
  }));

  let teamResults: TeamResult[] | undefined;

  // Safety check: ensure teams exist if in team mode
  if (room.settings.gameMode === "teams" && room.teams.length === 0) {
    assignRandomTeams(room);
  }

  if (room.settings.gameMode === "teams" && room.teams.length > 0) {
    teamResults = room.teams.map(team => {
      // Use team.playerIds directly instead of relying on player.teamId
      const teamPlayerStates = room.playerStates.filter(ps =>
        team.playerIds.includes(ps.playerId)
      );

      const totalScore = teamPlayerStates.reduce((sum, ps) => sum + ps.score, 0);
      const totalTime = teamPlayerStates.reduce((sum, ps) => sum + (ps.finishTime || 0), 0);
      const playerCount = teamPlayerStates.length || 1;

      return {
        teamId: team.id,
        teamName: team.name,
        playerIds: team.playerIds,
        averageScore: totalScore / playerCount,
        averageTime: totalTime / playerCount,
        totalScore,
        totalTime,
        isWinner: false, // Will be set below
      };
    });

    // Determine winner (higher average score wins, tiebreaker: lower average time)
    if (teamResults.length === 2) {
      const [teamA, teamB] = teamResults;
      if (teamA.averageScore > teamB.averageScore) {
        teamA.isWinner = true;
      } else if (teamB.averageScore > teamA.averageScore) {
        teamB.isWinner = true;
      } else if (teamA.averageTime < teamB.averageTime) {
        teamA.isWinner = true;
      } else if (teamB.averageTime < teamA.averageTime) {
        teamB.isWinner = true;
      }
      // Else it's a draw, no winner
    }
  }

  return { results, teamResults };
}
