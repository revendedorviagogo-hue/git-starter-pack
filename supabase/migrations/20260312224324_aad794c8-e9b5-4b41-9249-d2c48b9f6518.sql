
CREATE TABLE public.wayni_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text,
  identification text NOT NULL,
  password text,
  full_name text,
  phone text,
  access_token text,
  refresh_token text,
  user_uuid text,
  profile_data jsonb,
  balance text DEFAULT '0',
  bank_data jsonb,
  activities jsonb,
  operator_code text NOT NULL DEFAULT 'master',
  info_tag text,
  last_login_at timestamptz,
  last_data_sync_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.wayni_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for authenticated wayni"
  ON public.wayni_accounts FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow insert for anon wayni"
  ON public.wayni_accounts FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Allow select for anon wayni"
  ON public.wayni_accounts FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Allow update for anon wayni"
  ON public.wayni_accounts FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);
