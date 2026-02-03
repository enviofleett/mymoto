-- Add RLS policy for Owners to view their vehicle trips
-- This fixes the issue where owners could not see trips if they weren't explicitly assigned in vehicle_assignments

DO $$
BEGIN
  -- Check if policy exists to avoid error
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'vehicle_trips' 
    AND policyname = 'Owners can view their vehicle trips'
  ) THEN
    CREATE POLICY "Owners can view their vehicle trips"
    ON vehicle_trips
    FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM vehicles v
        JOIN profiles p ON p.id = v.primary_owner_profile_id
        WHERE v.device_id = vehicle_trips.device_id
        AND p.user_id = auth.uid()
      )
    );
  END IF;
END
$$;
