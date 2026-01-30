-- Migration: Add Fuzzy Search to Trips
-- Description: Adds address/location columns to vehicle_trips and creates a fuzzy search RPC function.

-- 1. Add address/location columns to vehicle_trips if they don't exist
ALTER TABLE public.vehicle_trips
ADD COLUMN IF NOT EXISTS start_location_name TEXT,
ADD COLUMN IF NOT EXISTS end_location_name TEXT,
ADD COLUMN IF NOT EXISTS start_address TEXT,
ADD COLUMN IF NOT EXISTS end_address TEXT,
ADD COLUMN IF NOT EXISTS start_district TEXT,
ADD COLUMN IF NOT EXISTS end_district TEXT,
ADD COLUMN IF NOT EXISTS start_poi_name TEXT,
ADD COLUMN IF NOT EXISTS end_poi_name TEXT;

-- 2. Enable pg_trgm for fuzzy search performance
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 3. Add Trigram Indexes for efficient ILIKE searches
CREATE INDEX IF NOT EXISTS idx_vehicle_trips_start_loc_trgm ON public.vehicle_trips USING GIN (start_location_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_vehicle_trips_end_loc_trgm ON public.vehicle_trips USING GIN (end_location_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_vehicle_trips_start_addr_trgm ON public.vehicle_trips USING GIN (start_address gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_vehicle_trips_end_addr_trgm ON public.vehicle_trips USING GIN (end_address gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_vehicle_trips_start_dist_trgm ON public.vehicle_trips USING GIN (start_district gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_vehicle_trips_end_dist_trgm ON public.vehicle_trips USING GIN (end_district gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_vehicle_trips_start_poi_trgm ON public.vehicle_trips USING GIN (start_poi_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_vehicle_trips_end_poi_trgm ON public.vehicle_trips USING GIN (end_poi_name gin_trgm_ops);

-- 4. Create the fuzzy search function
-- Returns unique location names/addresses that match the query
CREATE OR REPLACE FUNCTION public.search_locations_fuzzy(
    search_query TEXT,
    limit_count INTEGER DEFAULT 10
)
RETURNS TABLE (
    match_text TEXT,
    match_type TEXT -- 'location', 'address', 'district', 'poi'
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    WITH all_matches AS (
        -- Location Names
        SELECT start_location_name as txt, 'location' as typ FROM public.vehicle_trips WHERE start_location_name ILIKE '%' || search_query || '%'
        UNION ALL
        SELECT end_location_name as txt, 'location' as typ FROM public.vehicle_trips WHERE end_location_name ILIKE '%' || search_query || '%'
        
        UNION ALL
        
        -- Addresses
        SELECT start_address as txt, 'address' as typ FROM public.vehicle_trips WHERE start_address ILIKE '%' || search_query || '%'
        UNION ALL
        SELECT end_address as txt, 'address' as typ FROM public.vehicle_trips WHERE end_address ILIKE '%' || search_query || '%'
        
        UNION ALL
        
        -- Districts
        SELECT start_district as txt, 'district' as typ FROM public.vehicle_trips WHERE start_district ILIKE '%' || search_query || '%'
        UNION ALL
        SELECT end_district as txt, 'district' as typ FROM public.vehicle_trips WHERE end_district ILIKE '%' || search_query || '%'
        
        UNION ALL
        
        -- POIs
        SELECT start_poi_name as txt, 'poi' as typ FROM public.vehicle_trips WHERE start_poi_name ILIKE '%' || search_query || '%'
        UNION ALL
        SELECT end_poi_name as txt, 'poi' as typ FROM public.vehicle_trips WHERE end_poi_name ILIKE '%' || search_query || '%'
    )
    SELECT DISTINCT txt, typ
    FROM all_matches
    WHERE txt IS NOT NULL
    LIMIT limit_count;
END;
$$;
