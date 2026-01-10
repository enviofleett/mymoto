-- Super Intelligence Layer Migration
-- Enables vector search, trip analytics, and semantic memory

-- Enable the vector extension for pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================
-- PART 1: Trip Analytics Table (with embeddings)
-- ============================================
CREATE TABLE public.trip_analytics (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    trip_id UUID REFERENCES public.vehicle_trips(id) ON DELETE CASCADE,
    device_id TEXT NOT NULL,
    driver_score INTEGER CHECK (driver_score >= 0 AND driver_score <= 100),
    harsh_events JSONB DEFAULT '{}'::jsonb,
    summary_text TEXT,
    weather_data JSONB DEFAULT '{}'::jsonb,
    embedding vector(1536),
    analyzed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Index for efficient vector similarity search
CREATE INDEX trip_analytics_embedding_idx ON public.trip_analytics 
    USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Index for device lookups
CREATE INDEX trip_analytics_device_idx ON public.trip_analytics(device_id);

-- Index for trip lookups
CREATE INDEX trip_analytics_trip_idx ON public.trip_analytics(trip_id);

-- Enable RLS
ALTER TABLE public.trip_analytics ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Authenticated users can read trip analytics" 
    ON public.trip_analytics FOR SELECT 
    USING (true);

CREATE POLICY "Service role can manage trip analytics" 
    ON public.trip_analytics FOR ALL 
    USING (true) 
    WITH CHECK (true);

-- ============================================
-- PART 2: Add embedding column to vehicle_chat_history
-- ============================================
ALTER TABLE public.vehicle_chat_history 
    ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- Index for chat history embeddings
CREATE INDEX IF NOT EXISTS chat_history_embedding_idx ON public.vehicle_chat_history 
    USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Add metadata column for categorizing messages
ALTER TABLE public.vehicle_chat_history 
    ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- ============================================
-- PART 3: Enhanced trip_patterns table (add missing columns)
-- ============================================
-- Add origin/destination location IDs if not exists
ALTER TABLE public.trip_patterns 
    ADD COLUMN IF NOT EXISTS origin_location_id UUID,
    ADD COLUMN IF NOT EXISTS destination_location_id UUID,
    ADD COLUMN IF NOT EXISTS avg_battery_consumption NUMERIC,
    ADD COLUMN IF NOT EXISTS time_slot TEXT;

-- ============================================
-- PART 4: Semantic Search Functions
-- ============================================

-- Function to match trip analytics by embedding similarity
CREATE OR REPLACE FUNCTION public.match_driving_records(
    query_embedding vector(1536),
    p_device_id TEXT DEFAULT NULL,
    match_threshold FLOAT DEFAULT 0.7,
    match_count INT DEFAULT 5
)
RETURNS TABLE (
    id UUID,
    trip_id UUID,
    device_id TEXT,
    driver_score INTEGER,
    harsh_events JSONB,
    summary_text TEXT,
    weather_data JSONB,
    analyzed_at TIMESTAMP WITH TIME ZONE,
    similarity FLOAT
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ta.id,
        ta.trip_id,
        ta.device_id,
        ta.driver_score,
        ta.harsh_events,
        ta.summary_text,
        ta.weather_data,
        ta.analyzed_at,
        1 - (ta.embedding <=> query_embedding) AS similarity
    FROM trip_analytics ta
    WHERE ta.embedding IS NOT NULL
        AND (p_device_id IS NULL OR ta.device_id = p_device_id)
        AND 1 - (ta.embedding <=> query_embedding) > match_threshold
    ORDER BY ta.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- Function to match chat history by embedding similarity
CREATE OR REPLACE FUNCTION public.match_chat_memories(
    query_embedding vector(1536),
    p_device_id TEXT DEFAULT NULL,
    p_user_id UUID DEFAULT NULL,
    match_threshold FLOAT DEFAULT 0.7,
    match_count INT DEFAULT 5
)
RETURNS TABLE (
    id UUID,
    device_id TEXT,
    role TEXT,
    content TEXT,
    created_at TIMESTAMP WITH TIME ZONE,
    similarity FLOAT
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        vch.id,
        vch.device_id,
        vch.role,
        vch.content,
        vch.created_at,
        1 - (vch.embedding <=> query_embedding) AS similarity
    FROM vehicle_chat_history vch
    WHERE vch.embedding IS NOT NULL
        AND (p_device_id IS NULL OR vch.device_id = p_device_id)
        AND (p_user_id IS NULL OR vch.user_id = p_user_id)
        AND 1 - (vch.embedding <=> query_embedding) > match_threshold
    ORDER BY vch.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- Function to get latest trip analytics for a device
CREATE OR REPLACE FUNCTION public.get_latest_driver_score(p_device_id TEXT)
RETURNS TABLE (
    driver_score INTEGER,
    harsh_braking_count INTEGER,
    harsh_acceleration_count INTEGER,
    recent_trend TEXT,
    trips_analyzed INTEGER
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
    latest_score INTEGER;
    avg_recent_score NUMERIC;
    total_trips INTEGER;
    total_harsh_braking INTEGER := 0;
    total_harsh_accel INTEGER := 0;
BEGIN
    -- Get latest score
    SELECT ta.driver_score INTO latest_score
    FROM trip_analytics ta
    WHERE ta.device_id = p_device_id
    ORDER BY ta.analyzed_at DESC
    LIMIT 1;
    
    -- Get average of last 10 trips
    SELECT 
        AVG(ta.driver_score),
        COUNT(*),
        COALESCE(SUM((ta.harsh_events->>'harsh_braking')::INTEGER), 0),
        COALESCE(SUM((ta.harsh_events->>'harsh_acceleration')::INTEGER), 0)
    INTO avg_recent_score, total_trips, total_harsh_braking, total_harsh_accel
    FROM (
        SELECT * FROM trip_analytics
        WHERE device_id = p_device_id
        ORDER BY analyzed_at DESC
        LIMIT 10
    ) ta;
    
    RETURN QUERY SELECT
        COALESCE(latest_score, 0) AS driver_score,
        total_harsh_braking AS harsh_braking_count,
        total_harsh_accel AS harsh_acceleration_count,
        CASE 
            WHEN latest_score > avg_recent_score THEN 'improving'
            WHEN latest_score < avg_recent_score THEN 'declining'
            ELSE 'stable'
        END AS recent_trend,
        COALESCE(total_trips::INTEGER, 0) AS trips_analyzed;
END;
$$;

-- ============================================
-- PART 5: Conversation Memory Summarization Support
-- ============================================
CREATE TABLE IF NOT EXISTS public.conversation_summaries (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    device_id TEXT NOT NULL,
    user_id UUID NOT NULL,
    summary_text TEXT NOT NULL,
    key_facts JSONB DEFAULT '[]'::jsonb,
    messages_summarized INTEGER NOT NULL DEFAULT 0,
    period_start TIMESTAMP WITH TIME ZONE NOT NULL,
    period_end TIMESTAMP WITH TIME ZONE NOT NULL,
    embedding vector(1536),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS conv_summaries_device_idx ON public.conversation_summaries(device_id, user_id);
CREATE INDEX IF NOT EXISTS conv_summaries_time_idx ON public.conversation_summaries(period_end DESC);

-- Enable RLS
ALTER TABLE public.conversation_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own summaries" 
    ON public.conversation_summaries FOR SELECT 
    USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage summaries" 
    ON public.conversation_summaries FOR ALL 
    USING (true) 
    WITH CHECK (true);