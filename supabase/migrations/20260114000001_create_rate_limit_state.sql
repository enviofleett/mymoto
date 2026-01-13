-- Create app_settings entry for GPS51 rate limit state
-- This allows centralized rate limiting across all function instances

-- The rate limit state will be managed by the shared GPS51 client
-- No need to create a separate table, we'll use app_settings

-- Ensure app_settings table exists (should already exist)
-- This migration just documents the rate limit state key

COMMENT ON TABLE app_settings IS 'Stores application settings including GPS51 rate limit state (key: gps51_rate_limit_state)';

-- The rate limit state JSON structure:
-- {
--   "backoff_until": 1234567890,  // Timestamp when backoff period ends
--   "last_call_time": 1234567890, // Timestamp of last API call
--   "updated_at": "2026-01-14T..." // ISO timestamp
-- }
