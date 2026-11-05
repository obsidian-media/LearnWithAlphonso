-- 1. Retention. The 15-minute maintenance sweep now also removes rows nothing needs after a while:
--      ai_usage (daily quota counters)                    older than 90 days
--      nudges                                              older than 90 days
--      friend_activity_events, except league promotions    older than 180 days (promotions count toward an
--                                                          achievement, so they stay for the life of the account)
--      podcast_play_events (listening analytics)           older than 400 days
--    Kept on purpose: weakness_events (the learner's own progress history, shown in the app), content_reports (the
--    privacy policy keeps reports while the accounts involved exist) and signup_attribution (one row per account).
--
-- 2. The push trigger's credential. notify_nudge_push sent `Authorization: Bearer <service role key>` to send-push,
--    so every queued pg_net request held the service role key. It now sends a dedicated random secret in the
--    X-Send-Push-Secret header when Vault holds one named 'send_push_secret' (send-push compares it in constant time
--    against its SEND_PUSH_SECRET). Until that Vault secret exists it keeps the old header, so pushes never stop
--    during the switch. Owner steps: docs/security.md, "Push notifications".
--
-- Depends on 20261015100000 (run_maintenance_sweep), 20260930070000 (notify_nudge_push, latest body),
-- 20261008130400 (its grants) and 20261105100000.
--
-- Rollback: re-run run_maintenance_sweep from 20261015100000 and notify_nudge_push from 20260930070000.

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
  -- Retention: see this migration's header.
  DELETE FROM public.ai_usage WHERE day < current_date - 90;
  DELETE FROM public.nudges WHERE created_at < now() - interval '90 days';
  DELETE FROM public.friend_activity_events
   WHERE event_type <> 'league_promotion' AND created_at < now() - interval '180 days';
  DELETE FROM public.podcast_play_events WHERE started_at < now() - interval '400 days';

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

CREATE OR REPLACE FUNCTION public.notify_nudge_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  push_secret text;
  service_key text;
  auth_headers jsonb;
  recent_push_exists boolean;
BEGIN
  -- One push per sender and recipient per 24 hours. created_at is always the server's now(): clients may write only
  -- sender_id and recipient_id (20261105100100).
  SELECT EXISTS (
    SELECT 1 FROM public.nudges n
    WHERE n.sender_id = NEW.sender_id
      AND n.recipient_id = NEW.recipient_id
      AND n.id <> NEW.id
      AND n.created_at > now() - interval '24 hours'
  ) INTO recent_push_exists;

  IF recent_push_exists THEN
    RETURN NEW;
  END IF;

  SELECT decrypted_secret INTO push_secret
    FROM vault.decrypted_secrets WHERE name = 'send_push_secret';
  IF push_secret IS NOT NULL THEN
    auth_headers := jsonb_build_object('X-Send-Push-Secret', push_secret);
  ELSE
    SELECT decrypted_secret INTO service_key
      FROM vault.decrypted_secrets WHERE name = 'push_trigger_service_key';
    IF service_key IS NULL THEN
      RETURN NEW;
    END IF;
    auth_headers := jsonb_build_object('Authorization', 'Bearer ' || service_key);
  END IF;

  PERFORM net.http_post(
    url := 'https://qhcjpfbxfcltjbiuknyt.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object('Content-Type', 'application/json') || auth_headers,
    body := jsonb_build_object(
      'userId', NEW.recipient_id,
      'title', 'You''ve been nudged!',
      'body', 'A friend nudged you to keep your streak going.',
      'data', jsonb_build_object('type', 'nudge', 'senderId', NEW.sender_id)
    ),
    timeout_milliseconds := 5000
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.notify_nudge_push() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_nudge_push() TO service_role;
