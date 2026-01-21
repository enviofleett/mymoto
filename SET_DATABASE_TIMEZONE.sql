-- Set Database Timezone to Lagos (Africa/Lagos)
-- Run this to ensure all database operations use Lagos timezone

-- ============================================================================
-- STEP 1: Set session timezone (for current connection)
-- ============================================================================
SET timezone = 'Africa/Lagos';

-- ============================================================================
-- STEP 2: Verify database name (for reference only)
-- ============================================================================
-- Note: In Supabase, the session-level SET (Step 1) is sufficient for queries.
-- Database-level timezone is managed by Supabase infrastructure.
-- 
-- To see your current database name (for reference):
SELECT current_database() as database_name;

-- ============================================================================
-- STEP 3: Verify timezone is set
-- ============================================================================
SHOW timezone;

-- Should return: Africa/Lagos

-- ============================================================================
-- STEP 4: Test Lagos timezone conversion
-- ============================================================================
SELECT 
  NOW() as current_utc,
  NOW() AT TIME ZONE 'UTC' as utc_explicit,
  NOW() AT TIME ZONE 'Africa/Lagos' as lagos_time,
  CURRENT_TIMESTAMP as current_timestamp;

-- ============================================================================
-- STEP 5: Update all timestamp defaults to use Lagos timezone
-- ============================================================================
-- Note: This is informational - most tables already use TIMESTAMP WITH TIME ZONE
-- which stores in UTC and converts on display. The timezone setting above
-- ensures NOW() and CURRENT_TIMESTAMP use Lagos timezone.
