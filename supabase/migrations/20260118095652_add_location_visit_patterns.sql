-- Location Visit Patterns
-- Tracks multiple time-of-day patterns (morning, afternoon, evening, night) per learned location
-- Enables users to query "Where do I go in the mornings?" with accurate answers

-- Ensure dependencies exist (learned_locations and parking_sessions tables)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'learned_locations'
  ) THEN
    RAISE EXCEPTION 'Dependency missing: learned_locations table does not exist. Please run migration 20260109140000_learned_locations.sql first.';
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'parking_sessions'
  ) THEN
    RAISE EXCEPTION 'Dependency missing: parking_sessions table does not exist. Please run migration 20260109140500_location_learning_triggers.sql first.';
  END IF;
END $$;

-- Create location_visit_patterns table (idempotent)
CREATE TABLE IF NOT EXISTS public.location_visit_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  learned_location_id UUID NOT NULL REFERENCES learned_locations(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  
  -- Time bucket (morning, afternoon, evening, night)
  time_of_day TEXT NOT NULL CHECK (time_of_day IN ('morning', 'afternoon', 'evening', 'night')),
  
  -- Statistics for this time slot
  visit_count INTEGER DEFAULT 1,
  avg_duration_minutes INTEGER,
  typical_hour INTEGER CHECK (typical_hour >= 0 AND typical_hour <= 23),
  
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  -- Ensure one pattern per location per time bucket
  UNIQUE(learned_location_id, time_of_day)
);

-- Indexes for fast lookups
CREATE INDEX idx_location_patterns_location ON location_visit_patterns(learned_location_id);
CREATE INDEX idx_location_patterns_device ON location_visit_patterns(device_id);
CREATE INDEX idx_location_patterns_time ON location_visit_patterns(time_of_day);

-- Enable RLS
ALTER TABLE public.location_visit_patterns ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view location visit patterns"
ON public.location_visit_patterns FOR SELECT
USING (true);

CREATE POLICY "Admins can manage location visit patterns"
ON public.location_visit_patterns FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Function to update visit patterns when parking session is linked to learned location
CREATE OR REPLACE FUNCTION update_visit_patterns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  hour_val INTEGER;
  time_slot TEXT;
  duration_min INTEGER;
BEGIN
  -- Only process if learned_location_id is set
  IF NEW.learned_location_id IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Extract hour from start_time
  hour_val := EXTRACT(HOUR FROM NEW.start_time);
  
  -- Determine time bucket based on hour
  IF hour_val BETWEEN 5 AND 11 THEN
    time_slot := 'morning';
  ELSIF hour_val BETWEEN 12 AND 16 THEN
    time_slot := 'afternoon';
  ELSIF hour_val BETWEEN 17 AND 21 THEN
    time_slot := 'evening';
  ELSE
    time_slot := 'night';
  END IF;
  
  -- Get duration if available
  duration_min := NEW.duration_minutes;
  
  -- Insert or update pattern
  INSERT INTO location_visit_patterns (
    learned_location_id,
    device_id,
    time_of_day,
    visit_count,
    avg_duration_minutes,
    typical_hour
  )
  VALUES (
    NEW.learned_location_id,
    NEW.device_id,
    time_slot,
    1,
    duration_min,
    hour_val
  )
  ON CONFLICT (learned_location_id, time_of_day)
  DO UPDATE SET
    visit_count = location_visit_patterns.visit_count + 1,
    -- Weighted average for typical_hour (using visit_count as weight)
    typical_hour = (
      (location_visit_patterns.typical_hour * location_visit_patterns.visit_count + EXCLUDED.typical_hour)::DECIMAL /
      (location_visit_patterns.visit_count + 1)::DECIMAL
    )::INTEGER,
    -- Weighted average for avg_duration_minutes (only if duration available)
    avg_duration_minutes = CASE
      WHEN EXCLUDED.avg_duration_minutes IS NOT NULL THEN
        (
          (COALESCE(location_visit_patterns.avg_duration_minutes, 0) * location_visit_patterns.visit_count + EXCLUDED.avg_duration_minutes)::DECIMAL /
          (location_visit_patterns.visit_count + 1)::DECIMAL
        )::INTEGER
      ELSE
        location_visit_patterns.avg_duration_minutes
    END,
    updated_at = now();
  
  RETURN NEW;
