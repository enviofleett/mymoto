-- STEP 1: Fix RSH128EA Device ID Mismatch (Corrected)
-- Consolidate data under correct device_id: 1361282381

-- First, delete any duplicate assignment with typo ID (since correct one exists)
DELETE FROM vehicle_assignments WHERE device_id = '13612332381';

-- Fix position_history records with typo device_id
UPDATE position_history 
SET device_id = '1361282381' 
WHERE device_id = '13612332381';

-- Remove duplicate vehicle entry with typo
DELETE FROM vehicles WHERE device_id = '13612332381';