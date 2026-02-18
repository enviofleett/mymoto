-- Add additional vehicle profile fields needed for fuel analytics
-- Migration: 20260218121500_add_fuel_analytics_profile_fields.sql

ALTER TABLE public.vehicles
ADD COLUMN IF NOT EXISTS vehicle_type TEXT,
ADD COLUMN IF NOT EXISTS driving_region_or_country TEXT,
ADD COLUMN IF NOT EXISTS usage_weight TEXT;

COMMENT ON COLUMN public.vehicles.vehicle_type IS 'High-level vehicle type for fuel analytics (e.g., sedan, SUV, truck, bus).';
COMMENT ON COLUMN public.vehicles.driving_region_or_country IS 'Primary driving region or country for this vehicle (e.g., Nigeria, EU, US city).';
COMMENT ON COLUMN public.vehicles.usage_weight IS 'Typical usage weight or load profile for fuel analytics (e.g., light, normal, heavy, or approximate kg/tons).';

