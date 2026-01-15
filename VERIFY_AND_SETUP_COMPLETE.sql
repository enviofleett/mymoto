-- ============================================
-- COMPREHENSIVE VERIFICATION & SETUP SCRIPT
-- ============================================
-- This script verifies all tables exist and sets up test data
-- Run this AFTER all migrations have been executed

-- ============================================
-- PART 1: VERIFY ALL REQUIRED TABLES EXIST
-- ============================================

DO $$
DECLARE
    missing_tables TEXT[] := ARRAY[]::TEXT[];
    tbl_name TEXT;
    required_tables TEXT[] := ARRAY[
        'profiles',
        'vehicle_assignments',
        'vehicles',
        'proactive_vehicle_events',
        'vehicle_chat_history',
        'vehicle_llm_settings'
    ];
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'VERIFYING REQUIRED TABLES...';
    RAISE NOTICE '========================================';
    
    FOREACH tbl_name IN ARRAY required_tables
    LOOP
        IF NOT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND information_schema.tables.table_name = tbl_name
        ) THEN
            missing_tables := array_append(missing_tables, tbl_name);
            RAISE WARNING '❌ Missing table: %', tbl_name;
        ELSE
            RAISE NOTICE '✅ Table exists: %', tbl_name;
        END IF;
    END LOOP;
    
    IF array_length(missing_tables, 1) > 0 THEN
        RAISE EXCEPTION 'Missing required tables: %', array_to_string(missing_tables, ', ');
    ELSE
        RAISE NOTICE '✅ All required tables exist!';
    END IF;
END $$;

-- ============================================
-- PART 2: VERIFY TABLE SCHEMAS
-- ============================================

DO $$
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'VERIFYING TABLE SCHEMAS...';
    RAISE NOTICE '========================================';
    
    -- Check proactive_vehicle_events columns
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'proactive_vehicle_events' 
        AND column_name = 'device_id'
    ) THEN
        RAISE NOTICE '✅ proactive_vehicle_events has device_id';
    ELSE
        RAISE WARNING '❌ proactive_vehicle_events missing device_id';
    END IF;
    
    -- Check vehicle_chat_history has is_proactive column
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'vehicle_chat_history' 
        AND column_name = 'is_proactive'
    ) THEN
        RAISE NOTICE '✅ vehicle_chat_history has is_proactive column';
    ELSE
        RAISE WARNING '❌ vehicle_chat_history missing is_proactive column';
    END IF;
    
    -- Check vehicle_chat_history has alert_id column
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'vehicle_chat_history' 
        AND column_name = 'alert_id'
    ) THEN
        RAISE NOTICE '✅ vehicle_chat_history has alert_id column';
    ELSE
        RAISE WARNING '❌ vehicle_chat_history missing alert_id column';
    END IF;
    
    RAISE NOTICE '✅ Schema verification complete!';
END $$;

-- ============================================
-- PART 3: VERIFY TRIGGERS
-- ============================================

DO $$
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'VERIFYING TRIGGERS...';
    RAISE NOTICE '========================================';
    
    IF EXISTS (
        SELECT 1 FROM pg_trigger 
        WHERE tgname = 'trigger_alarm_to_chat'
    ) THEN
        RAISE NOTICE '✅ Trigger trigger_alarm_to_chat exists';
    ELSE
        RAISE WARNING '❌ Trigger trigger_alarm_to_chat does not exist';
    END IF;
    
    IF EXISTS (
        SELECT 1 FROM pg_proc 
        WHERE proname = 'notify_alarm_to_chat'
    ) THEN
        RAISE NOTICE '✅ Function notify_alarm_to_chat exists';
    ELSE
        RAISE WARNING '❌ Function notify_alarm_to_chat does not exist';
    END IF;
END $$;

-- ============================================
-- PART 4: VERIFY RLS POLICIES
-- ============================================

