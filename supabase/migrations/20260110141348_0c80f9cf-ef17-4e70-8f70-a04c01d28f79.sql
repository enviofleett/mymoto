-- Make user_id nullable in vehicle_chat_history to support anonymous/test queries
ALTER TABLE public.vehicle_chat_history 
ALTER COLUMN user_id DROP NOT NULL;

-- Add a comment explaining the change
COMMENT ON COLUMN public.vehicle_chat_history.user_id IS 'User ID - nullable to support anonymous queries and system-generated messages';