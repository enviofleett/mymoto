-- ============================================================================
-- Disk I/O Optimization: Add Missing Indexes
-- ============================================================================
-- These indexes will significantly reduce query I/O by enabling faster lookups
-- All indexes use IF NOT EXISTS to be idempotent (safe to run multiple times)
-- 
-- Expected Impact:
-- - 40-60% faster queries on indexed columns
-- - Reduced I/O operations per query
-- - Better query plan optimization
-- ============================================================================

-- 1. Chat history 30-day queries (for conversation context)
-- Used by: buildConversationContext() in conversation-manager.ts
-- Note: Cannot use NOW() in index predicate (not immutable), so we create a regular index
-- The 30-day filter will be applied in the query itself, and this index will still optimize it
CREATE INDEX IF NOT EXISTS idx_chat_history_device_created_30day 
ON vehicle_chat_history(device_id, created_at DESC);

-- 2. Unread alerts count (for dashboard header)
-- Used by: DashboardHeader component
-- Partial index for unread events only (smaller, faster)
CREATE INDEX IF NOT EXISTS idx_events_unread_count 
ON proactive_vehicle_events(acknowledged, created_at) 
WHERE acknowledged = false;

-- 3. Trip date range queries (for vehicle profile)
-- Used by: useVehicleTrips hook
-- Optimizes queries filtering by device_id and date ranges
CREATE INDEX IF NOT EXISTS idx_trips_device_date_range 
ON vehicle_trips(device_id, start_time DESC, end_time DESC);

-- 4. Position history device queries (optimize existing)
-- Used by: Multiple hooks and edge functions
-- Optimizes position history lookups by device and time
CREATE INDEX IF NOT EXISTS idx_position_history_device_gps_time 
ON position_history(device_id, gps_time DESC);

-- 5. Vehicle positions device lookup (if not exists)
-- Used by: All vehicle data hooks
-- Optimizes single vehicle position lookups
CREATE INDEX IF NOT EXISTS idx_vehicle_positions_device_id 
ON vehicle_positions(device_id);

-- 6. Trip sync status lookups
-- Used by: useTripSyncStatus hook
-- Optimizes sync status queries by device
CREATE INDEX IF NOT EXISTS idx_trip_sync_status_device 
ON trip_sync_status(device_id, updated_at DESC);

-- 7. Vehicle assignments device lookup
-- Used by: useOwnerVehicles hook
-- Optimizes vehicle assignment queries
CREATE INDEX IF NOT EXISTS idx_vehicle_assignments_user_device 
ON vehicle_assignments(device_id);

-- 8. Proactive events device and date
-- Used by: ProactiveNotifications component
-- Optimizes event queries by device and creation date
CREATE INDEX IF NOT EXISTS idx_proactive_events_device_created 
ON proactive_vehicle_events(device_id, created_at DESC);

-- 9. Vehicle LLM settings device lookup
-- Used by: vehicle-chat edge function
-- Optimizes LLM settings lookups (frequently accessed)
CREATE INDEX IF NOT EXISTS idx_vehicle_llm_settings_device 
ON vehicle_llm_settings(device_id);

-- 10. Trip analytics device and date
-- Used by: vehicle-chat edge function (30-day analytics)
-- Optimizes trip analytics queries by device and analysis date
CREATE INDEX IF NOT EXISTS idx_trip_analytics_device_analyzed 
ON trip_analytics(device_id, analyzed_at DESC);

-- ============================================================================
-- Index Documentation Comments
-- ============================================================================
COMMENT ON INDEX idx_chat_history_device_created_30day IS 
'Optimizes 30-day conversation context queries by device and creation date';

COMMENT ON INDEX idx_events_unread_count IS 
'Speeds up unread alert count queries (partial index for acknowledged=false only)';

COMMENT ON INDEX idx_trips_device_date_range IS 
'Optimizes trip date range queries by device, start time, and end time';

COMMENT ON INDEX idx_position_history_device_gps_time IS 
'Speeds up position history lookups by device and GPS timestamp';

COMMENT ON INDEX idx_vehicle_positions_device_id IS 
'Optimizes single vehicle position lookups by device ID';

COMMENT ON INDEX idx_trip_sync_status_device IS 
'Optimizes sync status queries by device and update timestamp';

COMMENT ON INDEX idx_vehicle_assignments_user_device IS 
'Optimizes vehicle assignment queries by device ID';

COMMENT ON INDEX idx_proactive_events_device_created IS 
'Speeds up event queries by device and creation date';

COMMENT ON INDEX idx_vehicle_llm_settings_device IS 
'Optimizes LLM settings lookups by device ID (frequently accessed in chat)';

COMMENT ON INDEX idx_trip_analytics_device_analyzed IS 
'Optimizes trip analytics queries by device and analysis date';

-- ============================================================================
-- Verification Query (Optional - run after migration to verify indexes)
-- ============================================================================
-- Uncomment the following to verify all indexes were created:
--
-- SELECT 
--   schemaname,
--   tablename,
--   indexname,
--   indexdef
-- FROM pg_indexes
-- WHERE indexname LIKE 'idx_%'
--   AND schemaname = 'public'
--   AND indexname IN (
--     'idx_chat_history_device_created_30day',
--     'idx_events_unread_count',
--     'idx_trips_device_date_range',
--     'idx_position_history_device_gps_time',
--     'idx_vehicle_positions_device_id',
--     'idx_trip_sync_status_device',
--     'idx_vehicle_assignments_user_device',
--     'idx_proactive_events_device_created',
--     'idx_vehicle_llm_settings_device',
--     'idx_trip_analytics_device_analyzed'
--   )
-- ORDER BY tablename, indexname;
-- ============================================================================
