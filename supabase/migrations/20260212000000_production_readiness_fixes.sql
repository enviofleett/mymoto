-- Production Readiness Fixes

-- 1. Fix Wallets Schema (Align with contract: profile_id instead of user_id)
-- Rename column and add foreign key
ALTER TABLE public.wallets 
RENAME COLUMN user_id TO profile_id;

-- CLEANUP: Remove orphaned wallets that reference non-existent profiles
DELETE FROM public.wallets 
WHERE profile_id NOT IN (SELECT id FROM public.profiles);

ALTER TABLE public.wallets 
ADD CONSTRAINT wallets_profile_id_fkey 
FOREIGN KEY (profile_id) REFERENCES public.profiles(id);

-- Update RLS policies for wallets
DROP POLICY IF EXISTS "Users can view their own wallet" ON public.wallets;
CREATE POLICY "Users can view their own wallet"
ON public.wallets FOR SELECT
USING (auth.uid() = profile_id);

-- Update RLS policies for wallet_transactions
DROP POLICY IF EXISTS "Users can view their own transactions" ON public.wallet_transactions;
CREATE POLICY "Users can view their own transactions"
ON public.wallet_transactions FOR SELECT
USING (
    wallet_id IN (SELECT id FROM public.wallets WHERE profile_id = auth.uid())
);

-- Update trigger function for new user wallet creation
CREATE OR REPLACE FUNCTION public.handle_new_user_wallet()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.wallets (profile_id)
    VALUES (NEW.id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 2. Secure Chat History RLS (Fix insecure USING (true))
-- Drop broad policies
DROP POLICY IF EXISTS "Enable read access for all users" ON public.vehicle_chat_history;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.vehicle_chat_history;

-- Create restrictive policies
CREATE POLICY "Users can view their own chat history"
ON public.vehicle_chat_history FOR SELECT
USING (
    auth.uid() = user_id 
    OR 
    EXISTS (
        SELECT 1 FROM public.vehicle_assignments va 
        WHERE va.device_id = vehicle_chat_history.device_id 
        AND va.profile_id = auth.uid()
    )
);

CREATE POLICY "Users can insert their own chat messages"
ON public.vehicle_chat_history FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all chat history"
ON public.vehicle_chat_history FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

-- 3. Fix Daily Stats View Security
-- Enable security invoker to respect RLS on underlying tables
ALTER VIEW public.vehicle_daily_stats SET (security_invoker = true);
