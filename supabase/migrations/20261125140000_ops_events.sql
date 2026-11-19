-- Operational events the owner can see.
--
-- Server-side failures that used to be one console.log line nobody read (hearts_settlement_failed,
-- lesson_result_finalize_failed, hearts_settlement_shadow_*) are now also one row here, written by the web server and
-- the complete-lesson Edge function with the service role. The admin console's System health page reads the counts and
-- the maintenance sweep emails the owner when one crosses its threshold (ops_event_alerts keeps the last alert time so
-- an event alerts at most once per 24 hours).
--
-- detail holds ids, codes and counts only: never free text, never an email. Capped at 2000 characters by a CHECK.
-- Rows older than 90 days are deleted by run_maintenance_sweep (redefined at the end with ONE more DELETE; every other
-- step is the body from 20261125110000).
--
-- Depends on 20261125110000 (the newest run_maintenance_sweep).
--
-- Rollback: re-run run_maintenance_sweep from 20261125110000; DROP FUNCTION public.ops_events_summary();
--   DROP TABLE public.ops_event_alerts; DROP TABLE public.ops_events;

-- client-grants: none public.ops_events
CREATE TABLE public.ops_events (
  id bigserial PRIMARY KEY,
  event text NOT NULL CHECK (event ~ '^[a-z0-9_]{1,64}$'),
  source text NOT NULL CHECK (char_length(source) BETWEEN 1 AND 64),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (char_length(detail::text) <= 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ops_events_event_created_idx ON public.ops_events (event, created_at DESC);
CREATE INDEX ops_events_created_idx ON public.ops_events (created_at DESC);
ALTER TABLE public.ops_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ops_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.ops_events TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.ops_events_id_seq TO service_role;

-- client-grants: none public.ops_event_alerts
CREATE TABLE public.ops_event_alerts (
  event text PRIMARY KEY CHECK (event ~ '^[a-z0-9_]{1,64}$'),
  last_alert_at timestamptz NOT NULL
);
ALTER TABLE public.ops_event_alerts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ops_event_alerts FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.ops_event_alerts TO service_role;

-- Counts per event for the System health page and the alert: last hour, 24 hours, 7 days, and the last occurrence.
CREATE FUNCTION public.ops_events_summary()
RETURNS TABLE (event text, count_1h bigint, count_24h bigint, count_7d bigint, last_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT e.event,
         count(*) FILTER (WHERE e.created_at >= now() - interval '1 hour'),
         count(*) FILTER (WHERE e.created_at >= now() - interval '24 hours'),
         count(*),
         max(e.created_at)
    FROM public.ops_events e
   WHERE e.created_at >= now() - interval '7 days'
   GROUP BY e.event;
$$;
REVOKE ALL ON FUNCTION public.ops_events_summary() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ops_events_summary() TO service_role;

CREATE OR REPLACE FUNCTION public.run_maintenance_sweep() RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  secret text;
BEGIN
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

  -- Support chats: solved conversations go 12 months after they were solved (this file). Its own block, so a failure
  -- here cannot undo the pruning above or stop the call to the web app below.
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
