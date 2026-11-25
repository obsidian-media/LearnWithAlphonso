-- A Hector turn token speaks its reply at most twice per part.
--
-- /api/hector-respond (web) answers with the text and a stateless HMAC "turn token"; /api/tts?turn=<token>&part=<n>
-- then speaks that reply WITHOUT spending a second quota unit (the turn already spent Hector's allowance). Being
-- stateless, the token alone let a Pro learner replay the same part as often as they liked inside its two-minute
-- window, each call up to 2000 characters of paid speech, for free. This counts the uses in the database, shared by
-- every serverless instance: two uses per (token, part) are allowed (one retry, or a Tap-to-hear refetch; replaying
-- the sound reuses the clip already downloaded), the third is refused and the client falls back to the device voice.
--
--   hector_turn_token_uses   one row per (sha256 of the token, part): how many times it was spent, and when the token
--                            stops mattering. No client privileges at all.
--   consume_hector_turn_use  the atomic count-and-check, service role only. True when the use is allowed (and
--                            counted); false when the allowance is used up (a refused call is not counted).
--
-- Why not consume_staff_rate_limit (20261125120000)? It is keyed by a staff actor and counts in fixed windows: a token
-- that straddles a window edge would get two allowances, and its rows are never swept, one per Hector turn.
--
-- Expired rows are deleted by run_maintenance_sweep, redefined below with one more DELETE and otherwise unchanged
-- from 20261127170000.
--
-- Depends on 20261127170000 (run_maintenance_sweep, latest body).
--
-- Rollback: re-run run_maintenance_sweep from 20261127170000;
--   DROP FUNCTION public.consume_hector_turn_use(text, integer, integer, timestamptz);
--   DROP TABLE public.hector_turn_token_uses;

-- client-grants: none public.hector_turn_token_uses
CREATE TABLE public.hector_turn_token_uses (
  sig_hash text NOT NULL CHECK (sig_hash ~ '^[0-9a-f]{64}$'),
  part integer NOT NULL CHECK (part >= 0 AND part <= 8),
  uses integer NOT NULL DEFAULT 0 CHECK (uses >= 0),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (sig_hash, part)
);
CREATE INDEX hector_turn_token_uses_expires_idx ON public.hector_turn_token_uses (expires_at);
ALTER TABLE public.hector_turn_token_uses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hector_turn_token_uses FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.hector_turn_token_uses TO service_role;

CREATE FUNCTION public.consume_hector_turn_use(
  p_sig_hash text, p_part integer, p_max integer, p_expires_at timestamptz
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  new_uses integer;
BEGIN
  IF p_sig_hash IS NULL OR p_sig_hash !~ '^[0-9a-f]{64}$' OR p_part IS NULL OR p_part < 0 OR p_part > 8
     OR p_max IS NULL OR p_max < 1 OR p_expires_at IS NULL THEN
    RAISE EXCEPTION 'consume_hector_turn_use: invalid arguments' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.hector_turn_token_uses (sig_hash, part, uses, expires_at)
  VALUES (p_sig_hash, p_part, 1, p_expires_at)
  ON CONFLICT (sig_hash, part) DO UPDATE
    SET uses = public.hector_turn_token_uses.uses + 1
    WHERE public.hector_turn_token_uses.uses < p_max
  RETURNING uses INTO new_uses;

  -- The conditional update matched nothing: this token's allowance for this part is used up.
  RETURN new_uses IS NOT NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.consume_hector_turn_use(text, integer, integer, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_hector_turn_use(text, integer, integer, timestamptz) TO service_role;

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
