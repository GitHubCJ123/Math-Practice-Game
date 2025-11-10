-- Table to store players waiting for random matchmaking
CREATE TABLE MatchmakingQueue (
    Id INT PRIMARY KEY IDENTITY(1,1),
    PlayerSessionId NVARCHAR(100) NOT NULL UNIQUE, -- A unique identifier for the player's session
    Operation NVARCHAR(50) NOT NULL, -- The operation type (e.g., 'multiplication')
    SelectedNumbers NVARCHAR(MAX) NOT NULL, -- JSON string of selected numbers
    PusherChannel NVARCHAR(200) NOT NULL, -- Pusher channel name for this player
    CreatedAt DATETIME2 NOT NULL DEFAULT GETUTCDATE()
);

-- Index for faster lookups by creation time (for FIFO matching)
CREATE INDEX IX_MatchmakingQueue_CreatedAt ON MatchmakingQueue(CreatedAt);

