-- Admin console numbers dashboard (phase 3): the "Our database" aggregates, in one call.
--
-- admin_numbers_own(p_days) returns ONLY counts, sums and averages (no user id, name or email appears in the result).
-- Days are UTC dates. p_days is the window the staff member picked (7, 30 or 90; the server function refuses
-- anything else, and this function clamps to 1..366 as a second line).
--
--   new learners        profiles created today / within the window
--   active learners     distinct learning_days users today (DAU) / within the window
--   lessons, practice   lesson_completions, practice_calls started, within the window
--   podcasts finished   podcast_playback.completed_at within the window
--   average streak      user_progress.streak over learners still active today or yesterday
--   retention d1/d7/d30 of the learners who joined N+1 days ago, the share with a learning_days row on YESTERDAY (their
--                       day N; today is not over, so it is never counted); NULL when nobody joined that day
--                       (no cohort is not 0%)
--   open reports        content_reports rows (a dismissed report is deleted, so every row is open)
--   open tickets        support_conversations not solved
--   ai_by_kind          ai_usage counts per kind within the window
--
-- Only service_role may call it (the admin server function, after requireStaff("numbers.read")).
-- Depends on 20261107120000 (learning_days), 20261107032021 (practice_calls), 20260926030000 (podcast_playback),
-- 20261117100000 (support_conversations), 20260928020000 (content_reports), 20260829205211 (ai_usage).
--
-- Rollback: DROP FUNCTION public.admin_numbers_own(integer);

CREATE FUNCTION public.admin_numbers_own(p_days integer)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  d integer := LEAST(GREATEST(COALESCE(p_days, 7), 1), 366);
  today date := (now() AT TIME ZONE 'UTC')::date;
  since_ts timestamptz := now() - make_interval(days => d);
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
    'newToday', (SELECT count(*) FROM public.profiles WHERE (created_at AT TIME ZONE 'UTC')::date = today),
    'newWindow', (SELECT count(*) FROM public.profiles WHERE created_at >= since_ts),
    'activeToday', (SELECT count(DISTINCT user_id) FROM public.learning_days WHERE day = today),
    'activeWindow', (SELECT count(DISTINCT user_id) FROM public.learning_days WHERE day >= since_day),
    'lessons', (SELECT count(*) FROM public.lesson_completions WHERE completed_at >= since_ts),
    'practiceCalls', (SELECT count(*) FROM public.practice_calls WHERE started_at >= since_ts),
    'podcastsFinished', (SELECT count(*) FROM public.podcast_playback WHERE completed_at >= since_ts),
    'avgStreak', (SELECT round(avg(streak)::numeric, 1) FROM public.user_progress
                    WHERE streak > 0 AND last_active_date >= today - 1),
    'retention', ret,
    'openReports', (SELECT count(*) FROM public.content_reports),
    'openTickets', (SELECT count(*) FROM public.support_conversations WHERE status <> 'solved'),
    'aiByKind', ai
  );
END
$$;

REVOKE ALL ON FUNCTION public.admin_numbers_own(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_numbers_own(integer) TO service_role;
