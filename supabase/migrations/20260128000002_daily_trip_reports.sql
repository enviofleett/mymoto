
-- 1. Daily Trip Reports Table
CREATE TABLE public.daily_trip_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    report_date DATE NOT NULL,
    vehicle_count INTEGER DEFAULT 0,
    total_distance_km DECIMAL(10, 2) DEFAULT 0,
    total_duration_minutes INTEGER DEFAULT 0,
    total_trips INTEGER DEFAULT 0,
    summary_text TEXT,
    metrics JSONB DEFAULT '{}'::jsonb, -- Store detailed breakdown per vehicle
    email_sent BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Unique constraint to prevent duplicate reports for the same day/user
CREATE UNIQUE INDEX idx_daily_trip_reports_user_date ON public.daily_trip_reports(user_id, report_date);

-- 2. Report Templates Configuration
CREATE TABLE public.report_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    subject_template TEXT NOT NULL DEFAULT 'Daily Trip Report for {{date}}',
    header_text TEXT DEFAULT 'Here is your summary for yesterday.',
    footer_text TEXT DEFAULT 'Drive safely!',
    enabled_components JSONB DEFAULT '["summary", "distance", "duration", "trip_count", "max_speed", "safety_score", "map"]'::jsonb,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_by UUID REFERENCES auth.users(id)
);

-- Insert default template
INSERT INTO public.report_templates (name, is_active)
VALUES ('default', true);

-- 3. RLS Policies

-- Daily Trip Reports
ALTER TABLE public.daily_trip_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own reports"
ON public.daily_trip_reports FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage reports"
ON public.daily_trip_reports FOR ALL
USING (true)
WITH CHECK (true);

-- Report Templates
ALTER TABLE public.report_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Everyone can view active templates"
ON public.report_templates FOR SELECT
USING (true);

CREATE POLICY "Admins can manage templates"
ON public.report_templates FOR ALL
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

-- 4. Function to get daily trip stats for a user
CREATE OR REPLACE FUNCTION public.get_daily_trip_stats(
    p_user_id UUID,
    p_date DATE
)
RETURNS TABLE (
    device_id TEXT,
    device_name TEXT,
    distance_km DECIMAL,
    duration_seconds INTEGER,
    trip_count INTEGER,
    max_speed DECIMAL
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    WITH user_devices AS (
        SELECT v.device_id, v.device_name
        FROM vehicles v
        JOIN vehicle_assignments va ON v.device_id = va.device_id
        JOIN profiles p ON va.profile_id = p.id
        WHERE p.user_id = p_user_id
    ),
    daily_trips AS (
        SELECT 
            t.device_id,
            COALESCE(SUM(t.distance_km), 0) as total_dist,
            COALESCE(SUM(EXTRACT(EPOCH FROM (t.end_time - t.start_time))), 0)::INTEGER as total_dur,
            COUNT(t.id)::INTEGER as trips,
            MAX(t.max_speed) as top_speed
        FROM trips t
        WHERE t.device_id IN (SELECT device_id FROM user_devices)
        AND t.start_time >= p_date::timestamp
        AND t.start_time < (p_date + 1)::timestamp
        GROUP BY t.device_id
    )
    SELECT 
        ud.device_id,
        ud.device_name,
        COALESCE(dt.total_dist, 0) as distance_km,
        COALESCE(dt.total_dur, 0) as duration_seconds,
        COALESCE(dt.trips, 0) as trip_count,
        COALESCE(dt.top_speed, 0) as max_speed
    FROM user_devices ud
    LEFT JOIN daily_trips dt ON ud.device_id = dt.device_id;
END;
$$;
