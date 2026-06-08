-- Indexes for LeaderboardScores table
CREATE NONCLUSTERED INDEX IX_LeaderboardScores_OperationType_CreatedAt
  ON LeaderboardScores(OperationType, CreatedAt DESC);

CREATE NONCLUSTERED INDEX IX_LeaderboardScores_PlayerName_OperationType
  ON LeaderboardScores(PlayerName, OperationType)
  INCLUDE (Score, CreatedAt);

-- Index for HallOfFame table
CREATE NONCLUSTERED INDEX IX_HallOfFame_OperationType_Year_Month
  ON HallOfFame(OperationType, Year DESC, Month DESC);

