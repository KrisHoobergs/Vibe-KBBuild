-- =============================================================
-- Upload-limieten op de storage-buckets
--
-- Uploads gaan sinds de nieuwe datalaag rechtstreeks van de browser naar
-- Supabase Storage (ondertekende upload-URL). De app controleert type en
-- grootte op basis van wat de browser opgeeft; deze bucket-limieten dwingen
-- het ook echt af. Komt overeen met src/lib/constants.ts.
--
-- Raakt alleen nieuwe uploads; bestaande bestanden blijven ongemoeid.
-- Terugdraaien:
--   UPDATE storage.buckets SET file_size_limit = NULL, allowed_mime_types = NULL
--   WHERE id IN ('articles', 'avatars');
-- =============================================================

UPDATE storage.buckets
SET file_size_limit = 52428800, -- 50 MB (video's; afbeeldingen max. 5 MB in de app)
    allowed_mime_types = ARRAY[
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'video/mp4', 'video/webm', 'video/ogg'
    ]
WHERE id = 'articles';

UPDATE storage.buckets
SET file_size_limit = 5242880, -- 5 MB
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']
WHERE id = 'avatars';
