-- Converts the three hearts-economy server functions I own outright
-- (restoreHeartsRemote, buyHeartWithXpRemote, claimReviewClearBonusRemote
-- in src/lib/sync.functions.ts / src/lib/review.functions.ts) from
-- read-then-write-under-RLS handlers into atomic SECURITY DEFINER RPCs.
--
-- Two problems this fixes at once (2026-09-18 comprehensive audit,
-- findings C1/M1/P4/P5/P6): the prior implementation raced under
-- concurrent calls (no row lock between the read and the write -- two
-- overlapping requests could both pass a "not full"/"not claimed today"
-- check before either wrote), and it made several unnecessary sequential
-- round trips per call. Each function below takes a `FOR UPDATE` lock on
-- the user's row for the duration of the call, making the whole
-- check-then-write atomic, and does its reads/writes as part of one
-- function invocation instead of multiple round trips from the caller.

CREATE OR REPLACE FUNCTION public.restore_hearts_if_due()
RETURNS TABLE(hearts integer, hearts_refill_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  me uuid := auth.uid();
  cur_hearts integer;
  cur_refill timestamptz;
BEGIN
  IF me IS NULL THEN
    RETURN QUERY SELECT 5, NULL::timestamptz;
    RETURN;
  END IF;

  SELECT up.hearts, up.hearts_refill_at INTO cur_hearts, cur_refill
    FROM public.user_progress up WHERE up.user_id = me FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 5, NULL::timestamptz;
    RETURN;
  END IF;

  IF cur_refill IS NOT NULL AND now() >= cur_refill THEN
    UPDATE public.user_progress SET hearts = 5, hearts_refill_at = NULL
      WHERE user_id = me;
    RETURN QUERY SELECT 5, NULL::timestamptz;
  ELSE
    RETURN QUERY SELECT cur_hearts, cur_refill;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.restore_hearts_if_due() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.restore_hearts_if_due() TO authenticated, service_role;

-- reason is one of: NULL (ok), 'hearts-full', 'insufficient-xp', 'unauthenticated'
CREATE OR REPLACE FUNCTION public.buy_heart_with_xp(_course text, _cost integer DEFAULT 50)
RETURNS TABLE(ok boolean, reason text, hearts integer, xp integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  me uuid := auth.uid();
  cur_hearts integer;
  cur_refill timestamptz;
  cur_xp integer;
BEGIN
  IF me IS NULL THEN
    RETURN QUERY SELECT false, 'unauthenticated', NULL::integer, NULL::integer;
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

  IF cur_refill IS NOT NULL AND now() >= cur_refill THEN
    cur_hearts := 5;
    cur_refill := NULL;
  END IF;

  IF cur_hearts >= 5 THEN
    RETURN QUERY SELECT false, 'hearts-full', cur_hearts, NULL::integer;
    RETURN;
  END IF;

  SELECT lp.xp INTO cur_xp FROM public.language_progress lp
    WHERE lp.user_id = me AND lp.language = _course FOR UPDATE;
  IF NOT FOUND OR cur_xp IS NULL THEN
    cur_xp := 0;
  END IF;

  IF cur_xp < _cost THEN
    RETURN QUERY SELECT false, 'insufficient-xp', cur_hearts, cur_xp;
    RETURN;
  END IF;

  UPDATE public.user_progress SET hearts = cur_hearts + 1, hearts_refill_at = NULL
    WHERE user_id = me;
  UPDATE public.language_progress SET xp = cur_xp - _cost
    WHERE user_id = me AND language = _course;

  RETURN QUERY SELECT true, NULL::text, cur_hearts + 1, cur_xp - _cost;
END;
$$;

REVOKE ALL ON FUNCTION public.buy_heart_with_xp(text, integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.buy_heart_with_xp(text, integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.claim_review_clear_bonus(_course text)
RETURNS TABLE(granted boolean, hearts integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  me uuid := auth.uid();
  due_count integer;
  cur_hearts integer;
  cur_refill timestamptz;
  cur_bonus_date date;
  today date := CURRENT_DATE;
BEGIN
  IF me IS NULL THEN
    RETURN QUERY SELECT false, NULL::integer;
    RETURN;
  END IF;

  SELECT count(*) INTO due_count FROM public.review_items ri
    WHERE ri.user_id = me AND ri.language = _course AND ri.due_on <= today;
  IF due_count > 0 THEN
    RETURN QUERY SELECT false, NULL::integer;
    RETURN;
  END IF;

  SELECT up.hearts, up.hearts_refill_at, up.last_review_bonus_date
    INTO cur_hearts, cur_refill, cur_bonus_date
    FROM public.user_progress up WHERE up.user_id = me FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.user_progress (user_id) VALUES (me)
      ON CONFLICT (user_id) DO NOTHING;
    cur_hearts := 5;
    cur_refill := NULL;
    cur_bonus_date := NULL;
  END IF;

  IF cur_bonus_date IS NOT NULL AND cur_bonus_date = today THEN
    RETURN QUERY SELECT false, cur_hearts;
    RETURN;
  END IF;

  IF cur_refill IS NOT NULL AND now() >= cur_refill THEN
    cur_hearts := 5;
    cur_refill := NULL;
  END IF;

  UPDATE public.user_progress
    SET hearts = LEAST(5, cur_hearts + 1), hearts_refill_at = NULL, last_review_bonus_date = today
    WHERE user_id = me;

  RETURN QUERY SELECT true, LEAST(5, cur_hearts + 1);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_review_clear_bonus(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.claim_review_clear_bonus(text) TO authenticated, service_role;
