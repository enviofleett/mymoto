-- Migration: Create vehicle_documents table and matching function
-- Description: Fixes the missing match_vehicle_documents function error in vehicle-chat

-- 1. Create the table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.vehicle_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_id TEXT, -- Can be null if document applies to all vehicles (e.g. generic manual), or specific
    content TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    embedding vector(1536),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 2. Enable RLS
ALTER TABLE public.vehicle_documents ENABLE ROW LEVEL SECURITY;

-- 3. Create policies (basic ones)
-- Drop existing policy if it exists to avoid errors on retry
DROP POLICY IF EXISTS "Allow read access to authenticated users" ON public.vehicle_documents;

CREATE POLICY "Allow read access to authenticated users"
    ON public.vehicle_documents
    FOR SELECT
    TO authenticated
    USING (true);

-- 4. Create the matching function
CREATE OR REPLACE FUNCTION public.match_vehicle_documents(
    vehicle_id TEXT,
    query_embedding vector(1536),
    match_threshold FLOAT DEFAULT 0.7,
    match_count INT DEFAULT 5
)
RETURNS TABLE (
    id UUID,
    content TEXT,
    metadata JSONB,
    similarity FLOAT
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
    RETURN QUERY
    SELECT
        vd.id,
        vd.content,
        vd.metadata,
        1 - (vd.embedding <=> query_embedding) AS similarity
    FROM vehicle_documents vd
    WHERE 1 - (vd.embedding <=> query_embedding) > match_threshold
    AND (
        vd.vehicle_id IS NULL -- Generic documents
        OR vd.vehicle_id = match_vehicle_documents.vehicle_id -- Specific to this vehicle
    )
    ORDER BY vd.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;
