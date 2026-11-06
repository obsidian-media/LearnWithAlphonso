-- Daily voice time: seconds of transcribed audio per learner per UTC day.
--
-- /api/stt already caps calls (120 a day, 10 a minute) and each upload (1 MB), but a call's cost is its audio
-- length, and 1 MB of low-bitrate audio can run for many minutes. The route now reserves the per-call maximum before
-- calling the speech provider, and settles the reservation to the length the provider reports afterwards. The budget
-- (default 20 minutes) and the per-call maximum (default 120 s) are server settings (src/lib/stt-audio-budget.server.ts)
-- passed in by the route.
--
-- reserve_stt_audio_seconds adds _seconds only if the day's total stays within _budget, in ONE statement: the insert's
-- conflict update re-checks the condition on the locked, latest row, so parallel calls queue on that row and none can
-- pass the budget. It returns the day the seconds were booked on, or NULL when they do not fit.
-- settle_stt_audio_seconds moves a reservation on that day to the actual length (0 = full refund).
--
-- The seconds live in ai_usage under kind 'stt_seconds', beside the 'stt' call counter, so they go with the account
-- (ON DELETE CASCADE), are in the account export, and are pruned by the maintenance sweep after 90 days.
-- consume_ai_quota has no limit for 'stt_seconds', so a client cannot add to or reset it through that function.
-- Both functions are for the server (service role) only.
--
-- Rollback: DROP FUNCTION public.settle_stt_audio_seconds(uuid, date, integer, integer);
--           DROP FUNCTION public.reserve_stt_audio_seconds(uuid, integer, integer);
--           DELETE FROM public.ai_usage WHERE kind = 'stt_seconds';

CREATE FUNCTION public.reserve_stt_audio_seconds(_user_id uuid, _seconds integer, _budget integer)
RETURNS date
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  booked date;
BEGIN
  IF _user_id IS NULL OR _seconds IS NULL OR _seconds < 0 OR _budget IS NULL OR _budget < 0 THEN
    RAISE EXCEPTION 'reserve_stt_audio_seconds: seconds and budget must be zero or more' USING ERRCODE = '22023';
  END IF;
  IF _seconds > _budget THEN
    RETURN NULL;
  END IF;
  -- MUTATION CHECK (temporary): read, then write, not atomic.
  IF COALESCE((SELECT u.count FROM public.ai_usage u
       WHERE u.user_id = _user_id AND u.day = current_date AND u.kind = 'stt_seconds'), 0) + _seconds > _budget THEN
    RETURN NULL;
  END IF;
  PERFORM pg_sleep(0.05);
  INSERT INTO public.ai_usage AS u (user_id, day, kind, count)
  VALUES (_user_id, current_date, 'stt_seconds', _seconds)
  ON CONFLICT (user_id, day, kind) DO UPDATE
    SET count = u.count + EXCLUDED.count, updated_at = now()
  RETURNING u.day INTO booked;
  RETURN booked;
END;
$$;
REVOKE ALL ON FUNCTION public.reserve_stt_audio_seconds(uuid, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_stt_audio_seconds(uuid, integer, integer) TO service_role;

CREATE FUNCTION public.settle_stt_audio_seconds(_user_id uuid, _day date, _reserved integer, _actual integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF _user_id IS NULL OR _day IS NULL OR _reserved IS NULL OR _reserved < 0 OR _actual IS NULL OR _actual < 0 THEN
    RAISE EXCEPTION 'settle_stt_audio_seconds: seconds must be zero or more' USING ERRCODE = '22023';
  END IF;
  UPDATE public.ai_usage u
     SET count = GREATEST(u.count - _reserved + _actual, 0), updated_at = now()
   WHERE u.user_id = _user_id AND u.day = _day AND u.kind = 'stt_seconds';
END;
$$;
REVOKE ALL ON FUNCTION public.settle_stt_audio_seconds(uuid, date, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_stt_audio_seconds(uuid, date, integer, integer) TO service_role;
