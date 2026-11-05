-- The podcast-audio bucket is public: its files are served by URL (/storage/v1/object/public/...) with no
-- storage.objects policy at all. The SELECT policy from 20260926030000 added only one thing, the ability for anyone
-- with the public key to LIST the bucket, which revealed audio not yet linked from a published episode. No client
-- lists the bucket; the podcast tool and the admin app use the service role.
--
-- Rollback:
--   CREATE POLICY "podcast_audio_public_read" ON storage.objects
--     FOR SELECT TO anon, authenticated USING (bucket_id = 'podcast-audio');

DROP POLICY IF EXISTS "podcast_audio_public_read" ON storage.objects;
