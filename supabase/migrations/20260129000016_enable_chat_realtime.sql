-- Migration: Enable Realtime for Chat History
-- Description: Ensures vehicle_chat_history is exposed via Supabase Realtime for live updates.

-- 1. Enable Replica Identity Full (optional but good for realtime deletes/updates)
ALTER TABLE public.vehicle_chat_history REPLICA IDENTITY FULL;

-- 2. Add table to supabase_realtime publication
-- We use DO block to avoid error if it's already added
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
    AND schemaname = 'public'
    AND tablename = 'vehicle_chat_history'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.vehicle_chat_history;
  END IF;
END $$;
