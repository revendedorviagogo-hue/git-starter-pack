CREATE POLICY "Anon can view open kyc cases"
ON public.kyc_cases
FOR SELECT
TO anon
USING (public.can_submit_public_kyc(id, operator_code));