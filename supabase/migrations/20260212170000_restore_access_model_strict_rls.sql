-- Restore Access Model: Admin-All + Assigned-User-Only (Strict RLS)
-- Canonical policy baseline for production visibility and auth linkage.

-- 1) Canonical role-check helpers (text + app_role compatibility)
CREATE OR REPLACE FUNCTION public.has_role(user_id UUID, role_name TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = user_id
      AND ur.role::text = role_name
  );
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'app_role'
  ) THEN
    EXECUTE $fn$
      CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
      RETURNS BOOLEAN
      LANGUAGE sql
      STABLE
      SECURITY DEFINER
      SET search_path = public
      AS $inner$
        SELECT public.has_role(_user_id, _role::text);
      $inner$;
    $fn$;
  END IF;
END
$$;

GRANT EXECUTE ON FUNCTION public.has_role(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(UUID, TEXT) TO service_role;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'app_role'
  ) THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) TO authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) TO service_role';
  END IF;
END
$$;

-- 2) Backfill identity integrity (profiles + default role)
DO $$
DECLARE
  profiles_has_status BOOLEAN;
  app_role_exists BOOLEAN;
  default_role TEXT;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'status'
  ) INTO profiles_has_status;

  IF profiles_has_status THEN
    INSERT INTO public.profiles (id, user_id, email, name, status)
    SELECT
      u.id,
      u.id,
      u.email,
      COALESCE(u.raw_user_meta_data->>'full_name', u.email),
      'active'
    FROM auth.users u
    LEFT JOIN public.profiles p ON p.id = u.id
    WHERE p.id IS NULL;
  ELSE
    INSERT INTO public.profiles (id, user_id, email, name)
    SELECT
      u.id,
      u.id,
      u.email,
      COALESCE(u.raw_user_meta_data->>'full_name', u.email)
    FROM auth.users u
    LEFT JOIN public.profiles p ON p.id = u.id
    WHERE p.id IS NULL;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'app_role'
  ) INTO app_role_exists;

  IF app_role_exists THEN
    SELECT COALESCE(
      (
        SELECT e.enumlabel
        FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'public'
          AND t.typname = 'app_role'
          AND e.enumlabel = 'user'
        LIMIT 1
      ),
      (
        SELECT e.enumlabel
        FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'public'
          AND t.typname = 'app_role'
        ORDER BY e.enumsortorder
        LIMIT 1
      )
    ) INTO default_role;

    IF default_role IS NOT NULL THEN
      EXECUTE format(
        $sql$
          INSERT INTO public.user_roles (user_id, role)
          SELECT u.id, %L::public.app_role
          FROM auth.users u
          WHERE NOT EXISTS (
            SELECT 1
            FROM public.user_roles ur
            WHERE ur.user_id = u.id
          );
        $sql$,
        default_role
      );
    END IF;
  ELSE
    INSERT INTO public.user_roles (user_id, role)
    SELECT u.id, 'user'
    FROM auth.users u
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = u.id
    );
  END IF;
END
$$;

-- 3) Canonical trigger functions (idempotent, no hardcoded account drift)
CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'status'
  ) THEN
    INSERT INTO public.profiles (id, user_id, email, name, status)
    VALUES (
      NEW.id,
      NEW.id,
      NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
      'active'
    )
    ON CONFLICT (id) DO NOTHING;
  ELSE
    INSERT INTO public.profiles (id, user_id, email, name)
    VALUES (
      NEW.id,
      NEW.id,
      NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
    )
    ON CONFLICT (id) DO NOTHING;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'handle_new_user_profile failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  default_role TEXT;
BEGIN
  SELECT COALESCE(
    (
      SELECT e.enumlabel
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public'
        AND t.typname = 'app_role'
        AND e.enumlabel = 'user'
      LIMIT 1
    ),
    (
      SELECT e.enumlabel
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public'
        AND t.typname = 'app_role'
      ORDER BY e.enumsortorder
      LIMIT 1
    )
  ) INTO default_role;

  IF default_role IS NOT NULL THEN
    EXECUTE format(
      'INSERT INTO public.user_roles (user_id, role) VALUES ($1, %L::public.app_role) ON CONFLICT (user_id, role) DO NOTHING',
      default_role
    )
    USING NEW.id;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'handle_new_user_role failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user_wallet()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'wallets'
      AND column_name = 'profile_id'
  ) THEN
    INSERT INTO public.wallets (profile_id)
    VALUES (NEW.id)
    ON CONFLICT DO NOTHING;
  ELSIF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'wallets'
      AND column_name = 'user_id'
  ) THEN
    INSERT INTO public.wallets (user_id)
    VALUES (NEW.id)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'handle_new_user_wallet failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS on_auth_user_created_assign_role ON auth.users;
DROP TRIGGER IF EXISTS on_auth_user_created_create_wallet ON auth.users;
DROP TRIGGER IF EXISTS tr_00_ensure_profile ON auth.users;
DROP TRIGGER IF EXISTS tr_10_ensure_role ON auth.users;
DROP TRIGGER IF EXISTS tr_99_ensure_wallet ON auth.users;

