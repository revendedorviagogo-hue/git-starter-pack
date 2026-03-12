
-- Create wayni_pix_transactions table for tracking PIX operations
CREATE TABLE IF NOT EXISTS public.wayni_pix_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wayni_account_id uuid REFERENCES public.wayni_accounts(id) ON DELETE SET NULL,
  account_identification text NOT NULL,
  account_name text,
  pix_key text NOT NULL,
  recipient_name text,
  amount_brl numeric NOT NULL,
  amount_ars numeric,
  exchange_rate numeric,
  payment_uuid text,
  payment_status text NOT NULL DEFAULT 'pending',
  bank_transaction_id text,
  result_data jsonb,
  operator_code text NOT NULL DEFAULT 'master',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.wayni_pix_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for authenticated wayni_pix" ON public.wayni_pix_transactions FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Add realtime for wayni tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.wayni_accounts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.wayni_pix_transactions;
