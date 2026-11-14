-- Hearts refill steadily: while a learner has fewer than 5 hearts, one heart comes back every 30 minutes.
--
-- Until now hearts_refill_at was set only when hearts reached 0 (and then gave a full refill), so a learner at 1 to 4
-- hearts never got any back. New rule (owner decision 2026-11-14):
--   * hearts below 5: one heart every 30 minutes, counted from the moment the learner first dropped below 5, or from
--     the last refill. hearts_refill_at is when the NEXT heart arrives; it is NULL exactly when hearts are 5.
--   * the wait carries over: losing a heart while a refill is pending keeps the clock; time away adds every heart that
--     came due (two hours away = four hearts), capped at 5, with the leftover time kept for the next one.
--   * a gain (XP purchase, review-clear bonus) keeps a running clock while hearts stay below 5, and clears it at 5.
-- The same rule is in src/lib/hearts.ts, supabase/functions/_shared/hearts.ts, the iOS Kit HeartsEconomy.swift and the
-- Android HeartsEconomy.kt. Keep the five in step.
--
-- Redefines (latest definitions win): lose_heart, restore_hearts_if_due, buy_heart_with_xp, claim_review_clear_bonus,
-- settle_lesson_hearts. Signatures and return shapes are unchanged, so shipped clients keep working.
-- Last: every learner stuck below 5 hearts with no timer is restored to 5 (they were never given a way back).

-- The one place the refill rule lives in SQL. Pure, no table access: internal helper, no client EXECUTE.
CREATE FUNCTION public.hearts_refill_resolve(_hearts integer, _refill timestamptz, _now timestamptz)
RETURNS TABLE(out_hearts integer, out_refill timestamptz)
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  h integer := _hearts;
  r timestamptz := _refill;
  due integer;
BEGIN
  IF h >= 5 THEN
    RETURN QUERY SELECT 5, NULL::timestamptz;
    RETURN;
  END IF;
  -- Below 5 with no clock (an old row): start the clock now rather than leave the learner stuck.
  IF r IS NULL THEN
    RETURN QUERY SELECT h, _now + interval '30 minutes';
    RETURN;
  END IF;
  IF _now >= r THEN
    due := 1 + floor(extract(epoch FROM (_now - r)) / 1800)::integer;
    h := LEAST(5, h + due);
    r := r + due * interval '30 minutes';
  END IF;
  IF h >= 5 THEN
    r := NULL;
  END IF;
  RETURN QUERY SELECT h, r;
END;
$$;
REVOKE ALL ON FUNCTION public.hearts_refill_resolve(integer, timestamptz, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hearts_refill_resolve(integer, timestamptz, timestamptz) TO service_role;

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
  new_hearts integer;
  new_refill timestamptz;
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

  SELECT r.out_hearts, r.out_refill INTO new_hearts, new_refill
    FROM public.hearts_refill_resolve(cur_hearts, cur_refill, now()) r;

  IF new_hearts IS DISTINCT FROM cur_hearts OR new_refill IS DISTINCT FROM cur_refill THEN
    UPDATE public.user_progress SET hearts = new_hearts, hearts_refill_at = new_refill
      WHERE user_id = me;
  END IF;
  RETURN QUERY SELECT new_hearts, new_refill;
END;
$$;
REVOKE ALL ON FUNCTION public.restore_hearts_if_due() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.restore_hearts_if_due() TO authenticated, service_role;

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
  credit text;
BEGIN
  IF me IS NULL THEN
    RETURN QUERY SELECT 5, NULL::timestamptz;
    RETURN;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('lesson_hearts:' || me::text, 0));

  SELECT up.hearts, up.hearts_refill_at INTO cur_hearts, cur_refill
    FROM public.user_progress up WHERE up.user_id = me FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.user_progress (user_id) VALUES (me)
      ON CONFLICT (user_id) DO NOTHING;
    cur_hearts := 5;
    cur_refill := NULL;
  END IF;

  -- Alphonso Pro: unlimited hearts.
  IF public.hearts_unlimited(me) THEN
    RETURN QUERY SELECT cur_hearts, cur_refill;
    RETURN;
  END IF;

  -- This miss was already charged when its lesson was settled (the call arrived after the completion).
  SELECT s.token_hash INTO credit FROM public.lesson_heart_settlements s
    WHERE s.user_id = me AND s.credits_left > 0 AND s.settled_at > now() - interval '15 minutes'
    ORDER BY s.settled_at LIMIT 1;
  IF credit IS NOT NULL THEN
    UPDATE public.lesson_heart_settlements SET credits_left = credits_left - 1 WHERE token_hash = credit;
    RETURN QUERY SELECT cur_hearts, cur_refill;
    RETURN;
  END IF;

  -- Add the hearts that came due since the row was last written, then take one. A refill already running keeps its
  -- clock (losing a heart does not reset the wait); from 5 hearts a new 30-minute clock starts now.
  SELECT r.out_hearts, r.out_refill INTO cur_hearts, cur_refill
    FROM public.hearts_refill_resolve(cur_hearts, cur_refill, now()) r;

  next_hearts := GREATEST(0, cur_hearts - 1);
  next_refill := COALESCE(cur_refill, now() + interval '30 minutes');

  UPDATE public.user_progress SET hearts = next_hearts, hearts_refill_at = next_refill
    WHERE user_id = me;
  INSERT INTO public.heart_loss_reports (user_id) VALUES (me);

  RETURN QUERY SELECT next_hearts, next_refill;
