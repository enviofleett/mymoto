
-- Ensure public.profiles are created for new users
-- This is required because wallets reference profiles(id), and we expect id = auth.users.id

CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, user_id, email, name, status)
    VALUES (
        NEW.id,   -- Ensure profile.id matches auth.users.id
        NEW.id,   -- user_id also matches (redundant but explicit in schema)
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
        'active'
    )
    ON CONFLICT (id) DO NOTHING; -- Idempotency
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger must run BEFORE wallet trigger (alphabetical order: p < w)
DROP TRIGGER IF EXISTS on_auth_user_created_profile ON auth.users;
CREATE TRIGGER on_auth_user_created_profile
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user_profile();
