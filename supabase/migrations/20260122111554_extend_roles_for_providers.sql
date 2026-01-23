-- Extend app_role enum to include service_provider
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'service_provider';
