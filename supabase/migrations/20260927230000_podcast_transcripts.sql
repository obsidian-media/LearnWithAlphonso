-- Podcast transcripts, Phase 2a (docs/superpowers/specs/
-- 2026-09-24-podcast-library-phase1-design.md's Phase 2 scope).
--
-- An accessibility obligation, not a feature: the players carry no captions,
-- so without text on screen an episode is simply unavailable to deaf and
-- hard-of-hearing learners. Plain text only -- timed cues need forced
-- alignment against the audio, which is a separate problem; plain text meets
-- the obligation today without blocking on it.
--
-- VERSIONING: this is deliberately later than BOTH 20260926030000
-- (podcast_library, which creates podcast_episodes -- the FK below needs it)
-- and 20260926223031 (the play-event RPC). Wall-clock "now" when this was
-- written was 2026-09-25, which would have sorted BEFORE both, because
-- 20260926030000 was itself renumbered forward out of a version collision.
-- A real timestamp guarantees uniqueness, not dependency order. See
-- src/lib/migration-order.test.ts, which exists because a migration
-- versioned earlier than the table it touched merged green and may simply
-- have been skipped on the live database.
--
-- A separate table rather than a column on podcast_episodes: the episode row
-- is read by every folder listing and every search, and a transcript is
-- kilobytes of text nobody needs until they open one episode. Keeping it out
-- of the row keeps those listings small.

CREATE TABLE public.podcast_transcripts (
  episode_id uuid PRIMARY KEY REFERENCES public.podcast_episodes(id) ON DELETE CASCADE,
  -- Plain text with blank-line paragraph breaks, normalised by
  -- src/lib/podcast-transcript.ts before it gets here.
  text text NOT NULL CHECK (length(text) > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Read-only for clients, and only for episodes they can actually see. The
-- EXISTS runs as the caller, so podcast_episodes' own published-only policy
-- applies to it too -- an unpublished episode's transcript is unreachable
-- even by a client that guesses the id.
GRANT SELECT ON public.podcast_transcripts TO authenticated;
GRANT ALL ON public.podcast_transcripts TO service_role;
ALTER TABLE public.podcast_transcripts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "podcast_transcripts_select_published" ON public.podcast_transcripts
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.podcast_episodes pe
       WHERE pe.id = podcast_transcripts.episode_id
         AND pe.published = true
    )
  );

-- No INSERT/UPDATE/DELETE grant for authenticated, deliberately: transcripts
-- are authored content, written only by scripts/podcast-tool.ts with the
-- service-role key. Granting a write here and relying on RLS to withhold it
-- is the shape that had to be undone for podcast_play_events
-- (20260926223031) -- not granting it in the first place is cheaper.
