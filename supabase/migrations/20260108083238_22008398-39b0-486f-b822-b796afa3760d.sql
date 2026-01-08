-- 1. Wallets table (one per user)
CREATE TABLE public.wallets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE,
    balance DECIMAL(12, 2) DEFAULT 0.00,
    currency TEXT DEFAULT 'NGN',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 2. Wallet Transactions (ledger)
CREATE TABLE public.wallet_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_id UUID NOT NULL REFERENCES public.wallets(id) ON DELETE CASCADE,
    amount DECIMAL(12, 2) NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('credit', 'debit')),
    description TEXT,
    reference TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 3. Billing Configuration (admin-managed)
CREATE TABLE public.billing_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key TEXT NOT NULL UNIQUE,
    value DECIMAL(12, 2) NOT NULL,
    currency TEXT DEFAULT 'NGN',
    description TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_by UUID
);

-- Insert default daily rate
INSERT INTO public.billing_config (key, value, description)
VALUES ('daily_llm_rate', 500.00, 'Daily charge for LLM-enabled vehicles');

-- 4. Add last_billing_date to vehicle_llm_settings
ALTER TABLE public.vehicle_llm_settings 
ADD COLUMN IF NOT EXISTS last_billing_date TIMESTAMP WITH TIME ZONE;

-- 5. Enable RLS
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_config ENABLE ROW LEVEL SECURITY;

-- 6. Wallet Policies
CREATE POLICY "Users can view their own wallet"
ON public.wallets FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all wallets"
ON public.wallets FOR SELECT
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role can manage wallets"
ON public.wallets FOR ALL
USING (true)
WITH CHECK (true);

-- 7. Wallet Transactions Policies
CREATE POLICY "Users can view their own transactions"
ON public.wallet_transactions FOR SELECT
USING (
    wallet_id IN (SELECT id FROM public.wallets WHERE user_id = auth.uid())
);

CREATE POLICY "Admins can view all transactions"
ON public.wallet_transactions FOR SELECT
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role can manage transactions"
ON public.wallet_transactions FOR ALL
USING (true)
WITH CHECK (true);

-- 8. Billing Config Policies
CREATE POLICY "Authenticated users can read billing config"
ON public.billing_config FOR SELECT
USING (true);

CREATE POLICY "Admins can manage billing config"
ON public.billing_config FOR ALL
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

-- 9. Function to update wallet balance
CREATE OR REPLACE FUNCTION public.update_wallet_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_wallets_updated_at
BEFORE UPDATE ON public.wallets
FOR EACH ROW
EXECUTE FUNCTION public.update_wallet_updated_at();

-- 10. Function to auto-create wallet for new users
CREATE OR REPLACE FUNCTION public.handle_new_user_wallet()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.wallets (user_id)
    VALUES (NEW.id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created_wallet
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user_wallet();

-- 11. Index for faster queries
CREATE INDEX idx_wallet_transactions_wallet_id ON public.wallet_transactions(wallet_id);
CREATE INDEX idx_wallet_transactions_created_at ON public.wallet_transactions(created_at DESC);