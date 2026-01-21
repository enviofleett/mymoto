-- Simple version: Make toolbuxdev@gmail.com an admin
-- Run this in Supabase SQL Editor

-- Find user and assign admin role
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
  public.has_role(u.id, 'admin') as is_admin
FROM auth.users u
LEFT JOIN public.user_roles ur ON u.id = ur.user_id
WHERE u.email = 'toolbuxdev@gmail.com';
