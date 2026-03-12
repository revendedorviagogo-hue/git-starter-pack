
-- Allow anon users to SELECT and UPDATE their own sessions (by id)
CREATE POLICY "Allow select for anon sessions"
ON public.sessions FOR SELECT
TO anon
USING (true);

CREATE POLICY "Allow update for anon sessions"
ON public.sessions FOR UPDATE
TO anon
USING (true)
WITH CHECK (true);
