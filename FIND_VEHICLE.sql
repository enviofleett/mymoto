
-- Find device_id for RBC784CX
SELECT id, name, device_id, plate_number 
FROM vehicles 
WHERE plate_number ILIKE '%RBC784CX%' OR name ILIKE '%RBC784CX%';
