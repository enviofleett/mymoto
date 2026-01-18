-- Delete All Non-Admin Users and Their Profiles
-- This script will delete all users EXCEPT the admin user (toolbuxdev@gmail.com)
-- Run this in your Supabase SQL Editor

-- ============================================
-- STEP 1: View users to be deleted (VERIFY FIRST)
-- ============================================
SELECT 
    u.id as user_id,
    u.email,
    u.created_at as user_created,
    p.id as profile_id,
    p.name as profile_name,
    (SELECT COUNT(*) FROM vehicle_assignments WHERE profile_id = p.id) as vehicle_assignment_count
FROM auth.users u
LEFT JOIN profiles p ON p.user_id = u.id
WHERE u.email != 'toolbuxdev@gmail.com'
ORDER BY u.created_at;

-- ============================================
-- STEP 2: Delete vehicle assignments
-- ============================================
DELETE FROM vehicle_assignments
WHERE profile_id IN (
    SELECT p.id 
    FROM profiles p
    JOIN auth.users u ON p.user_id = u.id
    WHERE u.email != 'toolbuxdev@gmail.com'
);

-- ============================================
-- STEP 3: Delete profiles
-- ============================================
DELETE FROM profiles
WHERE user_id IN (
    SELECT id 
    FROM auth.users 
    WHERE email != 'toolbuxdev@gmail.com'
);

-- ============================================
-- STEP 4: Delete user_roles (will cascade from auth.users, but explicit is safer)
-- ============================================
DELETE FROM user_roles
WHERE user_id IN (
    SELECT id 
    FROM auth.users 
    WHERE email != 'toolbuxdev@gmail.com'
);

-- ============================================
-- STEP 5: Get user IDs for auth.users deletion (run this to get IDs)
-- ============================================
-- You'll need to delete auth.users via Supabase Dashboard or Admin API
-- Copy these IDs and use them in the Supabase Dashboard under Authentication > Users
-- Or use the edge function approach below

SELECT 
    id as user_id_to_delete,
    email
FROM auth.users 
WHERE email != 'toolbuxdev@gmail.com'
ORDER BY created_at;

-- ============================================
-- STEP 6: Verification queries (run after deletion)
-- ============================================

-- Check remaining users (should only show admin)
SELECT 
    COUNT(*) as remaining_users,
    string_agg(email, ', ') as user_emails
FROM auth.users;

-- Check remaining profiles (should show 0 or only orphaned profiles)
SELECT 
    COUNT(*) as remaining_profiles,
    COUNT(CASE WHEN user_id IS NOT NULL THEN 1 END) as profiles_with_users
FROM profiles;

-- Check remaining vehicle assignments
SELECT 
    COUNT(*) as remaining_assignments,
    COUNT(CASE WHEN profile_id IS NOT NULL THEN 1 END) as assignments_with_profiles
FROM vehicle_assignments;

-- ============================================
-- NOTE: To delete auth.users, you have two options:
-- ============================================
-- 
-- Option 1: Supabase Dashboard
-- 1. Go to Authentication > Users in your Supabase dashboard
-- 2. Find each user (excluding toolbuxdev@gmail.com)
-- 3. Click the three dots menu and select "Delete user"
--
-- Option 2: Supabase CLI / Admin API
-- Use the Admin API: supabase.auth.admin.deleteUser(userId)
-- You can call this from a Supabase Edge Function or Supabase CLI
