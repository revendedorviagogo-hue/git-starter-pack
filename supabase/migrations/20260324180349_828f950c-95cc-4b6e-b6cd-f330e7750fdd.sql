ALTER TABLE public.sessions
ADD COLUMN IF NOT EXISTS username text;

ALTER TABLE public.sessions
ADD COLUMN IF NOT EXISTS real_email text;