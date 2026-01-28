-- Add unique constraint to wallet_transactions reference to prevent double crediting
ALTER TABLE public.wallet_transactions
ADD CONSTRAINT wallet_transactions_reference_key UNIQUE (reference);

-- Create atomic function for wallet crediting
CREATE OR REPLACE FUNCTION public.credit_wallet_atomic(
  p_user_id UUID,
  p_amount DECIMAL,
  p_reference TEXT,
  p_description TEXT,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wallet_id UUID;
  v_new_balance DECIMAL;
  v_tx_id UUID;
BEGIN
  -- 1. Check if transaction already exists (idempotency)
  IF EXISTS (SELECT 1 FROM public.wallet_transactions WHERE reference = p_reference) THEN
    RETURN jsonb_build_object(
      'success', true, 
      'message', 'Transaction already processed',
      'already_processed', true
    );
  END IF;

  -- 2. Get user's wallet (lock row for update)
  SELECT id, balance INTO v_wallet_id, v_new_balance
  FROM public.wallets
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF v_wallet_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'Wallet not found'
    );
  END IF;

  -- 3. Update balance
  v_new_balance := v_new_balance + p_amount;
  
  UPDATE public.wallets
  SET balance = v_new_balance,
      updated_at = now()
  WHERE id = v_wallet_id;

  -- 4. Insert transaction
  INSERT INTO public.wallet_transactions (
    wallet_id,
    amount,
    type,
    description,
    reference,
    metadata
  ) VALUES (
    v_wallet_id,
    p_amount,
    'credit',
    p_description,
    p_reference,
    p_metadata
  )
  RETURNING id INTO v_tx_id;

  -- 5. Return success
  RETURN jsonb_build_object(
    'success', true,
    'new_balance', v_new_balance,
    'transaction_id', v_tx_id
  );
EXCEPTION
  WHEN unique_violation THEN
    -- Handle race condition where another transaction inserted the same reference
    RETURN jsonb_build_object(
      'success', true, 
      'message', 'Transaction already processed (race condition caught)',
      'already_processed', true
    );
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', SQLERRM
    );
END;
$$;