DO $$
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'VERIFYING RLS POLICIES...';
    RAISE NOTICE '========================================';
    
    IF EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'proactive_vehicle_events' 
        AND policyname = 'Users can view their vehicle events'
    ) THEN
        RAISE NOTICE '✅ RLS policy "Users can view their vehicle events" exists';
    ELSE
        RAISE WARNING '❌ RLS policy "Users can view their vehicle events" missing';
    END IF;
    
    IF EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'proactive_vehicle_events' 
        AND policyname = 'Users can acknowledge their vehicle events'
    ) THEN
        RAISE NOTICE '✅ RLS policy "Users can acknowledge their vehicle events" exists';
    ELSE
        RAISE WARNING '❌ RLS policy "Users can acknowledge their vehicle events" missing';
    END IF;
END $$;

-- ============================================
-- PART 5: SETUP TEST DATA
-- ============================================

DO $$
DECLARE
    test_device_id TEXT := '358657105967694';
    test_user_id UUID;
    test_profile_id UUID;
    test_vehicle_exists BOOLEAN;
    test_profile_exists BOOLEAN;
    test_assignment_exists BOOLEAN;
    user_exists BOOLEAN;
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'SETTING UP TEST DATA...';
    RAISE NOTICE '========================================';
    
    -- Get current user
    SELECT auth.uid() INTO test_user_id;
    
    -- Check if vehicle exists
    SELECT EXISTS (
        SELECT 1 FROM vehicles WHERE device_id = test_device_id
    ) INTO test_vehicle_exists;
    
    IF NOT test_vehicle_exists THEN
        RAISE NOTICE 'Creating test vehicle: %', test_device_id;
        INSERT INTO vehicles (device_id, device_name, created_at)
        VALUES (test_device_id, 'Test Vehicle ' || test_device_id, now())
        ON CONFLICT (device_id) DO NOTHING;
        RAISE NOTICE '✅ Test vehicle created';
    ELSE
        RAISE NOTICE '✅ Test vehicle already exists';
    END IF;
    
    -- Handle profile creation - only if user exists in auth.users
    IF test_user_id IS NOT NULL THEN
        -- Verify user exists in auth.users
        SELECT EXISTS (SELECT 1 FROM auth.users WHERE id = test_user_id) INTO user_exists;
        
        IF user_exists THEN
            -- Check if profile exists for current user
            SELECT EXISTS (
                SELECT 1 FROM profiles WHERE user_id = test_user_id
            ) INTO test_profile_exists;
            
            IF NOT test_profile_exists THEN
                RAISE NOTICE 'Creating test profile for user: %', test_user_id;
                INSERT INTO profiles (user_id, name, email, status)
                VALUES (test_user_id, 'Test User', 'test@example.com', 'active')
                RETURNING id INTO test_profile_id;
                RAISE NOTICE '✅ Test profile created: %', test_profile_id;
            ELSE
                SELECT id INTO test_profile_id FROM profiles WHERE user_id = test_user_id LIMIT 1;
                RAISE NOTICE '✅ Test profile already exists: %', test_profile_id;
            END IF;
        ELSE
            RAISE NOTICE '⚠️  User % does not exist in auth.users. Skipping profile creation.', test_user_id;
            RAISE NOTICE '⚠️  To create test data, you need to be authenticated with a valid user.';
            test_profile_id := NULL;
        END IF;
    ELSE
        RAISE NOTICE '⚠️  No authenticated user. Skipping profile creation.';
        RAISE NOTICE '⚠️  Note: Vehicle assignments require a profile. Create one manually if needed.';
        test_profile_id := NULL;
    END IF;
    
    -- Check if assignment exists
    SELECT EXISTS (
        SELECT 1 FROM vehicle_assignments WHERE device_id = test_device_id
    ) INTO test_assignment_exists;
    
    IF NOT test_assignment_exists THEN
        IF test_profile_id IS NOT NULL THEN
            RAISE NOTICE 'Creating test vehicle assignment';
            INSERT INTO vehicle_assignments (device_id, profile_id, vehicle_alias)
            VALUES (test_device_id, test_profile_id, 'Test Vehicle')
            ON CONFLICT (device_id) DO UPDATE SET profile_id = test_profile_id;
            RAISE NOTICE '✅ Test vehicle assignment created';
        ELSE
            RAISE NOTICE '⚠️  Cannot create vehicle assignment: No profile available.';
            RAISE NOTICE '⚠️  You can create an assignment manually later.';
        END IF;
    ELSE
        RAISE NOTICE '✅ Test vehicle assignment already exists';
    END IF;
    
    -- Create test LLM settings if they don't exist
    IF NOT EXISTS (
        SELECT 1 FROM vehicle_llm_settings WHERE device_id = test_device_id
    ) THEN
        RAISE NOTICE 'Creating test LLM settings';
        INSERT INTO vehicle_llm_settings (device_id, nickname, personality_mode, language_preference)
        VALUES (test_device_id, 'Test Vehicle', 'casual', 'english')
        ON CONFLICT (device_id) DO NOTHING;
        RAISE NOTICE '✅ Test LLM settings created';
    ELSE
        RAISE NOTICE '✅ Test LLM settings already exist';
    END IF;
    
    RAISE NOTICE '✅ Test data setup complete!';
