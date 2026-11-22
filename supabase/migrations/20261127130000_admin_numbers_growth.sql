-- Admin console Numbers screen: what the screen needs beyond admin_numbers_own (counts only, never a learner).
--
-- 1. admin_numbers_own is REPLACED (same signature, same keys). The only change: a window of 1 day now means "today, UTC"
--    (since midnight UTC) instead of "the last 24 hours", so the Today button of the screen is a calendar day like the
--    Home metrics. Every other window (7, 30, 90) is exactly as before.
--
-- 2. admin_numbers_growth(p_days) is new and returns, for the same window:
--      newPrev, activePrev, lessonsPrev, storiesPrev   the SAME measure over the equal-length window right before this
--                                                      one (for the "vs previous" change). NULL for a 1-day window: a
--                                                      part-finished day is not comparable with a whole one.
--      storiesRead        story_progress rows completed in the window
--      perfectPct         share of finished lessons (total > 0) answered with correct = total; NULL with no lessons
--      byCourse           [{language, learners}] distinct learners who finished a lesson in the window, per course
--      dauSeries          [{day, active}] distinct learners per UTC day for the last 7 days (window up to 7) or 30 days
--                         (longer windows), starting no earlier than the first day that has any activity row, so a
--                         day before the data began is left out, never written as 0
--      reactivated        learners active today whose previous activity was more than 14 days ago (no activity row in
--                         the 14 days before today, at least one earlier); independent of the window
--    Windows are UTC. Timestamp tests compare the raw column (sargable); day tests compare the date column.
--
-- Only service_role may call either (the admin server function, after requireStaff). SECURITY DEFINER, search_path = ''.
-- Depends on 20261118100000 (admin_numbers_own), 20261107120000 (learning_days), 20261121100000 (story_progress), the
-- lesson_completions table and 20261127100000 (lesson_completions / profiles timestamp indexes).
--
-- Rollback: DROP FUNCTION public.admin_numbers_growth(integer); re-run 20261118100000's admin_numbers_own;
--   DROP INDEX public.learning_days_day_idx, public.story_progress_completed_at_idx;

-- The day tests (DAU, the series, "active today") filter learning_days by day alone, and the story count by completion.
CREATE INDEX IF NOT EXISTS learning_days_day_idx ON public.learning_days (day);
CREATE INDEX IF NOT EXISTS story_progress_completed_at_idx ON public.story_progress (completed_at)
  WHERE completed_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.admin_numbers_own(p_days integer)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  d integer := LEAST(GREATEST(COALESCE(p_days, 7), 1), 366);
  today date := (now() AT TIME ZONE 'UTC')::date;
  -- One day = today since midnight UTC; longer windows stay a rolling count of days back from now.
  since_ts timestamptz := CASE WHEN d = 1 THEN today::timestamp AT TIME ZONE 'UTC'
                               ELSE now() - make_interval(days => d) END;
  since_day date := today - (d - 1);
  ret jsonb := '{}'::jsonb;
  n integer;
  cohort integer;
  kept integer;
  ai jsonb;
BEGIN
  FOREACH n IN ARRAY ARRAY[1, 7, 30] LOOP
    SELECT count(*) INTO cohort FROM public.profiles p
      WHERE (p.created_at AT TIME ZONE 'UTC')::date = today - n - 1;
    SELECT count(*) INTO kept FROM public.profiles p
      WHERE (p.created_at AT TIME ZONE 'UTC')::date = today - n - 1
        AND EXISTS (SELECT 1 FROM public.learning_days l WHERE l.user_id = p.id AND l.day = today - 1);
    ret := ret || jsonb_build_object('d' || n, CASE WHEN cohort = 0 THEN NULL
      ELSE round(100.0 * kept / cohort, 1) END);
  END LOOP;

  SELECT COALESCE(jsonb_object_agg(kind, total), '{}'::jsonb) INTO ai FROM (
    SELECT u.kind, sum(u.count)::bigint AS total FROM public.ai_usage u
      WHERE u.day >= since_day GROUP BY u.kind) k;

  RETURN jsonb_build_object(
    'newToday', (SELECT count(*) FROM public.profiles p WHERE (p.created_at AT TIME ZONE 'UTC')::date = today),
    'newWindow', (SELECT count(*) FROM public.profiles p WHERE p.created_at >= since_ts),
    'activeToday', (SELECT count(DISTINCT user_id) FROM public.learning_days WHERE day = today),
    'activeWindow', (SELECT count(DISTINCT user_id) FROM public.learning_days WHERE day >= since_day),
    'lessons', (SELECT count(*) FROM public.lesson_completions WHERE completed_at >= since_ts),
    'practiceCalls', (SELECT count(*) FROM public.practice_calls WHERE started_at >= since_ts),
    'podcastsFinished', (SELECT count(*) FROM public.podcast_playback WHERE completed_at >= since_ts),
    'avgStreak', (SELECT round(avg(streak)::numeric, 1) FROM public.user_progress
                    WHERE streak > 0 AND last_active_date >= today - 1),
    'retention', ret,
    -- Every report is open: content_reports has no status column and every handling path (dismiss, reset name, rename
    -- or disband team) deletes the row via resolveReport/staff_dismiss_report, so a handled report cannot remain.
    'openReports', (SELECT count(*) FROM public.content_reports),
    'openTickets', (SELECT count(*) FROM public.support_conversations WHERE status <> 'solved'),
    'aiByKind', ai
  );
