-- Clear all data from Games and GamePlayers tables
-- WARNING: This will delete ALL game data!

-- Delete all players first (due to foreign key constraint)
DELETE FROM GamePlayers;

-- Delete all games
DELETE FROM Games;

-- Reset identity counters (optional, but keeps IDs starting from 1)
DBCC CHECKIDENT ('GamePlayers', RESEED, 0);
DBCC CHECKIDENT ('Games', RESEED, 0);

-- Verify tables are empty
SELECT COUNT(*) as GameCount FROM Games;
SELECT COUNT(*) as PlayerCount FROM GamePlayers;


