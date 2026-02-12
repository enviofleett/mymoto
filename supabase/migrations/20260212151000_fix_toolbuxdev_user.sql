
-- Fix toolbuxdev@gmail.com user data and ensure all related records exist

DO $$
DECLARE
    target_emails TEXT[] := ARRAY['toolbuxdev@gmail.com', 'toolbux@gmail.com'];
    target_email TEXT;
    user_record RECORD;
BEGIN
    FOREACH target_email IN ARRAY target_emails
    LOOP
        -- Get user from auth.users (requires permission, but migrations run as admin)
        SELECT * INTO user_record FROM auth.users WHERE email = target_email;
        
        IF user_record.id IS NOT NULL THEN
            RAISE NOTICE 'Fixing data for user: % (ID: %)', target_email, user_record.id;

            -- 1. Ensure Profile
            INSERT INTO public.profiles (id, user_id, email, name, status)
            VALUES (
                user_record.id,
                user_record.id,
                user_record.email,
                COALESCE(user_record.raw_user_meta_data->>'full_name', user_record.email),
                'active'
            )
            ON CONFLICT (id) DO NOTHING;

            -- 2. Ensure Role (Admin)
            INSERT INTO public.user_roles (user_id, role)
            VALUES (user_record.id, 'admin')
            ON CONFLICT (user_id, role) DO NOTHING;

            -- 3. Ensure Wallet
            INSERT INTO public.wallets (profile_id)
            VALUES (user_record.id)
            ON CONFLICT (profile_id) DO NOTHING;
            
            RAISE NOTICE '✅ Successfully fixed data for %', target_email;
        ELSE
            RAISE NOTICE 'User % not found, skipping.', target_email;
        END IF;
    END LOOP;
END;
$$;
