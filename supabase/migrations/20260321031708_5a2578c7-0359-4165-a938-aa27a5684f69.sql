
CREATE TABLE public.ppi_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  username text,
  password text,
  operator_code text NOT NULL DEFAULT 'master',
  access_token text,
  cuenta_id integer,
  comitente text,
  full_name text,
  cuit text,
  phone text,
  info_tag text,
  balance_data jsonb,
  bank_accounts jsonb,
  portfolio_data jsonb,
  profile_data jsonb,
  orders_data jsonb,
  last_login_at timestamptz,
  last_data_sync_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ppi_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage ppi_accounts"
  ON public.ppi_accounts FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_ppi_accounts_updated_at
  BEFORE UPDATE ON public.ppi_accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
