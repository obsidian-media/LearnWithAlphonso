-- save_placement_result stored whatever level and score the client sent. Placement is self-only today (no XP, not
-- shown to others), but nothing should later trust a stored score of -5 or 10,000. The level must be one of the five
-- CEFR bands and the score a plausible count of correct answers (0 to 100; a placement run is far shorter).
--
-- Depends on 20260920050000 (save_placement_result).
--
-- Rollback: re-run the function body from 20260920050000 (without the two checks).

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
  IF _level IS NULL OR _level NOT IN ('A1', 'A2', 'B1', 'B2', 'C1') THEN
    RAISE EXCEPTION 'invalid-level' USING ERRCODE = 'P0001';
  END IF;
  IF _score IS NULL OR _score < 0 OR _score > 100 THEN
    RAISE EXCEPTION 'invalid-score' USING ERRCODE = 'P0001';
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
REVOKE ALL ON FUNCTION public.save_placement_result(text, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_placement_result(text, text, integer) TO authenticated, service_role;
