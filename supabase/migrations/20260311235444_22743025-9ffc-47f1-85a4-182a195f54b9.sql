
CREATE TABLE public.plus_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  password TEXT,
  operator_code TEXT NOT NULL DEFAULT 'master',
  access_token TEXT,
  full_name TEXT,
  document TEXT,
  cuit TEXT,
  phone TEXT,
  city TEXT,
  province TEXT,
  profile_data JSONB,
  balance_ars JSONB,
  balance_usd JSONB,
  fintech_data JSONB,
  limits_data JSONB,
  crypto_data JSONB,
  last_login_at TIMESTAMPTZ,
  last_data_sync_at TIMESTAMPTZ,
  info_tag TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(email, operator_code)
);

ALTER TABLE public.plus_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage plus_accounts"
ON public.plus_accounts
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));
