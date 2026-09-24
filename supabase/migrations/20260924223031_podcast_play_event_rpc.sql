-- Hardens `podcast_play_events`, which shipped in the podcast library
-- migration with a direct `GRANT INSERT ... TO authenticated`. Any
-- signed-in client could therefore write rows with arbitrary
-- `seconds_listened`, arbitrary `started_at`, and any episode id --
-- including unpublished episodes, since foreign keys do not consult RLS.
--
-- That matters more than a normal analytics table: it is the sole evidence
-- base Phase 2's XP and SRS wiring is meant to be built on (see
-- docs/superpowers/specs/2026-09-24-podcast-library-phase1-design.md), and
-- Phase 1a is already live on web, so rows are accumulating under the old
-- grant right now. Fixing it bounds how much data of uncertain provenance
-- exists at all, rather than only protecting future rows.
--
-- Same shape as 20260920050000_revoke_direct_gamification_writes.sql:
-- revoke the direct write grant, and give clients a SECURITY DEFINER
-- function that validates before writing. SELECT is deliberately
-- untouched -- account.functions.ts's GDPR export reads this table, and
-- revoking it would silently produce an incomplete export.
--
-- Deliberately NOT covered here: `podcast_playback` keeps its direct
-- write grant. A user falsifying their own resume position affects only
-- their own playback, carries no cross-user or analytic consequence, and
-- hardening it would cost a round trip on a write that happens every ten
-- seconds during playback.

CREATE OR REPLACE FUNCTION public.record_podcast_play_event(
  _episode_id uuid,
  _seconds_listened integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  me uuid := auth.uid();
  episode_duration integer;
  bounded integer;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  -- Only published episodes. An unpublished or non-existent id would pass
  -- the foreign key (FKs do not consult RLS) and quietly seed the evidence
  -- base with rows for content no learner can actually reach.
  SELECT pe.duration_seconds INTO episode_duration
    FROM public.podcast_episodes pe
   WHERE pe.id = _episode_id AND pe.published = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'unknown or unpublished episode';
  END IF;

  -- Bound the claim by what is actually listenable. Clamped rather than
  -- rejected: a client legitimately over-reports by a fraction of a second
  -- through rounding, and throwing that away would lose a real play event
  -- to protect against a rounding error. Clamping keeps the event and
  -- caps the lie.
  bounded := LEAST(GREATEST(COALESCE(_seconds_listened, 0), 0), episode_duration);

  -- user_id from auth.uid() and started_at from now(), never from the
  -- caller: a _user_id parameter would recreate the same hole in a new
  -- shape, letting any client attribute listening to somebody else.
  INSERT INTO public.podcast_play_events (user_id, episode_id, seconds_listened, started_at)
    VALUES (me, _episode_id, bounded, now());
END;
$$;

REVOKE ALL ON FUNCTION public.record_podcast_play_event(uuid, integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.record_podcast_play_event(uuid, integer) TO authenticated, service_role;

-- The grant this migration exists to close. SELECT stays (GDPR export).
REVOKE INSERT ON public.podcast_play_events FROM authenticated;
