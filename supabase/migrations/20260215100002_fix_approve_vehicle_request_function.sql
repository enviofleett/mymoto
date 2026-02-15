-- Fix approve_vehicle_request() function to match current schema.
-- NOTE: Frontend should call the admin-process-vehicle-onboarding-request edge function instead,
-- but keeping this function working reduces environment drift and prevents silent failures.

CREATE OR REPLACE FUNCTION public.approve_vehicle_request(
  p_request_id UUID,
  p_device_id TEXT,
  p_admin_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request RECORD;
  v_profile_id UUID;
  v_user_email TEXT;
  v_vehicle_name TEXT;
  v_device_exists BOOLEAN;
BEGIN
  -- 1) Get request details
  SELECT * INTO v_request
  FROM public.vehicle_onboarding_requests
  WHERE id = p_request_id;

  IF v_request IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Request not found');
  END IF;

  IF v_request.status <> 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Request is not pending');
  END IF;

  IF p_device_id IS NULL OR btrim(p_device_id) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Device ID is required');
  END IF;

  -- 2) Require that the device exists in vehicles (prevents phantom devices / typos)
  SELECT EXISTS(
    SELECT 1 FROM public.vehicles WHERE device_id = btrim(p_device_id)
  ) INTO v_device_exists;

  IF NOT v_device_exists THEN
    RETURN jsonb_build_object('success', false, 'error', 'Device not found. Sync/import from GPS51 first.');
  END IF;

  -- 3) Resolve canonical profile id for the requesting auth user
  v_profile_id := v_request.user_id;

  -- Ensure canonical profile exists
  SELECT u.email INTO v_user_email
  FROM auth.users u
  WHERE u.id = v_request.user_id;

  INSERT INTO public.profiles (id, user_id, email, name)
  VALUES (
    v_profile_id,
    v_profile_id,
    v_user_email,
    COALESCE(v_user_email, 'User')
  )
  ON CONFLICT (id) DO NOTHING;

  -- 4) Create assignment (idempotent)
  SELECT device_name INTO v_vehicle_name
  FROM public.vehicles
  WHERE device_id = btrim(p_device_id);

  INSERT INTO public.vehicle_assignments (device_id, profile_id, vehicle_alias)
  VALUES (
    btrim(p_device_id),
    v_profile_id,
    COALESCE(v_vehicle_name, v_request.plate_number, btrim(p_device_id))
  )
  ON CONFLICT (device_id, profile_id) DO NOTHING;

  -- 5) Set primary owner (full control) to the requester
  UPDATE public.vehicles
  SET primary_owner_profile_id = v_profile_id
  WHERE device_id = btrim(p_device_id);

  -- 6) Update request status
  UPDATE public.vehicle_onboarding_requests
  SET status = 'approved',
      processed_at = now(),
      processed_by = p_admin_id,
      admin_notes = COALESCE(v_request.admin_notes, 'Approved') || ' (linked to device ' || btrim(p_device_id) || ')',
      approved_device_id = btrim(p_device_id)
  WHERE id = p_request_id;

  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

