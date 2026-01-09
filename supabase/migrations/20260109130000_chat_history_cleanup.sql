-- Chat History Cleanup System
-- Automatically prunes old messages to prevent token overflow and database bloat

-- Function to clean up old chat history (keeps last 100 messages per vehicle)
CREATE OR REPLACE FUNCTION cleanup_old_chat_history()
RETURNS TABLE (
  device_id TEXT,
  messages_deleted BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH messages_to_keep AS (
    -- For each device, keep only the 100 most recent messages
    SELECT DISTINCT ON (vch.device_id)
      vch.device_id,
      vch.id AS cutoff_id
    FROM vehicle_chat_history vch
    INNER JOIN (
      SELECT
        device_id,
        id,
        ROW_NUMBER() OVER (PARTITION BY device_id ORDER BY created_at DESC) AS row_num
      FROM vehicle_chat_history
    ) ranked ON vch.id = ranked.id
    WHERE ranked.row_num = 100
  ),
  deleted_messages AS (
    DELETE FROM vehicle_chat_history vch
    WHERE EXISTS (
      -- Delete messages older than the 100th most recent message
      SELECT 1 FROM messages_to_keep mtk
      WHERE mtk.device_id = vch.device_id
      AND vch.created_at < (
        SELECT created_at
        FROM vehicle_chat_history
        WHERE id = mtk.cutoff_id
      )
    )
    RETURNING vch.device_id
  )
  SELECT
    dm.device_id,
    COUNT(*) AS messages_deleted
  FROM deleted_messages dm
  GROUP BY dm.device_id;
END;
$$;

-- Grant execute permission to authenticated users (admins can run manually)
GRANT EXECUTE ON FUNCTION cleanup_old_chat_history() TO authenticated;

-- Comment for documentation
COMMENT ON FUNCTION cleanup_old_chat_history() IS 'Cleans up old chat history, keeping only the 100 most recent messages per vehicle. Returns the number of messages deleted per device.';

-- Optional: Create an index to speed up cleanup operations
CREATE INDEX IF NOT EXISTS idx_vehicle_chat_history_device_created
ON vehicle_chat_history(device_id, created_at DESC);

-- Optional: Function to get chat history statistics
CREATE OR REPLACE FUNCTION get_chat_history_stats()
RETURNS TABLE (
  device_id TEXT,
  total_messages BIGINT,
  oldest_message TIMESTAMP WITH TIME ZONE,
  newest_message TIMESTAMP WITH TIME ZONE,
  estimated_tokens INTEGER
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    vch.device_id,
    COUNT(*) AS total_messages,
    MIN(vch.created_at) AS oldest_message,
    MAX(vch.created_at) AS newest_message,
    -- Rough token estimate: ~1.3 tokens per character on average
    (SUM(LENGTH(vch.content)) * 1.3)::INTEGER AS estimated_tokens
  FROM vehicle_chat_history vch
  GROUP BY vch.device_id
  ORDER BY total_messages DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_chat_history_stats() TO authenticated;

COMMENT ON FUNCTION get_chat_history_stats() IS 'Returns statistics about chat history per vehicle including message counts and estimated token usage.';

-- Create a table to track cleanup runs (for monitoring)
CREATE TABLE IF NOT EXISTS public.chat_cleanup_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cleanup_time TIMESTAMP WITH TIME ZONE DEFAULT now(),
  total_devices_cleaned INTEGER,
  total_messages_deleted BIGINT,
  execution_duration_ms INTEGER
);

-- Enable RLS on cleanup log
ALTER TABLE public.chat_cleanup_log ENABLE ROW LEVEL SECURITY;

-- Only admins can view cleanup logs
CREATE POLICY "Admins can view cleanup logs"
ON public.chat_cleanup_log FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Function to run cleanup and log results
CREATE OR REPLACE FUNCTION run_scheduled_chat_cleanup()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  start_time TIMESTAMP;
  end_time TIMESTAMP;
  total_deleted BIGINT := 0;
  device_count INTEGER := 0;
BEGIN
  start_time := clock_timestamp();

  -- Run cleanup and aggregate results
  WITH cleanup_results AS (
    SELECT * FROM cleanup_old_chat_history()
  )
  SELECT
    COUNT(DISTINCT device_id),
    COALESCE(SUM(messages_deleted), 0)
  INTO device_count, total_deleted
  FROM cleanup_results;

  end_time := clock_timestamp();

  -- Log the cleanup run
  INSERT INTO public.chat_cleanup_log (
    cleanup_time,
    total_devices_cleaned,
    total_messages_deleted,
    execution_duration_ms
  ) VALUES (
    start_time,
    device_count,
    total_deleted,
    EXTRACT(MILLISECONDS FROM (end_time - start_time))::INTEGER
  );

  RAISE NOTICE 'Chat cleanup completed: % messages deleted from % devices in % ms',
    total_deleted, device_count, EXTRACT(MILLISECONDS FROM (end_time - start_time))::INTEGER;
END;
$$;

GRANT EXECUTE ON FUNCTION run_scheduled_chat_cleanup() TO service_role;

COMMENT ON FUNCTION run_scheduled_chat_cleanup() IS 'Runs the scheduled chat cleanup and logs the results. Designed to be called by pg_cron or similar scheduling system.';

-- Note: pg_cron scheduling should be configured separately via Supabase Dashboard
-- Example cron schedule (run daily at 2 AM UTC):
-- SELECT cron.schedule(
--   'chat-history-cleanup',
--   '0 2 * * *',
--   $$SELECT run_scheduled_chat_cleanup()$$
-- );

-- Manual cleanup trigger (admins can call this via SQL editor or API)
COMMENT ON FUNCTION cleanup_old_chat_history() IS
'MANUAL USAGE: SELECT * FROM cleanup_old_chat_history(); -- Returns devices and messages deleted
SCHEDULED USAGE: Configured via pg_cron to run daily at 2 AM UTC';
