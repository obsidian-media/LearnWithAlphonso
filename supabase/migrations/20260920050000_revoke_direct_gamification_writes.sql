-- Completes the fix 20260918140001_gamification_table_hardening.sql
-- deliberately deferred (see that migration's own comment): revokes direct
-- INSERT/UPDATE on the gamification tables from `authenticated` entirely,
-- closing the real gap CHECK constraints alone didn't -- a signed-in user
-- could still PATCH their own row via PostgREST directly (bypassing the
-- app's game logic) to e.g. set streak/xp to any CHECK-satisfying value
-- (no upper bound existed on either), or jump straight to `league_tier =
-- 'diamond'` with zero real progress. SELECT and existing DELETE grants
-- (GDPR export/delete, gradeReview's retire path) are untouched.
--
-- This was blocked on ios/LearnWithAlphonsoKit's ProgressSyncClient.swift
-- depending on direct writes for three operations (heart loss,
-- setCefrLevel, savePlacementResult) -- the three RPCs below give it an
-- equivalent, SECURITY DEFINER path for each instead. The web app's
-- equivalent writes (src/lib/sync.functions.ts, review.functions.ts) move
-- to the existing supabaseAdmin (service-role) client in the same change,
-- same trust boundary the complete-lesson/grade-review Edge Functions
-- already use for their own writes to these tables.
--
-- Coordinated with an iOS app-target release: the currently-shipped
-- TestFlight build's ProgressSyncClient still does direct writes, so it
-- will see permission-denied errors for heart loss / CEFR / placement
-- until a new build using the RPCs below ships. Everything else (lesson
-- completion, review grading, reads) is unaffected -- those already ran
-- through Edge Functions or RPCs.

CREATE OR REPLACE FUNCTION public.lose_heart()
RETURNS TABLE(hearts integer, hearts_refill_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  me uuid := auth.uid();
  cur_hearts integer;
  cur_refill timestamptz;
  next_hearts integer;
  next_refill timestamptz;
BEGIN
  IF me IS NULL THEN
    RETURN QUERY SELECT 5, NULL::timestamptz;
    RETURN;
  END IF;

  SELECT up.hearts, up.hearts_refill_at INTO cur_hearts, cur_refill
    FROM public.user_progress up WHERE up.user_id = me FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.user_progress (user_id) VALUES (me)
      ON CONFLICT (user_id) DO NOTHING;
    cur_hearts := 5;
    cur_refill := NULL;
  END IF;

  -- Resolve any pending refill before applying the loss (same rule as
  -- resolveHeartsRefill in src/lib/hearts.ts) -- a client with stale local
  -- state shouldn't lose a heart it already earned back.
  IF cur_refill IS NOT NULL AND now() >= cur_refill THEN
    cur_hearts := 5;
    cur_refill := NULL;
  END IF;

  next_hearts := GREATEST(0, cur_hearts - 1);
  next_refill := CASE WHEN next_hearts = 0 THEN now() + interval '30 minutes' ELSE NULL END;

  UPDATE public.user_progress SET hearts = next_hearts, hearts_refill_at = next_refill
    WHERE user_id = me;

  RETURN QUERY SELECT next_hearts, next_refill;
END;
$$;

REVOKE ALL ON FUNCTION public.lose_heart() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.lose_heart() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.set_cefr_level(_language text, _level text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  me uuid := auth.uid();
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  -- Invalid _level is rejected by language_progress_cefr_valid's CHECK
  -- constraint, not re-validated here -- one source of truth for the
  -- allowed value set.
  INSERT INTO public.language_progress (user_id, language, cefr_level)
    VALUES (me, _language, _level)
  ON CONFLICT (user_id, language) DO UPDATE SET cefr_level = excluded.cefr_level;
END;
$$;

REVOKE ALL ON FUNCTION public.set_cefr_level(text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_cefr_level(text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.save_placement_result(_language text, _level text, _score integer)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  me uuid := auth.uid();
  taken_at timestamptz := now();
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  INSERT INTO public.language_progress
      (user_id, language, cefr_level, placement_level, placement_score, placement_taken_at)
    VALUES (me, _language, _level, _level, _score, taken_at)
  ON CONFLICT (user_id, language) DO UPDATE SET
    cefr_level = excluded.cefr_level,
    placement_level = excluded.placement_level,
    placement_score = excluded.placement_score,
    placement_taken_at = excluded.placement_taken_at;

  RETURN taken_at;
END;
$$;

REVOKE ALL ON FUNCTION public.save_placement_result(text, text, integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.save_placement_result(text, text, integer) TO authenticated, service_role;

REVOKE INSERT, UPDATE ON public.user_progress FROM authenticated;
REVOKE INSERT, UPDATE ON public.language_progress FROM authenticated;
REVOKE INSERT, UPDATE ON public.lesson_completions FROM authenticated;
REVOKE INSERT, UPDATE ON public.user_achievements FROM authenticated;
REVOKE INSERT, UPDATE ON public.activity_days FROM authenticated;
REVOKE INSERT, UPDATE ON public.review_items FROM authenticated;