END
$$;
REVOKE ALL ON FUNCTION public.admin_numbers_own(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_numbers_own(integer) TO service_role;

CREATE FUNCTION public.admin_numbers_growth(p_days integer)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  d integer := LEAST(GREATEST(COALESCE(p_days, 7), 1), 366);
  today date := (now() AT TIME ZONE 'UTC')::date;
  since_ts timestamptz := CASE WHEN d = 1 THEN today::timestamp AT TIME ZONE 'UTC'
                               ELSE now() - make_interval(days => d) END;
  prev_ts timestamptz := since_ts - make_interval(days => d);
  since_day date := today - (d - 1);
  prev_day date := since_day - d;
  comparable boolean := d > 1;
  series_days integer := CASE WHEN d <= 7 THEN 7 ELSE 30 END;
  first_day date;
  series_from date;
  series jsonb;
  courses jsonb;
BEGIN
  SELECT min(l.day) INTO first_day FROM public.learning_days l;
  series_from := GREATEST(today - (series_days - 1), first_day);
  IF first_day IS NULL THEN
    series := '[]'::jsonb;
  ELSE
    SELECT COALESCE(jsonb_agg(jsonb_build_object('day', g.day, 'active', COALESCE(c.n, 0)) ORDER BY g.day), '[]'::jsonb)
      INTO series
      FROM (SELECT gs.ts::date AS day FROM generate_series(series_from, today, interval '1 day') AS gs(ts)) g
      LEFT JOIN (SELECT l.day, count(DISTINCT l.user_id) AS n FROM public.learning_days l
                  WHERE l.day >= series_from AND l.day <= today GROUP BY l.day) c ON c.day = g.day;
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('language', k.language, 'learners', k.n) ORDER BY k.n DESC, k.language), '[]'::jsonb)
    INTO courses
    FROM (SELECT lc.language, count(DISTINCT lc.user_id) AS n FROM public.lesson_completions lc
           WHERE lc.completed_at >= since_ts GROUP BY lc.language) k;

  RETURN jsonb_build_object(
    'newPrev', CASE WHEN comparable THEN
      (SELECT count(*) FROM public.profiles p WHERE p.created_at >= prev_ts AND p.created_at < since_ts) END,
    'activePrev', CASE WHEN comparable THEN
      (SELECT count(DISTINCT l.user_id) FROM public.learning_days l WHERE l.day >= prev_day AND l.day < since_day) END,
    'lessonsPrev', CASE WHEN comparable THEN
      (SELECT count(*) FROM public.lesson_completions lc WHERE lc.completed_at >= prev_ts AND lc.completed_at < since_ts) END,
    'storiesPrev', CASE WHEN comparable THEN
      (SELECT count(*) FROM public.story_progress s WHERE s.completed_at >= prev_ts AND s.completed_at < since_ts) END,
    'storiesRead', (SELECT count(*) FROM public.story_progress s WHERE s.completed_at >= since_ts),
    'perfectPct', (SELECT CASE WHEN count(*) = 0 THEN NULL
                     ELSE round(100.0 * count(*) FILTER (WHERE lc.correct = lc.total) / count(*), 1) END
                   FROM public.lesson_completions lc WHERE lc.completed_at >= since_ts AND lc.total > 0),
    'byCourse', courses,
    'dauSeries', series,
    'reactivated', (SELECT count(*) FROM public.learning_days t
                     WHERE t.day = today
                       AND NOT EXISTS (SELECT 1 FROM public.learning_days r
                                        WHERE r.user_id = t.user_id AND r.day >= today - 14 AND r.day < today)
                       AND EXISTS (SELECT 1 FROM public.learning_days e
                                    WHERE e.user_id = t.user_id AND e.day < today - 14))
  );
END
$$;
REVOKE ALL ON FUNCTION public.admin_numbers_growth(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_numbers_growth(integer) TO service_role;
