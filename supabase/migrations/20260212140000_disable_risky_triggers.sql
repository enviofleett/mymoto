
-- Disable risky triggers that might be causing user creation failures
-- We will re-enable them after verifying core user creation works

DROP TRIGGER IF EXISTS on_auth_user_created_provider ON auth.users;
DROP TRIGGER IF EXISTS trigger_send_welcome_email ON auth.users;
