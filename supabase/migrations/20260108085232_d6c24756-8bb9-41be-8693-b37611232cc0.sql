-- Add initial bonus config for new users
INSERT INTO billing_config (key, value, description, currency)
VALUES ('new_user_bonus', 0, 'Automatic wallet credit for new user registrations', 'NGN')
ON CONFLICT (key) DO NOTHING;

-- Update the handle_new_user_wallet function to include bonus
CREATE OR REPLACE FUNCTION public.handle_new_user_wallet()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    bonus_amount numeric;
    new_wallet_id uuid;
BEGIN
    -- Get the bonus amount from billing_config
    SELECT value INTO bonus_amount
    FROM billing_config
    WHERE key = 'new_user_bonus';
    
    -- Default to 0 if not found
    IF bonus_amount IS NULL THEN
        bonus_amount := 0;
    END IF;
    
    -- Create wallet with bonus
    INSERT INTO public.wallets (user_id, balance)
    VALUES (NEW.id, bonus_amount)
    RETURNING id INTO new_wallet_id;
    
    -- If bonus > 0, create a transaction record
    IF bonus_amount > 0 THEN
        INSERT INTO public.wallet_transactions (wallet_id, amount, type, description)
        VALUES (new_wallet_id, bonus_amount, 'credit', 'Welcome bonus');
    END IF;
    
    RETURN NEW;
END;
$$;