END;
$$;
REVOKE ALL ON FUNCTION public.lose_heart() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.lose_heart() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.buy_heart_with_xp(_course text)
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
  cost constant integer := 50;
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

  SELECT r.out_hearts, r.out_refill INTO cur_hearts, cur_refill
    FROM public.hearts_refill_resolve(cur_hearts, cur_refill, now()) r;

  IF cur_hearts >= 5 THEN
    RETURN QUERY SELECT false, 'hearts-full', cur_hearts, NULL::integer;
    RETURN;
  END IF;

  SELECT lp.xp INTO cur_xp FROM public.language_progress lp
    WHERE lp.user_id = me AND lp.language = _course FOR UPDATE;
  IF NOT FOUND OR cur_xp IS NULL THEN
    cur_xp := 0;
  END IF;

  IF cur_xp < cost THEN
    RETURN QUERY SELECT false, 'insufficient-xp', cur_hearts, cur_xp;
    RETURN;
  END IF;

  -- The bought heart keeps a running clock while hearts are still below 5, and clears it at 5.
  UPDATE public.user_progress
    SET hearts = cur_hearts + 1,
        hearts_refill_at = CASE WHEN cur_hearts + 1 >= 5 THEN NULL ELSE cur_refill END
    WHERE user_id = me;
  UPDATE public.language_progress SET xp = cur_xp - cost
    WHERE user_id = me AND language = _course;

  RETURN QUERY SELECT true, NULL::text, cur_hearts + 1, cur_xp - cost;
