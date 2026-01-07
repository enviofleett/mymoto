-- Add GPS51 owner field to vehicles table
ALTER TABLE public.vehicles 
ADD COLUMN gps_owner text;

-- Add comment for clarity
COMMENT ON COLUMN public.vehicles.gps_owner IS 'GPS51 account username that owns/created this device';