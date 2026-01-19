-- Set Database Timezone to Lagos (Africa/Lagos)
-- Run this to ensure all database operations use Lagos timezone

-- ============================================================================
-- STEP 1: Set session timezone (for current connection)
-- ============================================================================
SET timezone = 'Africa/Lagos';

-- ============================================================================
-- STEP 2: Set default timezone for database (persistent)
-- ============================================================================
ALTER DATABASE CURRENT_DATABASE SET timezone = 'Africa/Lagos';

-- Note: Replace CURRENT_DATABASE with your actual database name
-- Or run this in Supabase SQL Editor (it will use the current database)

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
