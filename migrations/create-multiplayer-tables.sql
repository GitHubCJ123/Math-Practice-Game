-- Stores the overall game session, status, and room identifier.
CREATE TABLE Games (
    Id INT PRIMARY KEY IDENTITY(1,1),
    RoomCode NVARCHAR(6) NOT NULL UNIQUE,
    Status NVARCHAR(20) NOT NULL DEFAULT 'waiting', -- e.g., 'waiting', 'in_progress', 'completed'
    Questions NVARCHAR(MAX), -- JSON string of the 10 questions for this game
    CreatedAt DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    UpdatedAt DATETIME2 NOT NULL DEFAULT GETUTCDATE()
);

-- A linking table to associate players with a game.
CREATE TABLE GamePlayers (
    Id INT PRIMARY KEY IDENTITY(1,1),
    GameId INT NOT NULL,
    PlayerSessionId NVARCHAR(100) NOT NULL, -- A unique identifier for the player's session
    Status NVARCHAR(20) NOT NULL DEFAULT 'playing', -- e.g., 'playing', 'finished'
    FinalTime BIGINT, -- Total time in milliseconds, including penalties
    Answers NVARCHAR(MAX), -- JSON string of the player's answers
    CreatedAt DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    UpdatedAt DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    FOREIGN KEY (GameId) REFERENCES Games(Id)
);

-- Optional index for faster lookups of waiting games for matchmaking.
CREATE INDEX IX_Games_Status ON Games(Status) WHERE Status = 'waiting';


