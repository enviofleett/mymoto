-- Create a table for vehicle chat history
CREATE TABLE public.vehicle_chat_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id TEXT NOT NULL,
    user_id UUID NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.vehicle_chat_history ENABLE ROW LEVEL SECURITY;

-- Users can view chat history for vehicles
CREATE POLICY "Users can view chat history"
ON public.vehicle_chat_history FOR SELECT
TO authenticated
USING (true);

-- Users can insert their own messages
CREATE POLICY "Users can insert messages"
ON public.vehicle_chat_history FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Service role can manage all chat history
CREATE POLICY "Service role can manage chat history"
ON public.vehicle_chat_history FOR ALL
USING (true)
WITH CHECK (true);

-- Index for faster context retrieval
CREATE INDEX idx_vehicle_chat_device_time ON public.vehicle_chat_history(device_id, created_at DESC);