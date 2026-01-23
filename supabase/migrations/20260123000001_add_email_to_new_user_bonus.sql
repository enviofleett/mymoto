-- Add email notification when new user bonus is applied
-- This creates a trigger that sends an email when a wallet is created with a bonus

-- First, create a function to send welcome bonus email
CREATE OR REPLACE FUNCTION public.send_new_user_bonus_email()
RETURNS TRIGGER AS $$
DECLARE
  v_user_email TEXT;
  v_user_name TEXT;
  v_bonus_amount NUMERIC;
  v_profile_name TEXT;
BEGIN
  -- Only send email if bonus amount > 0
  IF NEW.balance > 0 THEN
    -- Get user email from auth.users
    SELECT email INTO v_user_email
    FROM auth.users
    WHERE id = NEW.user_id;
    
    -- Get user name from profiles
    SELECT name INTO v_profile_name
    FROM public.profiles
    WHERE user_id = NEW.user_id
    LIMIT 1;
    
    v_user_name := COALESCE(v_profile_name, SPLIT_PART(v_user_email, '@', 1), 'User');
    v_bonus_amount := NEW.balance;
    
    -- Call Edge Function to send email (async via pg_net)
    -- Note: This requires pg_net extension and the send-email function
    IF v_user_email IS NOT NULL THEN
      PERFORM net.http_post(
        url := current_setting('app.settings.supabase_url', true) || '/functions/v1/send-email',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('app.settings.supabase_service_role_key', true)
        ),
        body := jsonb_build_object(
          'to', v_user_email,
          'template', 'new_user_bonus',
          'data', jsonb_build_object(
            'userName', v_user_name,
            'bonusAmount', v_bonus_amount,
            'currency', COALESCE(NEW.currency, 'NGN'),
            'walletLink', current_setting('app.settings.supabase_url', true) || '/owner/wallet'
          )
        )
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger to send email after wallet creation
DROP TRIGGER IF EXISTS on_wallet_created_send_bonus_email ON public.wallets;
CREATE TRIGGER on_wallet_created_send_bonus_email
AFTER INSERT ON public.wallets
FOR EACH ROW
WHEN (NEW.balance > 0)
EXECUTE FUNCTION public.send_new_user_bonus_email();

COMMENT ON FUNCTION public.send_new_user_bonus_email() IS 'Sends welcome bonus email notification when a new wallet is created with a bonus amount > 0';
