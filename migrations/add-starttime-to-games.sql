-- Add StartTime column to Games table to store the synchronized start time
-- This prevents timer desynchronization when get-game-info.ts is called
ALTER TABLE Games
ADD StartTime BIGINT NULL; -- Store as milliseconds since epoch (same format as Date.now())

