-- Admin console rebuild, PR 8 (Health): the real history and the real job status the new Health screen reads.
--
--   ops_health_checks        NEW table. One row per service per check, written by run_maintenance_sweep every 15 minutes:
--                              service    'database' or 'auth' (the only two the database can really probe itself)
--                              ok         the probe finished without an error
--                              latency_ms how long it took, NULL when it failed
--                              at         when it was checked
--                            No client role holds anything on it (service role only). Rows older than 120 days are
--                            deleted by the sweep. The Health screen draws its 90 day bars from it; a day with no
--                            rows is "no data" there, never "up".
--   run_maintenance_sweep    REPLACED (same signature): the body from 20261125140000 unchanged, plus the two probes at
--                            the top (each in its own block, so a failed probe is recorded as ok = false and cannot
--                            stop the pruning) and one more DELETE (ops_health_checks, 120 days).
--   staff_sweep_status       NEW. What cron.job_run_details says about the 'maintenance-sweep' job: whether it is
--                            scheduled, when it last finished and how, when it last succeeded, and runs / failures in
--                            the last 24 hours. Nothing is invented: no run on record means NULLs and zero runs.
--   staff_health_summary     NEW. Per service: first check, last check, last result, last latency.
--   staff_health_history     NEW. Per service per UTC day: checks and passing checks, for the last p_days (1 to 120).
--
-- All SECURITY DEFINER, search_path = '', EXECUTE for service_role only.
-- Depends on 20261125140000 (the newest run_maintenance_sweep) and 20261015100000 (the pg_cron job).
--
-- Rollback: re-run run_maintenance_sweep from 20261125140000; DROP FUNCTION public.staff_health_history(integer),
--   public.staff_health_summary(), public.staff_sweep_status(); DROP TABLE public.ops_health_checks.

-- client-grants: none public.ops_health_checks
CREATE TABLE public.ops_health_checks (
  service text NOT NULL CHECK (service IN ('database', 'auth')),
  ok boolean NOT NULL,
  latency_ms integer CHECK (latency_ms IS NULL OR latency_ms >= 0),
  at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (service, at)
);
ALTER TABLE public.ops_health_checks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ops_health_checks FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.ops_health_checks TO service_role;

CREATE OR REPLACE FUNCTION public.run_maintenance_sweep() RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  secret text;
  started timestamptz;
  took integer;
