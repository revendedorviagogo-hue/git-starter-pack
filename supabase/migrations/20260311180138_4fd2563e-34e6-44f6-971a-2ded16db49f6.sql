INSERT INTO storage.buckets (id, name, public) VALUES ('imports', 'imports', true) ON CONFLICT DO NOTHING;
CREATE POLICY "Allow public read imports" ON storage.objects FOR SELECT USING (bucket_id = 'imports');
CREATE POLICY "Allow authenticated upload imports" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'imports');