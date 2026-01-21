-- Make toolbuxdev@gmail.com an admin with full rights
-- Run this in Supabase SQL Editor (uses service role, bypasses RLS)

-- Method 1: Direct insert (works in SQL Editor with service role)
INSERT INTO public.user_roles (user_id, role)
SELECT 
  u.id,
  'admin'::app_role
FROM auth.users u
WHERE u.email = 'toolbuxdev@gmail.com'
ON CONFLICT (user_id, role) DO UPDATE SET role = 'admin';

-- Verify it worked
SELECT 
  u.email,
  u.id as user_id,
  ur.role,
  ur.created_at as role_assigned_at,
  public.has_role(u.id, 'admin') as is_admin_verified
FROM auth.users u
LEFT JOIN public.user_roles ur ON u.id = ur.user_id
WHERE u.email = 'toolbuxdev@gmail.com';

-- Expected result:
-- email: toolbuxdev@gmail.com
-- role: admin
-- is_admin_verified: true
