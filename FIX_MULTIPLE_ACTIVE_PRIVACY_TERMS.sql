-- ============================================================================
-- Fix Multiple Active Privacy Terms
-- ============================================================================
-- Problem: Multiple privacy terms have is_active = true
-- Solution: Keep only the most recent one active, deactivate the rest
-- ============================================================================

-- 1. Check current status
SELECT 
  COUNT(*) as total_active,
  COUNT(DISTINCT version) as unique_versions,
  MIN(created_at) as oldest,
  MAX(created_at) as newest
FROM privacy_security_terms
WHERE is_active = true;

-- 2. Show all active terms
SELECT 
  id,
  version,
  is_active,
  created_at,
  updated_at,
  LEFT(terms_content, 100) as preview
FROM privacy_security_terms
WHERE is_active = true
ORDER BY created_at DESC;

-- 3. Deactivate all except the most recent
UPDATE privacy_security_terms
SET is_active = false
WHERE is_active = true
  AND id != (
    SELECT id 
    FROM privacy_security_terms 
    WHERE is_active = true 
    ORDER BY created_at DESC 
    LIMIT 1
  );

-- 4. Verify only one is active now
SELECT 
  id,
  version,
  is_active,
  created_at,
  LEFT(terms_content, 100) as preview
FROM privacy_security_terms
WHERE is_active = true;

-- Expected result: Should return only 1 row

-- ============================================================================
-- Alternative: Keep a specific version active
-- ============================================================================
-- If you want to keep a specific version (e.g., the one with most complete content):

-- Step 1: Deactivate all
-- UPDATE privacy_security_terms SET is_active = false WHERE is_active = true;

-- Step 2: Activate the one you want (replace ID with actual ID)
-- UPDATE privacy_security_terms SET is_active = true WHERE id = 'YOUR_CHOSEN_ID';

-- ============================================================================
-- Recommendation: Keep the latest one (already done above)
-- ============================================================================
