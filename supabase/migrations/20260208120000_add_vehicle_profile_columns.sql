-- Add vehicle profile columns for fuel efficiency comparison
-- Migration: 20260208120000_add_vehicle_profile_columns.sql

ALTER TABLE public.vehicles
ADD COLUMN IF NOT EXISTS make TEXT,
ADD COLUMN IF NOT EXISTS model TEXT,
ADD COLUMN IF NOT EXISTS year INTEGER,
ADD COLUMN IF NOT EXISTS fuel_type TEXT, -- 'petrol', 'diesel', 'hybrid', 'electric'
ADD COLUMN IF NOT EXISTS engine_displacement TEXT, -- e.g. '2.0L', '3.5L V6'
ADD COLUMN IF NOT EXISTS official_fuel_efficiency_l_100km FLOAT; -- Manufacturer rated consumption

COMMENT ON COLUMN public.vehicles.official_fuel_efficiency_l_100km IS 'Manufacturer rated fuel consumption in L/100km for comparison with actuals';
