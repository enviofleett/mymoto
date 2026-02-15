-- Extend vehicle_onboarding_requests to support optional IMEI entry by owner and explicit approved device id.
-- This supports "owner enters IMEI (optional), admin can override/fill missing IMEI" approval flow.

ALTER TABLE public.vehicle_onboarding_requests
ADD COLUMN IF NOT EXISTS requested_device_id TEXT,
ADD COLUMN IF NOT EXISTS approved_device_id TEXT;

-- Ensure approved requests always record which device id was approved.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'vehicle_onboarding_requests_approved_device_required'
  ) THEN
    ALTER TABLE public.vehicle_onboarding_requests
      ADD CONSTRAINT vehicle_onboarding_requests_approved_device_required
      CHECK (status <> 'approved' OR approved_device_id IS NOT NULL);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_vehicle_requests_requested_device_id
  ON public.vehicle_onboarding_requests(requested_device_id);

CREATE INDEX IF NOT EXISTS idx_vehicle_requests_approved_device_id
  ON public.vehicle_onboarding_requests(approved_device_id);

