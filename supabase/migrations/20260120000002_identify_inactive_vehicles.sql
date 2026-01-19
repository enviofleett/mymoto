-- Identify and Remove Inactive Vehicles
-- Vehicles that haven't sent GPS data in the last 30 days (or never sent any)

-- Function to identify inactive vehicles
-- Checks both vehicle_positions and position_history for the most recent GPS data
CREATE OR REPLACE FUNCTION identify_inactive_vehicles(
  days_inactive INTEGER DEFAULT 30
)
RETURNS TABLE (
  device_id TEXT,
  device_name TEXT,
  last_gps_time TIMESTAMP WITH TIME ZONE,
  days_inactive_count INTEGER,
  has_position_record BOOLEAN,
  has_history_record BOOLEAN,
  created_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH latest_gps_per_vehicle AS (
    SELECT 
      v.device_id,
      v.device_name,
      v.created_at,
      COALESCE(MAX(vp.gps_time), '1970-01-01'::timestamptz) as max_position_gps_time,
      COALESCE(MAX(ph.gps_time), '1970-01-01'::timestamptz) as max_history_gps_time,
      CASE WHEN MAX(vp.gps_time) IS NOT NULL THEN true ELSE false END as has_position,
      CASE WHEN MAX(ph.gps_time) IS NOT NULL THEN true ELSE false END as has_history
    FROM vehicles v
    LEFT JOIN vehicle_positions vp ON v.device_id = vp.device_id
    LEFT JOIN position_history ph ON v.device_id = ph.device_id
    GROUP BY v.device_id, v.device_name, v.created_at
  ),
  vehicles_with_last_gps AS (
    SELECT 
      device_id,
      device_name,
      created_at,
      GREATEST(max_position_gps_time, max_history_gps_time) as last_gps_time,
      has_position,
      has_history,
      EXTRACT(EPOCH FROM (NOW() - GREATEST(max_position_gps_time, max_history_gps_time))) / 86400 as days_inactive_float
    FROM latest_gps_per_vehicle
  )
  SELECT 
    v.device_id,
    v.device_name,
    v.last_gps_time,
    CASE 
      WHEN v.last_gps_time = '1970-01-01'::timestamptz THEN 
        EXTRACT(EPOCH FROM (NOW() - v.created_at)) / 86400::INTEGER
      ELSE 
        v.days_inactive_float::INTEGER
    END as days_inactive_count,
    v.has_position,
    v.has_history,
    v.created_at
  FROM vehicles_with_last_gps v
  WHERE 
    v.last_gps_time < NOW() - (days_inactive || ' days')::INTERVAL
    OR v.last_gps_time = '1970-01-01'::timestamptz  -- Never had GPS data
  ORDER BY v.last_gps_time ASC NULLS LAST;
END;
$$;

-- Function to remove inactive vehicles
-- Safely deletes vehicles and all related data in batches to avoid timeouts
-- Now includes transaction safety with rollback capability
CREATE OR REPLACE FUNCTION remove_inactive_vehicles(
  days_inactive INTEGER DEFAULT 30,
  device_ids_to_remove TEXT[] DEFAULT NULL,  -- If provided, only remove these specific devices
  batch_size INTEGER DEFAULT 100,  -- Process deletions in batches to avoid timeouts
  user_id UUID DEFAULT NULL,  -- User ID for audit logging
  deletion_method TEXT DEFAULT 'manual'  -- 'manual', 'automated', or 'cleanup'
)
RETURNS TABLE (
  deleted_vehicles_count INTEGER,
  deleted_assignments_count INTEGER,
  deleted_trips_count INTEGER,
  deleted_device_ids TEXT[],
  success BOOLEAN,
  error_message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  vehicles_to_delete TEXT[];
  batch TEXT[];
  i INTEGER;
  end_idx INTEGER;
  total_deleted_assignments INTEGER := 0;
  total_deleted_trips INTEGER := 0;
  total_deleted_vehicles INTEGER := 0;
  batch_assignments INTEGER;
  batch_trips INTEGER;
  batch_vehicles INTEGER;
  start_time TIMESTAMP WITH TIME ZONE;
  execution_time_ms INTEGER;
  error_occurred BOOLEAN := false;
  error_msg TEXT := NULL;
BEGIN
  start_time := clock_timestamp();
  
  -- Begin transaction (implicit in function, but we'll use savepoints for batch safety)
  BEGIN
    -- Get list of inactive vehicles
    IF device_ids_to_remove IS NOT NULL THEN
      -- Use provided list
      vehicles_to_delete := device_ids_to_remove;
    ELSE
      -- Get from identify_inactive_vehicles function
      SELECT ARRAY_AGG(device_id) INTO vehicles_to_delete
      FROM identify_inactive_vehicles(days_inactive);
    END IF;

    -- If no vehicles to delete, return early
    IF vehicles_to_delete IS NULL OR array_length(vehicles_to_delete, 1) = 0 THEN
      RETURN QUERY SELECT 0, 0, 0, ARRAY[]::TEXT[], true, NULL::TEXT;
      RETURN;
    END IF;

    -- Process deletions in batches to avoid transaction timeouts
    -- Each batch is wrapped in a savepoint for safety
    i := 1;
    WHILE i <= array_length(vehicles_to_delete, 1) LOOP
      -- Create savepoint for this batch (allows rollback of single batch on error)
      BEGIN
        -- Calculate end index for this batch
        end_idx := LEAST(i + batch_size - 1, array_length(vehicles_to_delete, 1));
        
        -- Get batch of device IDs using array slicing
        batch := vehicles_to_delete[i:end_idx];
        
        -- Delete from vehicle_assignments (no CASCADE)
        DELETE FROM vehicle_assignments
        WHERE device_id = ANY(batch);
        GET DIAGNOSTICS batch_assignments = ROW_COUNT;
        total_deleted_assignments := total_deleted_assignments + batch_assignments;

        -- Delete from vehicle_trips (no foreign key constraint to vehicles)
        DELETE FROM vehicle_trips
        WHERE device_id = ANY(batch);
        GET DIAGNOSTICS batch_trips = ROW_COUNT;
        total_deleted_trips := total_deleted_trips + batch_trips;

        -- Delete from vehicles (this will CASCADE to all other tables)
        DELETE FROM vehicles
        WHERE device_id = ANY(batch);
        GET DIAGNOSTICS batch_vehicles = ROW_COUNT;
        total_deleted_vehicles := total_deleted_vehicles + batch_vehicles;

        -- Move to next batch
        i := i + batch_size;
        
        -- Small delay to prevent lock contention
        PERFORM pg_sleep(0.01);
        
      EXCEPTION WHEN OTHERS THEN
        -- Rollback this batch and stop processing
        error_occurred := true;
        error_msg := SQLERRM;
        RAISE;  -- Re-raise to trigger outer exception handler
      END;
    END LOOP;

    -- Calculate execution time
    execution_time_ms := EXTRACT(EPOCH FROM (clock_timestamp() - start_time))::INTEGER * 1000;

    -- Log to audit table if user_id provided
    IF user_id IS NOT NULL THEN
      BEGIN
        INSERT INTO public.vehicle_deletion_log (
          deleted_by,
          deleted_at,
          days_inactive,
          deletion_method,
          vehicles_deleted,
          assignments_deleted,
          trips_deleted,
          device_ids,
          batch_size,
          execution_time_ms,
          success,
          error_message
        ) VALUES (
          user_id,
          now(),
          days_inactive,
          deletion_method,
          total_deleted_vehicles,
          total_deleted_assignments,
          total_deleted_trips,
          vehicles_to_delete,
          batch_size,
          execution_time_ms,
          true,
          NULL
        );
      EXCEPTION WHEN OTHERS THEN
        -- Don't fail the deletion if audit logging fails
        RAISE WARNING 'Failed to log deletion to audit table: %', SQLERRM;
      END;
    END IF;

    -- Return success results
    RETURN QUERY SELECT 
      total_deleted_vehicles,
      total_deleted_assignments,
      total_deleted_trips,
      vehicles_to_delete,
      true,
      NULL::TEXT;

  EXCEPTION WHEN OTHERS THEN
    -- Calculate execution time even on error
    execution_time_ms := EXTRACT(EPOCH FROM (clock_timestamp() - start_time))::INTEGER * 1000;
    error_msg := SQLERRM;
    
    -- Log failure to audit table if user_id provided
    IF user_id IS NOT NULL THEN
      BEGIN
        INSERT INTO public.vehicle_deletion_log (
          deleted_by,
          deleted_at,
          days_inactive,
          deletion_method,
          vehicles_deleted,
          assignments_deleted,
          trips_deleted,
          device_ids,
          batch_size,
          execution_time_ms,
          success,
          error_message
        ) VALUES (
          user_id,
          now(),
          days_inactive,
          deletion_method,
          total_deleted_vehicles,
          total_deleted_assignments,
          total_deleted_trips,
          vehicles_to_delete,
          batch_size,
          execution_time_ms,
          false,
          error_msg
        );
      EXCEPTION WHEN OTHERS THEN
        -- Ignore audit logging errors
        NULL;
      END;
    END IF;

    -- Return error results (partial deletion counts)
    RETURN QUERY SELECT 
      total_deleted_vehicles,
      total_deleted_assignments,
      total_deleted_trips,
      vehicles_to_delete,
      false,
      error_msg;
  END;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION identify_inactive_vehicles(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION remove_inactive_vehicles(INTEGER, TEXT[], INTEGER, UUID, TEXT) TO authenticated;

-- Comments for documentation
COMMENT ON FUNCTION identify_inactive_vehicles(INTEGER) IS 
'Identifies vehicles that have not sent GPS data in the specified number of days. Checks both vehicle_positions and position_history tables to find the most recent GPS timestamp. Returns vehicles with no GPS data in the last N days or vehicles that never had GPS data.';

COMMENT ON FUNCTION remove_inactive_vehicles(INTEGER, TEXT[], INTEGER, UUID, TEXT) IS 
'Safely removes inactive vehicles and all related data in batches to avoid timeouts. Includes transaction safety with savepoints for each batch, audit logging, and error handling. Deletes from vehicle_assignments and vehicle_trips manually (no CASCADE), then deletes from vehicles which triggers CASCADE for all other tables. Processes deletions in batches (default 100) to handle large deletions efficiently. Returns counts of deleted records, success status, and error message if any.';
