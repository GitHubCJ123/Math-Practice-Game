-- Table to track the last reset date for game ID sequences
-- This ensures we reset the IDENTITY seed at the start of each EST day
CREATE TABLE DailyGameSequenceReset (
    Id INT PRIMARY KEY IDENTITY(1,1),
    LastResetDate DATE NOT NULL UNIQUE,
    ResetAt DATETIME2 NOT NULL DEFAULT GETUTCDATE()
);

-- Note: The application code will handle inserting the initial record with the correct EST date
-- This avoids SQL Server version compatibility issues with time zone conversions

