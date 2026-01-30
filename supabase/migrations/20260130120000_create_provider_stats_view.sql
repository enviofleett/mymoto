-- Create a view to aggregate provider ratings
CREATE OR REPLACE VIEW public.provider_stats_view AS
SELECT
    provider_id,
    COUNT(*) as review_count,
    ROUND(AVG(rating), 1) as avg_rating
FROM public.provider_ratings
GROUP BY provider_id;

-- Grant access to authenticated users and anon (if directory is public)
GRANT SELECT ON public.provider_stats_view TO authenticated;
GRANT SELECT ON public.provider_stats_view TO anon;

-- Comment
COMMENT ON VIEW public.provider_stats_view IS 'Aggregated rating statistics for service providers';
