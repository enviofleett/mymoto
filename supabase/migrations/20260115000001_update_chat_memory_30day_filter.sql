-- Update match_chat_memories function to filter by 30 days
-- Ensures semantic memory search only returns conversations from last 30 days

CREATE OR REPLACE FUNCTION public.match_chat_memories(
    query_embedding vector(1536),
    p_device_id TEXT DEFAULT NULL,
    p_user_id UUID DEFAULT NULL,
    match_threshold FLOAT DEFAULT 0.5,
    match_count INT DEFAULT 8
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
        AND vch.created_at >= NOW() - INTERVAL '30 days'  -- ✅ Add 30-day filter
        AND 1 - (vch.embedding <=> query_embedding) > match_threshold
    ORDER BY vch.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- Add comment for documentation
COMMENT ON FUNCTION public.match_chat_memories IS 'Searches chat history using semantic similarity, returning only conversations from the last 30 days. This ensures the AI only references recent conversations as per the memory requirement.';
