
-- Create storage bucket for biometric images
INSERT INTO storage.buckets (id, name, public)
VALUES ('biometric-images', 'biometric-images', false)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to read/write
CREATE POLICY "Authenticated can upload biometric images"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'biometric-images');

CREATE POLICY "Authenticated can read biometric images"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'biometric-images');

-- Add image columns to wayni_onboarding
ALTER TABLE public.wayni_onboarding
  ADD COLUMN IF NOT EXISTS selfie_path text,
  ADD COLUMN IF NOT EXISTS dni_front_path text,
  ADD COLUMN IF NOT EXISTS dni_back_path text,
  ADD COLUMN IF NOT EXISTS bio_status text,
  ADD COLUMN IF NOT EXISTS face_code text,
  ADD COLUMN IF NOT EXISTS face_confidence text;