CREATE TRIGGER tr_00_ensure_profile
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user_profile();

CREATE TRIGGER tr_10_ensure_role
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user_role();

CREATE TRIGGER tr_99_ensure_wallet
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user_wallet();

-- 4) Strict RLS baseline: admin-all + assigned-only
DO $$
DECLARE
  tbl TEXT;
  pol RECORD;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'vehicles',
    'vehicle_positions',
    'position_history',
    'vehicle_trips',
    'gps51_trips',
    'trip_sync_status',
    'vehicle_chat_history',
    'vehicle_llm_settings',
    'vehicle_assignments'
  ]
  LOOP
    IF EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = tbl
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);

      FOR pol IN
        SELECT p.policyname
        FROM pg_policies p
        WHERE p.schemaname = 'public'
          AND p.tablename = tbl
          AND p.cmd IN ('SELECT', 'ALL')
      LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, tbl);
      END LOOP;
    END IF;
  END LOOP;
END
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'vehicles') THEN
    DROP POLICY IF EXISTS "Admins or assigned users can read vehicles" ON public.vehicles;
    DROP POLICY IF EXISTS "Service role can manage vehicles strict baseline" ON public.vehicles;

    CREATE POLICY "Admins or assigned users can read vehicles"
    ON public.vehicles
    FOR SELECT
    TO authenticated
    USING (
      public.has_role(auth.uid(), 'admin')
      OR EXISTS (
        SELECT 1
        FROM public.vehicle_assignments va
        JOIN public.profiles p ON p.id = va.profile_id
        WHERE va.device_id = vehicles.device_id
          AND p.user_id = auth.uid()
      )
    );

    CREATE POLICY "Service role can manage vehicles strict baseline"
    ON public.vehicles
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'vehicle_positions') THEN
    DROP POLICY IF EXISTS "Admins or assigned users can read vehicle_positions" ON public.vehicle_positions;
    DROP POLICY IF EXISTS "Service role can manage vehicle_positions strict baseline" ON public.vehicle_positions;

    CREATE POLICY "Admins or assigned users can read vehicle_positions"
    ON public.vehicle_positions
    FOR SELECT
    TO authenticated
    USING (
      public.has_role(auth.uid(), 'admin')
      OR EXISTS (
        SELECT 1
        FROM public.vehicle_assignments va
        JOIN public.profiles p ON p.id = va.profile_id
        WHERE va.device_id = vehicle_positions.device_id
          AND p.user_id = auth.uid()
      )
    );

    CREATE POLICY "Service role can manage vehicle_positions strict baseline"
    ON public.vehicle_positions
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'position_history') THEN
    DROP POLICY IF EXISTS "Admins or assigned users can read position_history" ON public.position_history;
    DROP POLICY IF EXISTS "Service role can manage position_history strict baseline" ON public.position_history;

    CREATE POLICY "Admins or assigned users can read position_history"
    ON public.position_history
    FOR SELECT
    TO authenticated
    USING (
      public.has_role(auth.uid(), 'admin')
      OR EXISTS (
        SELECT 1
        FROM public.vehicle_assignments va
        JOIN public.profiles p ON p.id = va.profile_id
        WHERE va.device_id = position_history.device_id
          AND p.user_id = auth.uid()
      )
    );

    CREATE POLICY "Service role can manage position_history strict baseline"
    ON public.position_history
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'vehicle_trips') THEN
    DROP POLICY IF EXISTS "Admins or assigned users can read vehicle_trips" ON public.vehicle_trips;
    DROP POLICY IF EXISTS "Service role can manage vehicle_trips strict baseline" ON public.vehicle_trips;

    CREATE POLICY "Admins or assigned users can read vehicle_trips"
    ON public.vehicle_trips
    FOR SELECT
    TO authenticated
    USING (
      public.has_role(auth.uid(), 'admin')
      OR EXISTS (
        SELECT 1
        FROM public.vehicle_assignments va
        JOIN public.profiles p ON p.id = va.profile_id
        WHERE va.device_id = vehicle_trips.device_id
          AND p.user_id = auth.uid()
      )
    );

    CREATE POLICY "Service role can manage vehicle_trips strict baseline"
    ON public.vehicle_trips
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'gps51_trips') THEN
    DROP POLICY IF EXISTS "Admins or assigned users can read gps51_trips" ON public.gps51_trips;
    DROP POLICY IF EXISTS "Service role can manage gps51_trips strict baseline" ON public.gps51_trips;

    CREATE POLICY "Admins or assigned users can read gps51_trips"
    ON public.gps51_trips
    FOR SELECT
    TO authenticated
    USING (
      public.has_role(auth.uid(), 'admin')
      OR EXISTS (
        SELECT 1
        FROM public.vehicle_assignments va
        JOIN public.profiles p ON p.id = va.profile_id
        WHERE va.device_id = gps51_trips.device_id
          AND p.user_id = auth.uid()
      )
    );

    CREATE POLICY "Service role can manage gps51_trips strict baseline"
    ON public.gps51_trips
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'trip_sync_status') THEN
    DROP POLICY IF EXISTS "Admins or assigned users can read trip_sync_status" ON public.trip_sync_status;
    DROP POLICY IF EXISTS "Service role can manage trip_sync_status strict baseline" ON public.trip_sync_status;

    CREATE POLICY "Admins or assigned users can read trip_sync_status"
    ON public.trip_sync_status
    FOR SELECT
    TO authenticated
    USING (
      public.has_role(auth.uid(), 'admin')
      OR EXISTS (
        SELECT 1
        FROM public.vehicle_assignments va
        JOIN public.profiles p ON p.id = va.profile_id
        WHERE va.device_id = trip_sync_status.device_id
          AND p.user_id = auth.uid()
      )
    );

    CREATE POLICY "Service role can manage trip_sync_status strict baseline"
    ON public.trip_sync_status
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'vehicle_llm_settings') THEN
    DROP POLICY IF EXISTS "Admins or assigned users can read vehicle_llm_settings" ON public.vehicle_llm_settings;
    DROP POLICY IF EXISTS "Service role can manage vehicle_llm_settings strict baseline" ON public.vehicle_llm_settings;

    CREATE POLICY "Admins or assigned users can read vehicle_llm_settings"
    ON public.vehicle_llm_settings
    FOR SELECT
    TO authenticated
    USING (
      public.has_role(auth.uid(), 'admin')
      OR EXISTS (
        SELECT 1
        FROM public.vehicle_assignments va
        JOIN public.profiles p ON p.id = va.profile_id
        WHERE va.device_id = vehicle_llm_settings.device_id
          AND p.user_id = auth.uid()
      )
    );

    CREATE POLICY "Service role can manage vehicle_llm_settings strict baseline"
    ON public.vehicle_llm_settings
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'vehicle_chat_history') THEN
    DROP POLICY IF EXISTS "Admins or assigned users can read vehicle_chat_history" ON public.vehicle_chat_history;
    DROP POLICY IF EXISTS "Users can insert own vehicle_chat_history" ON public.vehicle_chat_history;
    DROP POLICY IF EXISTS "Service role can manage vehicle_chat_history strict baseline" ON public.vehicle_chat_history;

    CREATE POLICY "Admins or assigned users can read vehicle_chat_history"
    ON public.vehicle_chat_history
    FOR SELECT
    TO authenticated
    USING (
      public.has_role(auth.uid(), 'admin')
      OR user_id = auth.uid()
      OR EXISTS (
        SELECT 1
        FROM public.vehicle_assignments va
        JOIN public.profiles p ON p.id = va.profile_id
        WHERE va.device_id = vehicle_chat_history.device_id
          AND p.user_id = auth.uid()
      )
    );

    CREATE POLICY "Users can insert own vehicle_chat_history"
    ON public.vehicle_chat_history
    FOR INSERT
    TO authenticated
    WITH CHECK (
      user_id = auth.uid()
      AND (
        public.has_role(auth.uid(), 'admin')
        OR EXISTS (
          SELECT 1
          FROM public.vehicle_assignments va
          JOIN public.profiles p ON p.id = va.profile_id
          WHERE va.device_id = vehicle_chat_history.device_id
            AND p.user_id = auth.uid()
        )
      )
    );

    CREATE POLICY "Service role can manage vehicle_chat_history strict baseline"
    ON public.vehicle_chat_history
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'vehicle_assignments') THEN
    DROP POLICY IF EXISTS "Admins or owners can read vehicle_assignments" ON public.vehicle_assignments;
    DROP POLICY IF EXISTS "Service role can manage vehicle_assignments strict baseline" ON public.vehicle_assignments;

    CREATE POLICY "Admins or owners can read vehicle_assignments"
    ON public.vehicle_assignments
    FOR SELECT
    TO authenticated
    USING (
      public.has_role(auth.uid(), 'admin')
      OR EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = vehicle_assignments.profile_id
          AND p.user_id = auth.uid()
      )
    );

    CREATE POLICY "Service role can manage vehicle_assignments strict baseline"
    ON public.vehicle_assignments
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
  END IF;
END
$$;

-- Ensure authenticated can read core tables while RLS enforces row filtering.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'vehicles') THEN
    GRANT SELECT ON public.vehicles TO authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'vehicle_positions') THEN
    GRANT SELECT ON public.vehicle_positions TO authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'position_history') THEN
    GRANT SELECT ON public.position_history TO authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'vehicle_trips') THEN
    GRANT SELECT ON public.vehicle_trips TO authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'gps51_trips') THEN
    GRANT SELECT ON public.gps51_trips TO authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'trip_sync_status') THEN
    GRANT SELECT ON public.trip_sync_status TO authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'vehicle_chat_history') THEN
    GRANT SELECT ON public.vehicle_chat_history TO authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'vehicle_llm_settings') THEN
    GRANT SELECT ON public.vehicle_llm_settings TO authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'vehicle_assignments') THEN
    GRANT SELECT ON public.vehicle_assignments TO authenticated;
  END IF;
END
$$;
