-- Settle seasons and weekly challenges on the server, in one transaction, without anyone opening a screen.
--
-- 1. SEASONS. get-season-status resolved a finished week's cohort lazily, only when a member opened the League tab the
--    next week, and it set resolved_at BEFORE it read the XP and inserted the placements, ignoring the result of the
--    insert. So an unopened cohort stayed unresolved forever (prod: 5 of 6, and 3 closed cohorts had members with no
--    placement), and a failed insert still left resolved_at set.
--      resolve_season_cohort(cohort)     ranks the cohort by its week's XP, writes every member's placement and sets
--                                        resolved_at, all in one transaction (a failure rolls all of it back). Safe to
--                                        run twice and from two callers at once (the cohort row is locked); a cohort
--                                        that is resolved but has members with no placement (the old failure) is
--                                        completed, never re-ranked over an existing placement.
--      resolve_closed_season_cohorts()   every cohort of a finished week that still needs that, for the 15-minute sweep.
--    The ranking is the same as supabase/functions/get-season-status/season-math.ts (xp desc, then user id): top third
--    up one division, bottom sixth down one, within divisions 1 to 5. A test holds the two together.
--
-- 2. WEEKLY CHALLENGES. They were paid only when a client read get_weekly_challenges during the SAME week, so work done
--    before the rollover was never paid if the app was not opened again that week, and the receipt was written before
--    the XP update, which could hit 0 rows (no language_progress row) and still leave the learner marked paid.
--      _pay_weekly_challenge(...)        locks the destination row first, then writes the receipt and the +100 together;
--                                        no destination row means no receipt (so it is paid when one exists).
--      get_weekly_challenges()           same result as before, paying through that function.
--      settle_closed_weekly_challenges() pays the eligible challenges of the LAST finished week, at most 500 learners per
--                                        template per run (set-based; the sweep's request must stay under 30 s). The two
--                                        weeks before it are backfilled once, in this migration. Progress is counted inside
--                                        that week only. Idempotent (the receipt key).
--
-- All new functions are server-only (service_role); no table is added, so nothing new for the export or deletion.
--
-- Depends on 20260922050000 (season tables, get_cohort_weekly_xp), 20260922030500 and 20261006170000
-- (get_weekly_challenges), 20261105100800 (weekly_xp).
--
-- Rollback: DROP FUNCTION public.resolve_closed_season_cohorts(); DROP FUNCTION public.resolve_season_cohort(uuid);
--   DROP FUNCTION public.settle_closed_weekly_challenges(); DROP FUNCTION public._settle_challenge_week(date, integer); re-apply get_weekly_challenges from
--   20261006170000_fix_team_joins_and_course_aware_payouts.sql; DROP FUNCTION public._pay_weekly_challenge(uuid, date, text, text).

-- ---- seasons ----
CREATE FUNCTION public.resolve_season_cohort(_cohort_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c public.season_cohorts%ROWTYPE;
  n integer;
  missing integer;
BEGIN
  SELECT * INTO c FROM public.season_cohorts WHERE id = _cohort_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;

  SELECT count(*) INTO n FROM public.season_cohort_members WHERE cohort_id = _cohort_id;
  SELECT count(*) INTO missing FROM public.season_cohort_members m
    WHERE m.cohort_id = _cohort_id
      AND NOT EXISTS (SELECT 1 FROM public.season_placements p WHERE p.user_id = m.user_id AND p.week_start = c.week_start);

  IF c.resolved_at IS NOT NULL AND missing = 0 THEN RETURN false; END IF;

  IF n > 0 THEN
    INSERT INTO public.season_placements (user_id, week_start, division, rank_in_cohort, cohort_size)
    SELECT r.user_id, c.week_start,
           CASE WHEN r.rnk <= n / 3 THEN LEAST(c.division + 1, 5)
                WHEN r.rnk > n - n / 6 THEN GREATEST(c.division - 1, 1)
                ELSE c.division END,
           r.rnk, n
      FROM (
        SELECT x.user_id,
               row_number() OVER (ORDER BY x.xp DESC, x.user_id::text COLLATE "C")::integer AS rnk
          FROM public.get_cohort_weekly_xp(_cohort_id, c.week_start) x
      ) r
    ON CONFLICT (user_id, week_start) DO NOTHING;
  END IF;

  UPDATE public.season_cohorts SET resolved_at = COALESCE(resolved_at, now()) WHERE id = _cohort_id;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.resolve_season_cohort(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_season_cohort(uuid) TO service_role;

CREATE FUNCTION public.resolve_closed_season_cohorts()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET timezone = 'UTC'
AS $$
DECLARE
  wk date := (current_date - ((extract(isodow from current_date)::int) - 1));
  cohort record;
  done integer := 0;
BEGIN
  FOR cohort IN
    SELECT sc.id FROM public.season_cohorts sc
     WHERE sc.week_start < wk
       AND (sc.resolved_at IS NULL
            OR EXISTS (SELECT 1 FROM public.season_cohort_members m
                        WHERE m.cohort_id = sc.id
                          AND NOT EXISTS (SELECT 1 FROM public.season_placements p
                                           WHERE p.user_id = m.user_id AND p.week_start = sc.week_start)))
     ORDER BY sc.week_start
  LOOP
    BEGIN
      IF public.resolve_season_cohort(cohort.id) THEN done := done + 1; END IF;
    EXCEPTION WHEN OTHERS THEN
      -- One cohort failing (rolled back on its own) must not stop the others; the next run tries it again.
      RAISE WARNING 'resolve_closed_season_cohorts: cohort % failed: %', cohort.id, SQLERRM;
    END;
  END LOOP;
  RETURN done;
END;
$$;
REVOKE ALL ON FUNCTION public.resolve_closed_season_cohorts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_closed_season_cohorts() TO service_role;

-- ---- weekly challenges ----
CREATE FUNCTION public._pay_weekly_challenge(_user_id uuid, _week_start date, _template_id text, _language text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  dest integer;
BEGIN
  IF _user_id IS NULL OR _week_start IS NULL OR _template_id IS NULL OR _language IS NULL THEN RETURN false; END IF;
  IF EXISTS (SELECT 1 FROM public.challenge_completions cc
              WHERE cc.user_id = _user_id AND cc.week_start = _week_start AND cc.template_id = _template_id) THEN
    RETURN false;
  END IF;
  -- The destination row first, locked: with no row there is nothing to pay and no receipt is written.
  SELECT lp.xp INTO dest FROM public.language_progress lp
    WHERE lp.user_id = _user_id AND lp.language = _language FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  INSERT INTO public.challenge_completions (user_id, week_start, template_id)
    VALUES (_user_id, _week_start, _template_id)
    ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN RETURN false; END IF;
  UPDATE public.language_progress lp SET xp = lp.xp + 100
    WHERE lp.user_id = _user_id AND lp.language = _language;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public._pay_weekly_challenge(uuid, date, text, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_weekly_challenges()
RETURNS TABLE(template_id text, title text, description text, type text, threshold integer, progress integer, completed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET timezone = 'UTC'
AS $$
DECLARE
  me uuid := auth.uid();
  wk date := (current_date - ((extract(isodow from current_date)::int) - 1));
  tpl RECORD;
  computed_progress integer;
  is_complete boolean;
BEGIN
  IF me IS NULL THEN
    RETURN;
  END IF;

  FOR tpl IN
    SELECT ct.id, ct.title, ct.description, ct.type, ct.threshold
    FROM public.challenge_templates ct
    ORDER BY hashtext(ct.id || wk::text)
    LIMIT 3
  LOOP
    IF tpl.type = 'lesson_count' THEN
      SELECT count(*) INTO computed_progress FROM public.lesson_completions lc
        WHERE lc.user_id = me AND lc.completed_at >= wk;
    ELSIF tpl.type = 'perfect_score_count' THEN
      SELECT count(*) INTO computed_progress FROM public.lesson_completions lc
        WHERE lc.user_id = me AND lc.completed_at >= wk AND lc.correct = lc.total;
    ELSE -- study_every_day
      SELECT count(DISTINCT ad.day) INTO computed_progress FROM public.activity_days ad
        WHERE ad.user_id = me AND ad.day >= wk;
    END IF;

    is_complete := EXISTS (
      SELECT 1 FROM public.challenge_completions cc
      WHERE cc.user_id = me AND cc.week_start = wk AND cc.template_id = tpl.id
    );

    IF NOT is_complete AND computed_progress >= tpl.threshold THEN
      IF public._pay_weekly_challenge(me, wk, tpl.id, (
        SELECT lc.language FROM public.lesson_completions lc
        WHERE lc.user_id = me ORDER BY lc.completed_at DESC LIMIT 1
      )) THEN
        is_complete := true;
      END IF;
    END IF;

    RETURN QUERY SELECT tpl.id, tpl.title, tpl.description, tpl.type, tpl.threshold, computed_progress, is_complete;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.get_weekly_challenges() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_weekly_challenges() TO authenticated;

-- One finished week. Set-based per template: only learners who reached the threshold and have no receipt yet, at most
-- _cap of them per template per call, so a run stays far inside the 30 s the sweep's request allows however many
-- learners there are (the rest are picked up by the next 15-minute run). Idempotent (the receipt key).
CREATE FUNCTION public._settle_challenge_week(_week date, _cap integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET timezone = 'UTC'
AS $$
DECLARE
  tpl record;
  u record;
  lang text;
  paid integer := 0;
BEGIN
  FOR tpl IN
    SELECT ct.id, ct.type, ct.threshold FROM public.challenge_templates ct
     ORDER BY hashtext(ct.id || _week::text) LIMIT 3
  LOOP
    FOR u IN
      SELECT c.user_id FROM (
        SELECT lc.user_id FROM public.lesson_completions lc WHERE lc.completed_at >= _week AND lc.completed_at < _week + 7
        UNION
        SELECT ad.user_id FROM public.activity_days ad WHERE ad.day >= _week AND ad.day < _week + 7
      ) c
      WHERE NOT EXISTS (SELECT 1 FROM public.challenge_completions cc
                         WHERE cc.user_id = c.user_id AND cc.week_start = _week AND cc.template_id = tpl.id)
        AND (CASE tpl.type
               WHEN 'lesson_count' THEN
                 (SELECT count(*) FROM public.lesson_completions lc
                   WHERE lc.user_id = c.user_id AND lc.completed_at >= _week AND lc.completed_at < _week + 7)
               WHEN 'perfect_score_count' THEN
                 (SELECT count(*) FROM public.lesson_completions lc
                   WHERE lc.user_id = c.user_id AND lc.completed_at >= _week AND lc.completed_at < _week + 7
                     AND lc.correct = lc.total)
               ELSE
                 (SELECT count(DISTINCT ad.day) FROM public.activity_days ad
                   WHERE ad.user_id = c.user_id AND ad.day >= _week AND ad.day < _week + 7)
             END) >= tpl.threshold
      LIMIT _cap
    LOOP
      BEGIN
        -- Paid to the course the learner studied that week (else their latest).
        SELECT lc.language INTO lang FROM public.lesson_completions lc
          WHERE lc.user_id = u.user_id AND lc.completed_at >= _week AND lc.completed_at < _week + 7
          ORDER BY lc.completed_at DESC LIMIT 1;
        IF lang IS NULL THEN
          SELECT lc.language INTO lang FROM public.lesson_completions lc
            WHERE lc.user_id = u.user_id ORDER BY lc.completed_at DESC LIMIT 1;
        END IF;
        IF public._pay_weekly_challenge(u.user_id, _week, tpl.id, lang) THEN paid := paid + 1; END IF;
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING '_settle_challenge_week: % % failed: %', u.user_id, tpl.id, SQLERRM;
      END;
    END LOOP;
  END LOOP;
  RETURN paid;
END;
$$;
REVOKE ALL ON FUNCTION public._settle_challenge_week(date, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._settle_challenge_week(date, integer) TO service_role;

-- The sweep's call: the LAST finished week only, at most 500 learners per template per run.
CREATE FUNCTION public.settle_closed_weekly_challenges()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
SET timezone = 'UTC'
AS $$
  SELECT public._settle_challenge_week((current_date - ((extract(isodow from current_date)::int) - 1)) - 7, 500);
$$;
REVOKE ALL ON FUNCTION public.settle_closed_weekly_challenges() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_closed_weekly_challenges() TO service_role;

-- One-time backfill, run once here: the two weeks before the last finished one (the sweep covers that one).
SELECT public._settle_challenge_week((current_date - ((extract(isodow from current_date)::int) - 1)) - 14, 5000);
SELECT public._settle_challenge_week((current_date - ((extract(isodow from current_date)::int) - 1)) - 21, 5000);
