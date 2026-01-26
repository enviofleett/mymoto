-- Create RPC function to reset stuck sync statuses
-- Allows authenticated users to reset their own device's sync status if it's been stuck >10 minutes
CREATE OR REPLACE FUNCTION public.reset_stuck_sync_status(p_device_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status record;
  v_minutes_stuck numeric;
  v_user_id uuid;
BEGIN
  -- Get current user ID
  v_user_id := auth.uid();
  
  -- Verify user has access to this device
  IF NOT EXISTS (
    SELECT 1 FROM vehicle_assignments 
    WHERE device_id = p_device_id 
    AND user_id = v_user_id
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Access denied: You do not have access to this device'
    );
  END IF;
  
  -- Get current sync status
  SELECT * INTO v_status
  FROM trip_sync_status
  WHERE device_id = p_device_id;
  
  -- If no status exists, nothing to reset
  IF v_status IS NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'message', 'No sync status found for this device'
    );
  END IF;
  
  -- Check if status is "processing"
  IF v_status.sync_status != 'processing' THEN
    RETURN jsonb_build_object(
      'success', true,
      'message', 'Sync status is not processing, no reset needed',
      'current_status', v_status.sync_status
    );
  END IF;
  
  -- Calculate minutes stuck
  v_minutes_stuck := EXTRACT(EPOCH FROM (now() - v_status.updated_at)) / 60;
  
  -- Only reset if stuck for more than 10 minutes
  IF v_minutes_stuck <= 10 THEN
    RETURN jsonb_build_object(
      'success', true,
      'message', 'Sync status is processing but not stuck (less than 10 minutes)',
      'minutes_stuck', v_minutes_stuck
    );
  END IF;
  
  -- Reset to idle
  UPDATE trip_sync_status
  SET 
    sync_status = 'idle',
    error_message = format('Previous sync was stuck for %.1f minutes and has been reset', v_minutes_stuck),
    trips_processed = 0
  WHERE device_id = p_device_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'message', format('Sync status reset from processing to idle (was stuck for %.1f minutes)', v_minutes_stuck),
    'minutes_stuck', v_minutes_stuck,
    'previous_status', 'processing',
    'new_status', 'idle'
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.reset_stuck_sync_status(text) TO authenticated;

COMMENT ON FUNCTION public.reset_stuck_sync_status IS 'Allows authenticated users to reset stuck sync statuses for their assigned vehicles. Only resets if status is "processing" and stuck for >10 minutes.';
