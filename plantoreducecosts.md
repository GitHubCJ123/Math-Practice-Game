# Database Optimization Plan to Reduce Azure SQL Server Costs

## Issues Identified
- **No connection pooling**: Every API request creates a new connection object, leading to expensive connection overhead.
- **Expensive maintenance queries**: Complex maintenance logic runs on every score submission in `submit-score.ts`.
- **Redundant time zone calculations**: Complex SQL time zone conversions are repeated across multiple endpoints.
- **Potential missing indexes**: Queries filter on `PlayerName`, `OperationType`, and `CreatedAt` without confirmed indexes.
- **No caching**: Static or semi-static data (for example, hall-of-fame dates) is queried on every request.

## Optimization Strategy

### 1. Implement Connection Pooling
- **Files**: Create `api/db-pool.ts` (new file).
- **Actions**:
  - Use `tedious-connection-pool` or the `mssql` package for connection pooling.
  - Configure pool size appropriate for serverless usage (5-10 connections).
  - Reuse connections across requests instead of creating new ones.
- **Impact**: Reduces connection overhead, a major cost driver in Azure SQL.

### 2. Optimize Time Zone Calculations
- **Files**: `api/submit-score.ts` (lines 72-77, 127-130), `api/get-leaderboard.ts` (lines 41-46), `api/check-score.ts` (lines 42-47), `api/archive-scores.ts` (lines 42-52).
- **Approach**:
  - Option A: Create a SQL function or stored procedure for time zone calculations.
  - Option B: Calculate time boundaries in JavaScript and pass them as parameters.
- **Impact**: Reduces CPU-intensive calculations on every request, lowering per-query CPU usage.

### 3. Move Maintenance to a Background Job
- **File**: `api/submit-score.ts` (lines 125-201).
- **Actions**:
  - Remove the `runMaintenance()` call from the score submission flow.
  - Move maintenance logic to the `archive-scores.ts` cron job.
  - Ensure the transaction for score updates/inserts excludes maintenance work.
- **Impact**: Eliminates expensive maintenance queries from a high-frequency endpoint.

### 4. Add Database Indexes
- **Deliverable**: Create a migration script or SQL file.
- **SQL**:

```sql
-- Indexes for LeaderboardScores table
CREATE NONCLUSTERED INDEX IX_LeaderboardScores_OperationType_CreatedAt
  ON LeaderboardScores(OperationType, CreatedAt DESC);

CREATE NONCLUSTERED INDEX IX_LeaderboardScores_PlayerName_OperationType
  ON LeaderboardScores(PlayerName, OperationType)
  INCLUDE (Score, CreatedAt);

-- Index for HallOfFame table
CREATE NONCLUSTERED INDEX IX_HallOfFame_OperationType_Year_Month
  ON HallOfFame(OperationType, Year DESC, Month DESC);
```

- **Impact**: Provides faster query execution and lower CPU usage.

### 5. Implement Response Caching
- **Files**: `api/get-hall-of-fame-dates.ts`, `api/submit-score.ts`, `api/archive-scores.ts`, `components/Leaderboard.tsx`.
- **Actions**:
  - Add HTTP cache headers (`Cache-Control: public, max-age=300`).
  - Cache results in memory for serverless functions, but invalidate the cache whenever a new leaderboard score is submitted or maintenance runs so fresh data appears immediately.
  - Update the leaderboard UI copy to reassure players that scores refresh right after submissions (no countdown needed).
- **Impact**: Reduces database queries for rarely changing data while making score updates feel instantaneous to users.

### 6. Optimize Query Patterns
- **File**: `api/submit-score.ts` (lines 71-89).
- **Actions**:
  - Simplify the check query to fetch only the current month record.
  - Remove unnecessary `ORDER BY` clauses when checking for an existing record.
- **Impact**: Improves query performance and reduces execution time.

## Implementation Order
1. Add connection pooling (`api/db-pool.ts`).
2. Update all endpoints to use the connection pool.
3. Move maintenance logic out of `submit-score`.
4. Optimize time zone calculations.
5. Add database indexes (requires manual SQL execution).
6. Add caching for static endpoints.

## Files to Modify
- `api/db-pool.ts` (new).
- `api/submit-score.ts`.
- `api/get-leaderboard.ts`.
- `api/get-hall-of-fame.ts`.
- `api/get-hall-of-fame-dates.ts`.
- `api/submit-score.ts`.
- `api/archive-scores.ts`.
- `components/Leaderboard.tsx`.
- `api/check-score.ts`.
- `api/archive-scores.ts`.
- `package.json` (add connection pool dependency).
- `migrations/add-indexes.sql` (new, for manual execution).

## Expected Cost Reduction
- Connection pooling: 60-80% reduction in connection overhead.
- Removing maintenance from `submit-score`: 30-50% reduction in query complexity for a high-frequency endpoint.
- Time zone optimization: 10-20% reduction in CPU per query.
- Indexes: 40-60% faster query execution.
- Caching: 90%+ reduction in queries for cached endpoints.
- **Total estimated cost reduction**: 40-60%.

## Questions Before Implementation
1. Can you execute SQL migrations manually on your Azure SQL Server, or should I include instructions?
2. Do you prefer `tedious-connection-pool` or the `mssql` package for connection pooling? (`mssql` is more feature-rich but larger.)
3. Should maintenance run only in the cron job, or would you like a separate maintenance endpoint for manual triggers?

