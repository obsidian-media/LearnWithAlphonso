-- A lesson-session token completes a lesson ONCE, and a retry of that completion is safe.
--
-- Until now nothing recorded that a token had been used: it is a stateless HMAC good for its whole window, so the same
-- token could complete the lesson again and again. Only settle_lesson_hearts was once-per-token, so later completions
-- skipped the start-time hearts gate and the hearts charge. Equally, a completion whose response was lost could not be
-- retried safely: the retry looked like a brand new completion.
--
--   lesson_session_redemptions   one row per token (by sha256 hex of the token, the same key lesson_heart_settlements
--                                uses): who, which lesson, the ORIGINAL response, the misses the original grading
--                                found and the instant hearts are settled from.
--   apply_lesson_completion_once the completion save plus the redemption claim in ONE transaction. A token that has
--                                already been redeemed returns the stored result and writes nothing, whatever answers
--                                the repeat carries (a retry is never re-graded).
--   finalize_lesson_session_result  replaces the stored response with the final one (achievements and settled hearts
--                                are known only after the save), so a retry returns what the first reply said.
--
-- The caller settles hearts after the save, from the STORED misses on a repeat, so a retry neither charges twice
-- (settle_lesson_hearts is idempotent per token) nor charges less (a first attempt that saved but never settled is
-- settled by its retry with the original misses).
--
-- Rows older than 7 days (the longest queued-completion window is 48 hours) are purged by the maintenance sweep
-- (run_maintenance_sweep, redefined at the end of this file with one more DELETE and otherwise unchanged from
-- 20261117100300), and also on the next redemption by the same user.
--
-- Depends on 20261014100300 (apply_lesson_completion; the newest definition is the one called, by name) and
-- 20261117100300 (run_maintenance_sweep, latest body).
--
-- Rollback: re-run run_maintenance_sweep from 20261117100300; DROP FUNCTION public.finalize_lesson_session_result(uuid, text, jsonb);
--   DROP FUNCTION public.apply_lesson_completion_once(uuid,text,text,text,date,jsonb,jsonb,jsonb,jsonb,text,jsonb,integer,timestamptz);
--   DROP TABLE public.lesson_session_redemptions;

-- client-grants: none public.lesson_session_redemptions
CREATE TABLE public.lesson_session_redemptions (
  token_hash text PRIMARY KEY CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lesson_id text NOT NULL,
  course text NOT NULL CHECK (course IN ('en', 'fr', 'es')),
  result jsonb NOT NULL,
  misses integer NOT NULL CHECK (misses >= 0 AND misses <= 50),
  settle_since timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX lesson_session_redemptions_user_created_idx
  ON public.lesson_session_redemptions (user_id, created_at);
ALTER TABLE public.lesson_session_redemptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lesson_session_redemptions FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.lesson_session_redemptions TO service_role;

CREATE FUNCTION public.apply_lesson_completion_once(
  _user_id uuid,
  _course text,
  _lesson_id text,
  _level text,
  _today date,
  _expected jsonb,
  _next jsonb,
  _missed_question_ids jsonb,
  _activity_events jsonb,
  _token_hash text,
  _result jsonb,
  _misses integer,
  _settle_since timestamptz
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _existing public.lesson_session_redemptions%ROWTYPE;
  _applied jsonb;
BEGIN
  IF _user_id IS NULL OR _token_hash IS NULL OR _token_hash !~ '^[0-9a-f]{64}$'
     OR _result IS NULL OR jsonb_typeof(_result) IS DISTINCT FROM 'object'
     OR _misses IS NULL OR _misses < 0 OR _misses > 50 OR _settle_since IS NULL
     OR (_course IN ('en', 'fr', 'es')) IS NOT TRUE OR _lesson_id IS NULL THEN
    RAISE EXCEPTION 'invalid single-use completion';
  END IF;

  -- The same per-user lock apply_lesson_completion takes: two requests carrying one token serialize here, so the
  -- second always sees the first's redemption.
  PERFORM 1 FROM auth.users WHERE id = _user_id FOR NO KEY UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'completion account no longer exists'; END IF;

  SELECT * INTO _existing FROM public.lesson_session_redemptions WHERE token_hash = _token_hash;
  IF FOUND THEN
    IF _existing.user_id <> _user_id OR _existing.lesson_id <> _lesson_id OR _existing.course <> _course THEN
      RAISE EXCEPTION 'lesson session token belongs to a different completion';
    END IF;
    RETURN jsonb_build_object(
      'status', 'redeemed',
      'result', _existing.result,
      'misses', _existing.misses,
      'settle_since', _existing.settle_since
    );
  END IF;

  _applied := public.apply_lesson_completion(
    _user_id, _course, _lesson_id, _level, _today, _expected, _next, _missed_question_ids, _activity_events
  );
  IF _applied->>'status' IS DISTINCT FROM 'applied' THEN
    RETURN _applied;
  END IF;

  DELETE FROM public.lesson_session_redemptions
    WHERE user_id = _user_id AND created_at < now() - interval '7 days';
  INSERT INTO public.lesson_session_redemptions
    (token_hash, user_id, lesson_id, course, result, misses, settle_since)
  VALUES (_token_hash, _user_id, _lesson_id, _course, _result, _misses, _settle_since);

  RETURN _applied;
END;
$$;
REVOKE ALL ON FUNCTION public.apply_lesson_completion_once(uuid,text,text,text,date,jsonb,jsonb,jsonb,jsonb,text,jsonb,integer,timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_lesson_completion_once(uuid,text,text,text,date,jsonb,jsonb,jsonb,jsonb,text,jsonb,integer,timestamptz)
  TO service_role;

CREATE FUNCTION public.finalize_lesson_session_result(_user_id uuid, _token_hash text, _result jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF _user_id IS NULL OR _token_hash IS NULL OR jsonb_typeof(_result) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'invalid lesson result';
  END IF;
  UPDATE public.lesson_session_redemptions SET result = _result
    WHERE token_hash = _token_hash AND user_id = _user_id;
END;
$$;
REVOKE ALL ON FUNCTION public.finalize_lesson_session_result(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_lesson_session_result(uuid, text, jsonb) TO service_role;

-- ---- the sweep: everything it did before, plus the redemption retention ----
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
  -- Lesson-session redemptions: a token's window is far shorter than this (20261123110000).
  DELETE FROM public.lesson_session_redemptions WHERE created_at < now() - interval '7 days';

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