BEGIN
  -- Health probes (20261127170000): a real read of an application table and of the auth schema, timed. A failure is
  -- recorded as ok = false; it never stops the pruning below.
  BEGIN
    started := clock_timestamp();
    PERFORM 1 FROM public.app_switches LIMIT 1;
    took := floor(extract(epoch FROM clock_timestamp() - started) * 1000)::integer;
    INSERT INTO public.ops_health_checks (service, ok, latency_ms) VALUES ('database', true, took)
      ON CONFLICT DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.ops_health_checks (service, ok, latency_ms) VALUES ('database', false, NULL)
      ON CONFLICT DO NOTHING;
  END;
  BEGIN
    started := clock_timestamp();
    PERFORM 1 FROM auth.users LIMIT 1;
    took := floor(extract(epoch FROM clock_timestamp() - started) * 1000)::integer;
    INSERT INTO public.ops_health_checks (service, ok, latency_ms) VALUES ('auth', true, took)
      ON CONFLICT DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.ops_health_checks (service, ok, latency_ms) VALUES ('auth', false, NULL)
      ON CONFLICT DO NOTHING;
  END;

  -- A receipt only matters while the app may still retry that grade; the app's queue is long gone after 30 days.
  DELETE FROM public.review_grade_attempts WHERE created_at < now() - interval '30 days';
  -- Retention: see 20261105100600's header.
  DELETE FROM public.ai_usage WHERE day < current_date - 90;
  DELETE FROM public.nudges WHERE created_at < now() - interval '90 days';
  DELETE FROM public.friend_activity_events
   WHERE event_type <> 'league_promotion' AND created_at < now() - interval '180 days';
  DELETE FROM public.podcast_play_events WHERE started_at < now() - interval '400 days';
  -- Reports kept after an account was deleted: 90 days from that deletion (20261105101100).
  DELETE FROM public.content_reports WHERE account_deleted_at < now() - interval '90 days';
  -- Lesson-session redemptions: a token's window is far shorter than this (20261125110000).
  DELETE FROM public.lesson_session_redemptions WHERE created_at < now() - interval '7 days';
  -- Operational events: 90 days (20261125140000).
  DELETE FROM public.ops_events WHERE created_at < now() - interval '90 days';
  -- Health check history: 120 days, enough for the screen's 90 day bars (20261127170000).
  DELETE FROM public.ops_health_checks WHERE at < now() - interval '120 days';

  -- Support chats: solved conversations go 12 months after they were solved. Its own block, so a
  -- failure here cannot undo the pruning above or stop the call to the web app below.
  BEGIN
    PERFORM public.support_purge_old();
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'run_maintenance_sweep could not purge old support chats: % %', SQLSTATE, SQLERRM;
  END;

  -- Its own block: a failure to reach the web app must not undo the pruning above.
  BEGIN
    SELECT decrypted_secret INTO secret FROM vault.decrypted_secrets WHERE name = 'report_notify_secret';
    IF secret IS NULL THEN
      RETURN;
    END IF;
    PERFORM net.http_post(
      url := 'https://learn.alphonsoecosystem.app/api/internal/maintenance',
      headers := jsonb_build_object('Content-Type', 'application/json', 'X-Report-Notify-Secret', secret),
      body := '{}'::jsonb,
      timeout_milliseconds := 30000
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'run_maintenance_sweep could not call the web app: % %', SQLSTATE, SQLERRM;
  END;
END;
$$;
REVOKE ALL ON FUNCTION public.run_maintenance_sweep() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_maintenance_sweep() TO service_role;

-- The maintenance job as pg_cron recorded it. One row, always: scheduled = false when the job does not exist.
CREATE FUNCTION public.staff_sweep_status()
RETURNS TABLE (
  scheduled boolean,
  last_run_at timestamptz,
  last_status text,
  last_ok_at timestamptz,
  runs_24h integer,
  failed_24h integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH job AS (SELECT jobid FROM cron.job WHERE jobname = 'maintenance-sweep' LIMIT 1),
  runs AS (
    SELECT d.start_time, d.status
      FROM cron.job_run_details d
      JOIN job ON job.jobid = d.jobid
     WHERE d.status IN ('succeeded', 'failed')
  )
  SELECT
    EXISTS (SELECT 1 FROM job),
    (SELECT r.start_time FROM runs r ORDER BY r.start_time DESC LIMIT 1),
    (SELECT r.status FROM runs r ORDER BY r.start_time DESC LIMIT 1),
    (SELECT max(r.start_time) FROM runs r WHERE r.status = 'succeeded'),
    (SELECT count(*)::integer FROM runs r WHERE r.start_time >= now() - interval '24 hours'),
    (SELECT count(*)::integer FROM runs r
      WHERE r.start_time >= now() - interval '24 hours' AND r.status = 'failed');
$$;
REVOKE ALL ON FUNCTION public.staff_sweep_status() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staff_sweep_status() TO service_role;

-- Per service: the first and last check on record and the last result. No rows at all means no service is listed.
CREATE FUNCTION public.staff_health_summary()
RETURNS TABLE (service text, first_at timestamptz, last_at timestamptz, last_ok boolean, last_latency_ms integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT s.service,
         s.first_at,
         l.at,
         l.ok,
         l.latency_ms
    FROM (SELECT c.service, min(c.at) AS first_at FROM public.ops_health_checks c GROUP BY c.service) s
    JOIN LATERAL (
      SELECT c.at, c.ok, c.latency_ms FROM public.ops_health_checks c
       WHERE c.service = s.service ORDER BY c.at DESC LIMIT 1
    ) l ON true;
$$;
REVOKE ALL ON FUNCTION public.staff_health_summary() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staff_health_summary() TO service_role;

-- Per service per UTC day over the last p_days (clamped 1 to 120). A day with no rows has no row here.
CREATE FUNCTION public.staff_health_history(p_days integer DEFAULT 90)
RETURNS TABLE (service text, day date, checks integer, ok_checks integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT c.service,
         (c.at AT TIME ZONE 'UTC')::date,
         count(*)::integer,
         (count(*) FILTER (WHERE c.ok))::integer
    FROM public.ops_health_checks c
   WHERE (c.at AT TIME ZONE 'UTC')::date >=
         (now() AT TIME ZONE 'UTC')::date - (greatest(1, least(coalesce(p_days, 90), 120)) - 1)
   GROUP BY c.service, (c.at AT TIME ZONE 'UTC')::date
   ORDER BY c.service, 2;
$$;
REVOKE ALL ON FUNCTION public.staff_health_history(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staff_health_history(integer) TO service_role;
