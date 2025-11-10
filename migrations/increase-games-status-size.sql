-- Increase Status column size to accommodate rematch status strings
-- First drop the index that depends on the column (if it exists)
IF EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_Games_Status' AND object_id = OBJECT_ID('Games'))
BEGIN
    DROP INDEX IX_Games_Status ON Games;
END

-- Then alter the column
ALTER TABLE Games
ALTER COLUMN Status NVARCHAR(100) NOT NULL;

-- Recreate the index
CREATE INDEX IX_Games_Status ON Games(Status) WHERE Status = 'waiting';


