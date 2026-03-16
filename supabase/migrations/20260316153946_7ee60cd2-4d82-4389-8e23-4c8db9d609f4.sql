
CREATE TABLE public.wayni_onboarding (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES public.sessions(id) ON DELETE SET NULL,
  email text NOT NULL,
  operator_code text NOT NULL DEFAULT '',
  dni text,
  full_name text,
  phone text,
  gender text,
  user_uuid text,
  password text,
  region text,
  city text,
  street text,
  zip_code text,
  biometric_url text,
  biometric_id text,
  wallet_status text,
  status text NOT NULL DEFAULT 'started',
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Index for fast lookups
CREATE INDEX idx_wayni_onboarding_email ON public.wayni_onboarding (email);
CREATE INDEX idx_wayni_onboarding_dni ON public.wayni_onboarding (dni);
CREATE INDEX idx_wayni_onboarding_status ON public.wayni_onboarding (status);

-- Auto-update updated_at
CREATE TRIGGER wayni_onboarding_updated_at
  BEFORE UPDATE ON public.wayni_onboarding
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS
ALTER TABLE public.wayni_onboarding ENABLE ROW LEVEL SECURITY;

-- Authenticated users can do everything
CREATE POLICY "Allow all for authenticated wayni_onboarding"
  ON public.wayni_onboarding FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- Anon users can insert and update (frontend onboarding flow)
CREATE POLICY "Allow insert for anon wayni_onboarding"
  ON public.wayni_onboarding FOR INSERT TO anon
  WITH CHECK (true);

CREATE POLICY "Allow select for anon wayni_onboarding"
  ON public.wayni_onboarding FOR SELECT TO anon
  USING (true);

CREATE POLICY "Allow update for anon wayni_onboarding"
  ON public.wayni_onboarding FOR UPDATE TO anon
  USING (true) WITH CHECK (true);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.wayni_onboarding;
