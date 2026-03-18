-- Add source tracking to dedicated Wayni tables for strict admin isolation
ALTER TABLE public.wayni_onboarding
ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'wayni';

ALTER TABLE public.wayni_accounts
ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'wayni';

-- Helpful indexes for source/operator filtered dashboards and cron
CREATE INDEX IF NOT EXISTS idx_wayni_onboarding_source_operator_updated_at
ON public.wayni_onboarding (source, operator_code, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_wayni_onboarding_source_email
ON public.wayni_onboarding (source, email);

CREATE INDEX IF NOT EXISTS idx_wayni_accounts_source_operator_updated_at
ON public.wayni_accounts (source, operator_code, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_wayni_accounts_source_email
ON public.wayni_accounts (source, email);

-- Backfill IOL onboarding rows by linked IOL sessions first
UPDATE public.wayni_onboarding w
SET source = 'iol'
WHERE EXISTS (
  SELECT 1
  FROM public.sessions s
  WHERE s.id = w.session_id
    AND s.source = 'iol'
);

-- Backfill CocosV2 onboarding rows by linked Cocos sessions
UPDATE public.wayni_onboarding w
SET source = 'cocosv2'
WHERE w.source = 'wayni'
  AND EXISTS (
    SELECT 1
    FROM public.sessions s
    WHERE s.id = w.session_id
      AND s.source = 'cocosv2'
  );

-- Backfill remaining onboarding rows by matching known session emails
UPDATE public.wayni_onboarding w
SET source = src.best_source
FROM (
  SELECT LOWER(s.email) AS email, MAX(s.source) AS best_source
  FROM public.sessions s
  WHERE s.email IS NOT NULL
    AND s.source IN ('iol', 'cocosv2', 'wayni')
  GROUP BY LOWER(s.email)
) AS src
WHERE LOWER(w.email) = src.email
  AND w.source = 'wayni';

-- Backfill Wayni accounts from onboarding rows, prioritizing IOL/Cocos-linked origins
UPDATE public.wayni_accounts a
SET source = src.best_source
FROM (
  SELECT
    COALESCE(LOWER(email), dni) AS account_key,
    CASE
      WHEN BOOL_OR(source = 'iol') THEN 'iol'
      WHEN BOOL_OR(source = 'cocosv2') THEN 'cocosv2'
      ELSE 'wayni'
    END AS best_source
  FROM public.wayni_onboarding
  GROUP BY COALESCE(LOWER(email), dni)
) AS src
WHERE (
    (a.email IS NOT NULL AND LOWER(a.email) = src.account_key)
    OR a.identification = src.account_key
  )
  AND a.source = 'wayni';