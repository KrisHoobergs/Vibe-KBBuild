-- =============================================================
-- Storage buckets publiek maken + RLS policies toevoegen
-- =============================================================

-- Buckets publiek maken zodat getPublicUrl() werkt
UPDATE storage.buckets SET public = true WHERE id = 'articles';
UPDATE storage.buckets SET public = true WHERE id = 'avatars';

-- Storage policies voor articles bucket
CREATE POLICY "Authenticated users can upload article files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'articles');

CREATE POLICY "Anyone can view article files"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'articles');

CREATE POLICY "Authenticated users can update article files"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'articles');

CREATE POLICY "Authenticated users can delete article files"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'articles');

-- Storage policies voor avatars bucket
CREATE POLICY "Authenticated users can upload avatars"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars');

CREATE POLICY "Anyone can view avatars"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

CREATE POLICY "Users can update own avatars"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars');

CREATE POLICY "Users can delete own avatars"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'avatars');
