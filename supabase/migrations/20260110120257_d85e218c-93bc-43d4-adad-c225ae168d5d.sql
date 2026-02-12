DROP VIEW IF EXISTS public.vehicle_trips;
DROP TABLE IF EXISTS public.vehicle_trips;
CREATE TABLE public.vehicle_trips (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  device_id TEXT NOT NULL,
  start_time TIMESTAMP WITH TIME ZONE NOT NULL,
  end_time TIMESTAMP WITH TIME ZONE NOT NULL,
  start_latitude DOUBLE PRECISION NOT NULL,
  start_longitude DOUBLE PRECISION NOT NULL,
  end_latitude DOUBLE PRECISION NOT NULL,
  end_longitude DOUBLE PRECISION NOT NULL,
  distance_km DOUBLE PRECISION NOT NULL DEFAULT 0,
  max_speed DOUBLE PRECISION,
  avg_speed DOUBLE PRECISION,
  duration_seconds INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create indexes for efficient querying
CREATE INDEX idx_vehicle_trips_device_id ON public.vehicle_trips(device_id);
CREATE INDEX idx_vehicle_trips_start_time ON public.vehicle_trips(start_time DESC);
CREATE INDEX idx_vehicle_trips_device_date ON public.vehicle_trips(device_id, start_time DESC);

-- Enable RLS
ALTER TABLE public.vehicle_trips ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Authenticated users can read trips"
ON public.vehicle_trips
FOR SELECT
USING (true);

CREATE POLICY "Service role can manage trips"
ON public.vehicle_trips
FOR ALL
USING (true)
WITH CHECK (true);

-- Create RPC function to get mileage stats for a vehicle
CREATE OR REPLACE FUNCTION public.get_vehicle_mileage_stats(p_device_id TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSON;
  today_start TIMESTAMP WITH TIME ZONE;
  week_start TIMESTAMP WITH TIME ZONE;
  month_start TIMESTAMP WITH TIME ZONE;
BEGIN
  today_start := date_trunc('day', now());
  week_start := date_trunc('day', now() - INTERVAL '7 days');
  month_start := date_trunc('day', now() - INTERVAL '30 days');
  
  SELECT json_build_object(
    'today', COALESCE((
      SELECT SUM(distance_km) FROM vehicle_trips 
      WHERE device_id = p_device_id AND start_time >= today_start
    ), 0),
    'week', COALESCE((
      SELECT SUM(distance_km) FROM vehicle_trips 
      WHERE device_id = p_device_id AND start_time >= week_start
    ), 0),
    'month', COALESCE((
      SELECT SUM(distance_km) FROM vehicle_trips 
      WHERE device_id = p_device_id AND start_time >= month_start
    ), 0),
    'trips_today', COALESCE((
      SELECT COUNT(*) FROM vehicle_trips 
      WHERE device_id = p_device_id AND start_time >= today_start
    ), 0),
    'trips_week', COALESCE((
      SELECT COUNT(*) FROM vehicle_trips 
      WHERE device_id = p_device_id AND start_time >= week_start
    ), 0)
  ) INTO result;
  
  RETURN result;
END;
$$;

-- Create RPC function to get daily mileage for charts (last 7 days)
CREATE OR REPLACE FUNCTION public.get_daily_mileage(p_device_id TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_agg(
    json_build_object(
      'day', to_char(d.date, 'Dy'),
      'date', d.date::DATE,
      'distance', COALESCE(t.distance, 0),
      'trips', COALESCE(t.trip_count, 0)
    ) ORDER BY d.date
  ) INTO result
  FROM (
    SELECT generate_series(
      date_trunc('day', now() - INTERVAL '6 days'),
      date_trunc('day', now()),
      INTERVAL '1 day'
    )::DATE AS date
  ) d
  LEFT JOIN (
    SELECT 
      date_trunc('day', start_time)::DATE AS day,
      SUM(distance_km) AS distance,
      COUNT(*) AS trip_count
    FROM vehicle_trips
    WHERE device_id = p_device_id
      AND start_time >= date_trunc('day', now() - INTERVAL '6 days')
    GROUP BY date_trunc('day', start_time)::DATE
  ) t ON d.date = t.day;
  
  RETURN COALESCE(result, '[]'::JSON);
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.get_vehicle_mileage_stats(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_daily_mileage(TEXT) TO authenticated;
