-- Drop the view that was causing security warnings (implicit owner privileges)
DROP VIEW IF EXISTS public.provider_stats_view;

-- Create a secure function to access the stats
-- This function runs with SECURITY DEFINER to bypass RLS on provider_ratings
-- while only exposing the aggregated data
CREATE OR REPLACE FUNCTION public.get_provider_stats()
RETURNS TABLE (
    provider_id UUID,
    review_count INTEGER,
    avg_rating FLOAT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        provider_id,
        COUNT(*)::INTEGER as review_count,
        ROUND(AVG(rating), 1)::FLOAT as avg_rating
    FROM public.provider_ratings
    GROUP BY provider_id;
$$;

-- Grant access to the function
GRANT EXECUTE ON FUNCTION public.get_provider_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_provider_stats() TO anon;

COMMENT ON FUNCTION public.get_provider_stats() IS 'Securely aggregates provider ratings statistics';
