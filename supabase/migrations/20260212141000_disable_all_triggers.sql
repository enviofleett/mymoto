
-- Disable ALL triggers on auth.users to isolate the 500 error
-- We will re-enable them one by one

DROP TRIGGER IF EXISTS on_auth_user_created_assign_role ON auth.users;
DROP TRIGGER IF EXISTS on_auth_user_created_provider ON auth.users;
DROP TRIGGER IF EXISTS trigger_send_welcome_email ON auth.users;
DROP TRIGGER IF EXISTS tr_00_ensure_profile ON auth.users;
DROP TRIGGER IF EXISTS tr_99_ensure_wallet ON auth.users;
DROP TRIGGER IF EXISTS on_auth_user_created_profile ON auth.users;
DROP TRIGGER IF EXISTS on_auth_user_created_wallet ON auth.users;
DROP TRIGGER IF EXISTS tr_01_role ON auth.users; -- hypothetical name
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users; -- hypothetical name