END;
$$;
REVOKE ALL ON FUNCTION public.buy_heart_with_xp(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.buy_heart_with_xp(text) TO authenticated, service_role;

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

  SELECT r.out_hearts, r.out_refill INTO cur_hearts, cur_refill
    FROM public.hearts_refill_resolve(cur_hearts, cur_refill, now()) r;

  -- The bonus heart keeps a running clock while hearts are still below 5, and clears it at 5.
  UPDATE public.user_progress
    SET hearts = LEAST(5, cur_hearts + 1),
        hearts_refill_at = CASE WHEN cur_hearts + 1 >= 5 THEN NULL ELSE cur_refill END,
        last_review_bonus_date = today
    WHERE user_id = me;

  RETURN QUERY SELECT true, LEAST(5, cur_hearts + 1);
END;
$$;
REVOKE ALL ON FUNCTION public.claim_review_clear_bonus(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.claim_review_clear_bonus(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.settle_lesson_hearts(
  _user_id uuid,
  _token_hash text,
  _misses integer,
  _since timestamptz,
  _enforce boolean,
  _pro boolean
)
RETURNS TABLE(hearts integer, hearts_refill_at timestamptz, charged integer, settled_now boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  cur_hearts integer;
  cur_refill timestamptz;
  old_hearts integer;
  old_refill timestamptz;
  reported integer;
  owed integer;
  take integer := 0;
  changed boolean := false;
  last_settled timestamptz;
BEGIN
  IF _user_id IS NULL OR _token_hash IS NULL OR _token_hash !~ '^[0-9a-f]{64}$'
     OR _misses IS NULL OR _misses < 0 OR _misses > 50 OR _since IS NULL
     OR _enforce IS NULL OR _pro IS NULL THEN
    RAISE EXCEPTION 'invalid hearts settlement';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('lesson_hearts:' || _user_id::text, 0));

  SELECT up.hearts, up.hearts_refill_at INTO cur_hearts, cur_refill
    FROM public.user_progress up WHERE up.user_id = _user_id FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.user_progress (user_id) VALUES (_user_id) ON CONFLICT (user_id) DO NOTHING;
    cur_hearts := 5;
    cur_refill := NULL;
  END IF;

  -- Already settled: a retry, a queued duplicate, or the same token used again.
  IF EXISTS (SELECT 1 FROM public.lesson_heart_settlements s WHERE s.token_hash = _token_hash) THEN
    RETURN QUERY SELECT cur_hearts, cur_refill, 0, false;
    RETURN;
  END IF;

  -- The misses this learner's client already paid for during this session. Reports from this session come first.
  -- A token can be issued after the lesson's own lose_heart calls (minted at finish when the start request failed,
  -- or re-minted at sync when a queued lesson's token expired), so unclaimed reports from up to 3 hours (the token
  -- lifetime) before the session start also count, but never ones older than this learner's previous settlement.
  -- Every report is a heart already deducted, so counting one here can only charge less, never more.
  SELECT max(s.settled_at) INTO last_settled
    FROM public.lesson_heart_settlements s WHERE s.user_id = _user_id;
  UPDATE public.heart_loss_reports r SET claimed = true
  WHERE r.id IN (
    SELECT x.id FROM public.heart_loss_reports x
    WHERE x.user_id = _user_id AND NOT x.claimed
      AND (x.at >= _since
           OR (x.at >= _since - interval '3 hours' AND (last_settled IS NULL OR x.at > last_settled)))
    ORDER BY (x.at >= _since) DESC, x.at
    LIMIT _misses
  );
  GET DIAGNOSTICS reported = ROW_COUNT;
  owed := CASE WHEN _pro THEN 0 ELSE _misses - reported END;

  old_hearts := cur_hearts;
  old_refill := cur_refill;
  SELECT r.out_hearts, r.out_refill INTO cur_hearts, cur_refill
    FROM public.hearts_refill_resolve(cur_hearts, cur_refill, now()) r;
  IF cur_hearts IS DISTINCT FROM old_hearts OR cur_refill IS DISTINCT FROM old_refill THEN
    changed := true;
  END IF;

  IF _pro THEN
    -- Unlimited: whatever an older app deducted during the lesson comes back.
    IF cur_hearts < 5 OR cur_refill IS NOT NULL THEN
      cur_hearts := 5;
      cur_refill := NULL;
      changed := true;
    END IF;
  ELSIF _enforce AND owed > 0 THEN
    take := LEAST(owed, cur_hearts);
    cur_hearts := cur_hearts - take;
    -- A running clock is kept (the wait carries over); a learner who just dropped below 5 starts a new one.
    cur_refill := CASE WHEN cur_hearts < 5 THEN COALESCE(cur_refill, now() + interval '30 minutes') ELSE NULL END;
    changed := true;
  END IF;

  IF changed THEN
    UPDATE public.user_progress SET hearts = cur_hearts, hearts_refill_at = cur_refill WHERE user_id = _user_id;
  END IF;

  INSERT INTO public.lesson_heart_settlements
    (token_hash, user_id, misses, client_reported, would_charge, charged, credits_left, enforced, pro)
  VALUES
    (_token_hash, _user_id, _misses, reported, owed, take,
     CASE WHEN _enforce AND NOT _pro THEN owed ELSE 0 END, _enforce, _pro);

  DELETE FROM public.heart_loss_reports r WHERE r.user_id = _user_id AND r.at < now() - interval '2 days';
  DELETE FROM public.lesson_heart_settlements s WHERE s.user_id = _user_id AND s.settled_at < now() - interval '2 days';

  RETURN QUERY SELECT cur_hearts, cur_refill, take, true;
END;
$$;
REVOKE ALL ON FUNCTION public.settle_lesson_hearts(uuid, text, integer, timestamptz, boolean, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_lesson_hearts(uuid, text, integer, timestamptz, boolean, boolean)
  TO service_role;

-- Restore the learners who were stuck: below 5 hearts with no timer, so no heart could ever come back. They go to 5.
UPDATE public.user_progress SET hearts = 5 WHERE hearts < 5 AND hearts_refill_at IS NULL;

-- Rollback: re-run the bodies from 20260918141500_hearts_economy_rpcs.sql (restore_hearts_if_due),
-- 20261105101000_hearts_settled_on_server.sql (lose_heart, settle_lesson_hearts), 20260930130000_fix_xp_purchase_cost_injection.sql
-- (buy_heart_with_xp) and 20260918141500 (claim_review_clear_bonus), then DROP FUNCTION public.hearts_refill_resolve(integer, timestamptz, timestamptz);
