-- Prune pg_cron's run log: keep 14 days of cron.job_run_details (about 4,250 rows on 2026-11-25, growing without bound).
--
-- Added to run_maintenance_sweep rather than a second cron job: the sweep is SECURITY DEFINER and owned by postgres, and
-- postgres has DELETE on cron.job_run_details and BYPASSRLS (the table is owned by supabase_admin and has one row
-- policy, username = CURRENT_USER, which bypass skips). Checked read-only on production. service_role also reads it,
-- but the sweep is the only writer. The DELETE sits in its own exception block, so a replay without pg_cron only warns.
-- The health screen reads this table for the sweep's last run (20261127170000), which 14 days of history serves.
-- No new table, so nothing for the client-grants guard (#227) to see.
--
-- run_maintenance_sweep is redefined with the body of 20261128100000 copied exactly plus that one block.
-- Depends on 20261128100000 (latest sweep body).
--
-- Rollback: re-run run_maintenance_sweep from 20261128100000.

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
  -- Hector turn token use counts: a token's window is two minutes; a row is only needed until it expires (20261128100000).
  DELETE FROM public.hector_turn_token_uses WHERE expires_at < now();

  -- pg_cron's own run log (cron.job_run_details) grows by about 100 rows a day and is never pruned: keep 14 days. The
  -- function's owner (postgres) holds DELETE on it and bypasses its row policy (checked on production 2026-11-25).
  -- Its own block: a database without pg_cron (a replay of the migration history) or a privilege change must not stop
  -- the pruning above or the call to the web app below.
  BEGIN
    DELETE FROM cron.job_run_details WHERE end_time < now() - interval '14 days';
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'run_maintenance_sweep could not prune cron.job_run_details: % %', SQLSTATE, SQLERRM;
  END;

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
