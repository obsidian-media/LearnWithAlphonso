-- Every episode records who made its audio, so "only licensed audio is
-- published" is a query, not a memory. On 2026-10-07 all 69 published episodes
-- were uploads made with the ElevenLabs free tier or Edge TTS, and nothing in
-- the database said so.
--
-- 'unknown' is the default on purpose: existing rows and admin-app uploads do
-- not know, and scripts/podcast-tool.ts refuses to publish anything that is
-- not 'deepgram' or 'human' (src/lib/podcast-provenance.ts). The allowed list
-- is pinned against that module by src/lib/podcast-migrations.test.ts.
--
-- Clients already hold table-level SELECT on podcast_episodes, so the new
-- columns are readable (harmless metadata). Client INSERT/UPDATE/DELETE were
-- revoked in 20260930010000_revoke_podcast_excess_grants.sql; nothing here
-- grants anything.
--
-- Rollback: export first if provenance has been recorded
-- (SELECT id, slug, voice_provider, voice_model FROM public.podcast_episodes),
-- then regenerate src/integrations/supabase/types.ts after:
--   ALTER TABLE public.podcast_episodes DROP COLUMN voice_model, DROP COLUMN voice_provider;
ALTER TABLE public.podcast_episodes
  ADD COLUMN voice_provider text NOT NULL DEFAULT 'unknown'
    CONSTRAINT podcast_episodes_voice_provider_check
    CHECK (voice_provider IN ('deepgram', 'elevenlabs', 'edge-tts', 'human', 'unknown')),
  ADD COLUMN voice_model text;

-- source = 'tts' rows were synthesised by podcast-tool.ts through Deepgram.
-- None existed on 2026-10-07; the statement is here so the migration is
-- correct whenever it runs.
UPDATE public.podcast_episodes SET voice_provider = 'deepgram' WHERE source = 'tts';

COMMENT ON COLUMN public.podcast_episodes.voice_provider IS
  'Who generated or recorded the audio. Only deepgram and human may be published (podcast-tool.ts publish).';
COMMENT ON COLUMN public.podcast_episodes.voice_model IS
  'The TTS model or voice id, e.g. aura-2-thalia-en. NULL for human recordings.';