END;
$$;

-- Trigger: Update patterns whenever a parking session is linked to a learned location
CREATE TRIGGER track_visit_patterns
AFTER UPDATE OF learned_location_id ON parking_sessions
FOR EACH ROW
WHEN (NEW.learned_location_id IS NOT NULL)
EXECUTE FUNCTION update_visit_patterns();

-- Function to get location patterns context for AI
CREATE OR REPLACE FUNCTION get_location_patterns_context(p_location_id UUID)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_agg(
    json_build_object(
      'time_of_day', lvp.time_of_day,
      'visit_count', lvp.visit_count,
      'typical_hour', lvp.typical_hour,
      'avg_duration_minutes', lvp.avg_duration_minutes
    )
    ORDER BY lvp.visit_count DESC
  )
  INTO result
  FROM location_visit_patterns lvp
  WHERE lvp.learned_location_id = p_location_id;
  
  RETURN COALESCE(result, '[]'::json);
END;
$$;

GRANT EXECUTE ON FUNCTION get_location_patterns_context TO authenticated, service_role;

-- Function to backfill patterns from existing parking sessions
CREATE OR REPLACE FUNCTION backfill_location_visit_patterns(p_device_id TEXT DEFAULT NULL)
RETURNS TABLE (
  patterns_created INTEGER,
  sessions_processed INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  parking_rec RECORD;
  hour_val INTEGER;
  time_slot TEXT;
  created_count INTEGER := 0;
  processed_count INTEGER := 0;
BEGIN
  -- Process parking sessions with learned_location_id
  FOR parking_rec IN
    SELECT ps.id, ps.learned_location_id, ps.device_id, ps.start_time, ps.duration_minutes
    FROM parking_sessions ps
    WHERE ps.learned_location_id IS NOT NULL
      AND (p_device_id IS NULL OR ps.device_id = p_device_id)
      AND ps.is_active = false
    ORDER BY ps.start_time DESC
  LOOP
    processed_count := processed_count + 1;
    
    -- Extract hour
    hour_val := EXTRACT(HOUR FROM parking_rec.start_time);
    
    -- Determine time bucket
    IF hour_val BETWEEN 5 AND 11 THEN
      time_slot := 'morning';
    ELSIF hour_val BETWEEN 12 AND 16 THEN
      time_slot := 'afternoon';
    ELSIF hour_val BETWEEN 17 AND 21 THEN
      time_slot := 'evening';
    ELSE
      time_slot := 'night';
    END IF;
    
    -- Insert or update pattern (using same logic as trigger)
    INSERT INTO location_visit_patterns (
      learned_location_id,
      device_id,
      time_of_day,
      visit_count,
      avg_duration_minutes,
      typical_hour
    )
    VALUES (
      parking_rec.learned_location_id,
      parking_rec.device_id,
      time_slot,
      1,
      parking_rec.duration_minutes,
      hour_val
    )
    ON CONFLICT (learned_location_id, time_of_day)
    DO UPDATE SET
      visit_count = location_visit_patterns.visit_count + 1,
      typical_hour = (
        (location_visit_patterns.typical_hour * location_visit_patterns.visit_count + EXCLUDED.typical_hour)::DECIMAL /
        (location_visit_patterns.visit_count + 1)::DECIMAL
      )::INTEGER,
      avg_duration_minutes = CASE
        WHEN EXCLUDED.avg_duration_minutes IS NOT NULL THEN
          (
            (COALESCE(location_visit_patterns.avg_duration_minutes, 0) * location_visit_patterns.visit_count + EXCLUDED.avg_duration_minutes)::DECIMAL /
            (location_visit_patterns.visit_count + 1)::DECIMAL
          )::INTEGER
        ELSE
          location_visit_patterns.avg_duration_minutes
      END,
      updated_at = now();
    
    created_count := created_count + 1;
  END LOOP;
  
  RETURN QUERY SELECT created_count, processed_count;
END;
$$;

GRANT EXECUTE ON FUNCTION backfill_location_visit_patterns TO authenticated, service_role;

-- Update classify_location_type() to use pattern data for better classification
CREATE OR REPLACE FUNCTION classify_location_type(
  p_location_id UUID
)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  location_rec RECORD;
  classified_type TEXT;
  avg_arrival_hour DECIMAL;
  is_overnight BOOLEAN;
  pattern_count INTEGER;
  has_morning_pattern BOOLEAN;
  has_evening_pattern BOOLEAN;
  has_multi_time_pattern BOOLEAN;
BEGIN
  SELECT * INTO location_rec
  FROM learned_locations
  WHERE id = p_location_id;

  IF location_rec.visit_count < 3 THEN
    RETURN 'frequent';
  END IF;

  -- Check for time-of-day patterns (if available)
  SELECT
    COUNT(*) INTO pattern_count
  FROM location_visit_patterns
  WHERE learned_location_id = p_location_id;

  -- Check for specific patterns
  SELECT EXISTS(SELECT 1 FROM location_visit_patterns WHERE learned_location_id = p_location_id AND time_of_day = 'morning')
    INTO has_morning_pattern;
  SELECT EXISTS(SELECT 1 FROM location_visit_patterns WHERE learned_location_id = p_location_id AND time_of_day = 'evening')
    INTO has_evening_pattern;

  has_multi_time_pattern := pattern_count >= 2;

  -- Analyze visit patterns from position_history (fallback/confirmation)
  SELECT
    AVG(EXTRACT(HOUR FROM ph.gps_time)) AS avg_hour,
    COUNT(*) FILTER (WHERE EXTRACT(HOUR FROM ph.gps_time) BETWEEN 22 AND 6) > COUNT(*) * 0.7 AS overnight
  INTO avg_arrival_hour, is_overnight
  FROM position_history ph
  WHERE ph.device_id = location_rec.device_id
    AND ST_DWithin(
      ST_SetSRID(ST_MakePoint(ph.longitude, ph.latitude), 4326)::geography,
      location_rec.center_point,
      location_rec.radius_meters
    )
    AND ph.gps_time >= now() - INTERVAL '30 days';

  -- Enhanced classification logic using pattern data
  -- Multi-time patterns (morning + evening) suggest coffee shop, restaurant, etc.
  IF has_multi_time_pattern AND has_morning_pattern AND has_evening_pattern THEN
    -- Morning + evening patterns suggest frequent visit location (coffee shop, gym, etc.)
    classified_type := 'frequent';
  ELSIF is_overnight AND location_rec.visit_count >= 10 THEN
    classified_type := 'home';
  ELSIF avg_arrival_hour BETWEEN 8 AND 18 AND location_rec.visit_count >= 15 THEN
    classified_type := 'work';
  ELSIF location_rec.total_duration_minutes / NULLIF(location_rec.visit_count, 0) < 30 THEN
    classified_type := 'parking';
  ELSE
    classified_type := 'frequent';
  END IF;

  -- Update the location (keep existing typical_arrival_hour for backward compatibility)
  UPDATE learned_locations
  SET
    location_type = classified_type,
    typical_arrival_hour = avg_arrival_hour::INTEGER,
    confidence_score = LEAST(location_rec.visit_count::DECIMAL / 20, 1.0),
    updated_at = now()
  WHERE id = p_location_id;

  RETURN classified_type;
END;
$$;

GRANT EXECUTE ON FUNCTION classify_location_type TO service_role;

-- Comments
COMMENT ON TABLE location_visit_patterns IS 'Tracks time-of-day visit patterns (morning/afternoon/evening/night) per learned location';
COMMENT ON FUNCTION update_visit_patterns IS 'Automatically creates/updates visit patterns when parking sessions are linked to learned locations';
COMMENT ON FUNCTION get_location_patterns_context IS 'Returns JSON array of time-of-day patterns for a learned location (used by vehicle-chat)';
COMMENT ON FUNCTION backfill_location_visit_patterns IS 'Backfills visit patterns from existing parking sessions (optional, for historical data)';
