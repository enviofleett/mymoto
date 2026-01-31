-- Add vehicle_moving column to vehicle_notification_preferences
-- Default is set to true as per user requirement "notification by default"

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'vehicle_notification_preferences' 
        AND column_name = 'vehicle_moving'
    ) THEN
        ALTER TABLE public.vehicle_notification_preferences 
        ADD COLUMN vehicle_moving BOOLEAN DEFAULT true;
    END IF;
END $$;
