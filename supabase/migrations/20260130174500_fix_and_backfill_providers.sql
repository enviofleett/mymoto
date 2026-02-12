-- Re-apply the trigger function to ensure it exists (Idempotent)
CREATE OR REPLACE FUNCTION public.handle_new_service_provider()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if the user has the service_provider role in metadata
  IF (new.raw_user_meta_data->>'role' = 'service_provider') THEN
    INSERT INTO public.service_providers (
      user_id,
      business_name,
      contact_person,
      phone,
      email,
      category_id,
      approval_status
    ) VALUES (
      new.id,
      new.raw_user_meta_data->>'business_name',
      NULLIF(new.raw_user_meta_data->>'contact_person', ''),
      new.raw_user_meta_data->>'phone',
      new.email,
      (NULLIF(new.raw_user_meta_data->>'category_id', ''))::uuid,
      'pending'
    );
  END IF;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ensure trigger is active
-- DROP TRIGGER IF EXISTS on_auth_user_created_provider ON auth.users;
-- CREATE TRIGGER on_auth_user_created_provider
--   AFTER INSERT ON auth.users
--   FOR EACH ROW EXECUTE PROCEDURE public.handle_new_service_provider();

-- Backfill missing providers
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT * FROM auth.users
        WHERE raw_user_meta_data->>'role' = 'service_provider'
        AND id NOT IN (SELECT user_id FROM public.service_providers)
    LOOP
        INSERT INTO public.service_providers (
            user_id,
            business_name,
            contact_person,
            phone,
            email,
            category_id,
            approval_status
        ) VALUES (
            r.id,
            r.raw_user_meta_data->>'business_name',
            NULLIF(r.raw_user_meta_data->>'contact_person', ''),
            r.raw_user_meta_data->>'phone',
            r.email,
            (NULLIF(r.raw_user_meta_data->>'category_id', ''))::uuid,
            'pending'
        );
    END LOOP;
END;
$$;
