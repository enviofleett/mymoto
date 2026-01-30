-- Function to approve a vehicle request and create vehicle/assignment
CREATE OR REPLACE FUNCTION public.approve_vehicle_request(
    p_request_id UUID,
    p_device_id TEXT,
    p_admin_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_request RECORD;
    v_vehicle_exists BOOLEAN;
    v_profile_id UUID;
BEGIN
    -- 1. Get request details
    SELECT * INTO v_request FROM public.vehicle_onboarding_requests WHERE id = p_request_id;
    
    IF v_request IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Request not found');
    END IF;
    
    IF v_request.status != 'pending' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Request is not pending');
    END IF;

    -- 2. Get User Profile ID
    SELECT id INTO v_profile_id FROM public.profiles WHERE user_id = v_request.user_id;
    
    IF v_profile_id IS NULL THEN
        -- Auto-create profile if missing (shouldn't happen for valid users but good safety)
        INSERT INTO public.profiles (user_id, email, full_name)
        SELECT id, email, raw_user_meta_data->>'full_name'
        FROM auth.users WHERE id = v_request.user_id
        RETURNING id INTO v_profile_id;
    END IF;

    -- 3. Check if vehicle exists
    SELECT EXISTS(SELECT 1 FROM public.vehicles WHERE device_id = p_device_id) INTO v_vehicle_exists;

    -- 4. Create or Update Vehicle
    IF NOT v_vehicle_exists THEN
        INSERT INTO public.vehicles (
            device_id,
            device_name,
            plate_number,
            vin,
            make,
            model,
            year,
            color,
            primary_owner_profile_id
        ) VALUES (
            p_device_id,
            v_request.plate_number || ' - ' || v_request.make, -- Default name
            v_request.plate_number,
            v_request.vin,
            v_request.make,
            v_request.model,
            v_request.year,
            v_request.color,
            v_profile_id
        );
    ELSE
        -- Update existing vehicle details if needed? 
        -- For safety, we might NOT want to overwrite if it's already there.
        -- But we definitely want to ensure it's assigned.
        NULL; 
    END IF;

    -- 5. Create Assignment
    INSERT INTO public.vehicle_assignments (
        device_id,
        profile_id,
        is_primary
    ) VALUES (
        p_device_id,
        v_profile_id,
        NOT EXISTS(SELECT 1 FROM public.vehicle_assignments WHERE device_id = p_device_id) -- Primary if first assignment
    ) ON CONFLICT (device_id, profile_id) DO NOTHING;

    -- 6. Update Request Status
    UPDATE public.vehicle_onboarding_requests
    SET status = 'approved',
        processed_at = now(),
        processed_by = p_admin_id,
        admin_notes = 'Approved and linked to device ' || p_device_id
    WHERE id = p_request_id;

    RETURN jsonb_build_object('success', true);

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
