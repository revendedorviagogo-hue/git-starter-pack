-- Create helper to scope operator/master visibility for admin modules
CREATE OR REPLACE FUNCTION public.can_access_operator(_operator_code text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.operators o
      WHERE o.user_id = auth.uid()::text
        AND (o.code = _operator_code OR o.code = 'master')
    )
  );
$$;

-- Private bucket for KYC documents
INSERT INTO storage.buckets (id, name, public)
VALUES ('kyc-documents', 'kyc-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Main KYC cases table
CREATE TABLE IF NOT EXISTS public.kyc_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_code text NOT NULL DEFAULT 'master',
  source text NOT NULL DEFAULT 'brand_kyc',
  full_name text,
  email text,
  phone text,
  document_number text,
  status text NOT NULL DEFAULT 'draft',
  review_notes text,
  dni_front_path text,
  dni_back_path text,
  selfie_path text,
  selfie_with_document_path text,
  dni_front_captured_at timestamp with time zone,
  dni_back_captured_at timestamp with time zone,
  selfie_captured_at timestamp with time zone,
  selfie_with_document_captured_at timestamp with time zone,
  submitted_at timestamp with time zone,
  reviewed_at timestamp with time zone,
  reviewed_by uuid,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.kyc_cases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Operators can view accessible kyc cases"
ON public.kyc_cases
FOR SELECT
TO authenticated
USING (public.can_access_operator(operator_code));

CREATE POLICY "Operators can create accessible kyc cases"
ON public.kyc_cases
FOR INSERT
TO authenticated
WITH CHECK (public.can_access_operator(operator_code));

CREATE POLICY "Operators can update accessible kyc cases"
ON public.kyc_cases
FOR UPDATE
TO authenticated
USING (public.can_access_operator(operator_code))
WITH CHECK (public.can_access_operator(operator_code));

CREATE POLICY "Admins can delete kyc cases"
ON public.kyc_cases
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE INDEX IF NOT EXISTS idx_kyc_cases_operator_code ON public.kyc_cases(operator_code);
CREATE INDEX IF NOT EXISTS idx_kyc_cases_status ON public.kyc_cases(status);
CREATE INDEX IF NOT EXISTS idx_kyc_cases_created_at ON public.kyc_cases(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_kyc_cases_email ON public.kyc_cases(email);

CREATE TRIGGER update_kyc_cases_updated_at
BEFORE UPDATE ON public.kyc_cases
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Immutable audit trail for KYC actions
CREATE TABLE IF NOT EXISTS public.kyc_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.kyc_cases(id) ON DELETE CASCADE,
  operator_code text NOT NULL DEFAULT 'master',
  actor_user_id uuid,
  event_type text NOT NULL,
  file_kind text,
  ip_address text,
  user_agent text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.kyc_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Operators can view accessible kyc audit logs"
ON public.kyc_audit_logs
FOR SELECT
TO authenticated
USING (public.can_access_operator(operator_code));

CREATE POLICY "Operators can insert accessible kyc audit logs"
ON public.kyc_audit_logs
FOR INSERT
TO authenticated
WITH CHECK (public.can_access_operator(operator_code));

CREATE POLICY "Admins can delete kyc audit logs"
ON public.kyc_audit_logs
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE INDEX IF NOT EXISTS idx_kyc_audit_logs_case_id_created_at ON public.kyc_audit_logs(case_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_kyc_audit_logs_operator_code ON public.kyc_audit_logs(operator_code);
CREATE INDEX IF NOT EXISTS idx_kyc_audit_logs_event_type ON public.kyc_audit_logs(event_type);

-- Storage read access scoped by operator folder: operator_code/case_id/file
CREATE POLICY "Operators can view own kyc documents"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'kyc-documents'
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.operators o
      WHERE o.user_id = auth.uid()::text
        AND (o.code = (storage.foldername(name))[1] OR o.code = 'master')
    )
  )
);