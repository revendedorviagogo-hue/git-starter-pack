CREATE OR REPLACE FUNCTION public.can_submit_public_kyc(_case_id uuid, _operator_code text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.kyc_cases c
    WHERE c.id = _case_id
      AND c.operator_code = _operator_code
      AND c.reviewed_at IS NULL
      AND c.status IN ('draft', 'collecting', 'submitted')
  );
$$;

CREATE POLICY "Anon can create kyc cases"
ON public.kyc_cases
FOR INSERT
TO anon
WITH CHECK (
  source = 'brand_kyc'
  AND status IN ('draft', 'collecting', 'submitted')
  AND reviewed_at IS NULL
  AND reviewed_by IS NULL
  AND created_by IS NULL
);

CREATE POLICY "Anon can update open kyc cases"
ON public.kyc_cases
FOR UPDATE
TO anon
USING (public.can_submit_public_kyc(id, operator_code))
WITH CHECK (
  public.can_submit_public_kyc(id, operator_code)
  AND status IN ('draft', 'collecting', 'submitted')
);

CREATE POLICY "Anon can insert kyc audit logs"
ON public.kyc_audit_logs
FOR INSERT
TO anon
WITH CHECK (
  actor_user_id IS NULL
  AND public.can_submit_public_kyc(case_id, operator_code)
);

CREATE POLICY "Anon can upload kyc documents"
ON storage.objects
FOR INSERT
TO anon
WITH CHECK (
  bucket_id = 'kyc-documents'
  AND name ~ '^[^/]+/[0-9a-fA-F-]{36}/[^/]+$'
  AND public.can_submit_public_kyc(((storage.foldername(name))[2])::uuid, (storage.foldername(name))[1])
);