END $$;

-- ============================================
-- PART 6: VERIFY TEST DATA
-- ============================================

DO $$
DECLARE
    test_device_id TEXT := '358657105967694';
    vehicle_count INTEGER;
    profile_count INTEGER;
    assignment_count INTEGER;
    llm_settings_count INTEGER;
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'VERIFYING TEST DATA...';
    RAISE NOTICE '========================================';
    
    SELECT COUNT(*) INTO vehicle_count FROM vehicles WHERE device_id = test_device_id;
    SELECT COUNT(*) INTO profile_count FROM profiles;
    SELECT COUNT(*) INTO assignment_count FROM vehicle_assignments WHERE device_id = test_device_id;
    SELECT COUNT(*) INTO llm_settings_count FROM vehicle_llm_settings WHERE device_id = test_device_id;
    
    RAISE NOTICE 'Vehicles for device %: %', test_device_id, vehicle_count;
    RAISE NOTICE 'Total profiles: %', profile_count;
    RAISE NOTICE 'Assignments for device %: %', test_device_id, assignment_count;
    RAISE NOTICE 'LLM settings for device %: %', test_device_id, llm_settings_count;
    
    IF vehicle_count > 0 AND llm_settings_count > 0 THEN
        RAISE NOTICE '✅ Core test data is set up correctly!';
        IF assignment_count > 0 THEN
            RAISE NOTICE '✅ Vehicle assignment exists (RLS filtering will work)';
        ELSE
            RAISE NOTICE '⚠️  Vehicle assignment missing (RLS may block access)';
        END IF;
    ELSE
        RAISE WARNING '⚠️  Some test data is missing. Check the output above.';
    END IF;
END $$;

-- ============================================
-- PART 7: SUMMARY
-- ============================================

DO $$
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'VERIFICATION COMPLETE!';
    RAISE NOTICE '========================================';
    RAISE NOTICE '';
    RAISE NOTICE 'Next steps:';
    RAISE NOTICE '1. Verify webhook is set up in Supabase Dashboard';
    RAISE NOTICE '2. Test with: INSERT INTO proactive_vehicle_events (...)';
    RAISE NOTICE '3. Check webhook delivery logs';
    RAISE NOTICE '4. Verify chat message appears in vehicle chat';
    RAISE NOTICE '';
END $$;

-- ============================================
-- QUICK TEST: Create a test alarm
-- ============================================
-- Uncomment the following to create a test alarm immediately:

/*
INSERT INTO proactive_vehicle_events (
  device_id, 
  event_type, 
  severity, 
  title, 
  message, 
  metadata
)
VALUES (
  '358657105967694',
  'test',
  'warning',
  'Test Alarm - Verification',
  'This is a test alarm created by the verification script',
  '{"source": "verification_script"}'::jsonb
);
*/
