-- Daily voice time: seconds of transcribed audio per learner per UTC day.
--
-- /api/stt already caps calls (120 a day, 10 a minute) and each upload (1 MB), but a call's cost is its audio
-- length, and 1 MB of low-bitrate audio can run for many minutes. The route now refuses a call when the day's
-- seconds are spent and, after each transcription, adds the length the speech provider reports. The budget itself
-- (default 20 minutes) is a server setting, STT_DAILY_AUDIO_SECONDS (src/lib/stt-audio-budget.server.ts).
--
-- The seconds live in ai_usage under kind 'stt_seconds', beside the 'stt' call counter, so they go with the account
-- (ON DELETE CASCADE), are in the account export, and are pruned by the maintenance sweep after 90 days.
-- consume_ai_quota has no limit for 'stt_seconds', so a client cannot add to or reset it through that function.
-- Both functions are for the server (service role) only.
--
-- Rollback: DROP FUNCTION public.add_stt_audio_seconds(uuid, integer); DROP FUNCTION public.stt_audio_seconds_used(uuid);
--           DELETE FROM public.ai_usage WHERE kind = 'stt_seconds';

CREATE FUNCTION public.stt_audio_seconds_used(_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE((
    SELECT u.count FROM public.ai_usage u
     WHERE u.user_id = _user_id AND u.day = current_date AND u.kind = 'stt_seconds'
  ), 0);
$$;
REVOKE ALL ON FUNCTION public.stt_audio_seconds_used(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stt_audio_seconds_used(uuid) TO service_role;

CREATE FUNCTION public.add_stt_audio_seconds(_user_id uuid, _seconds integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  total integer;
BEGIN
  IF _user_id IS NULL OR _seconds IS NULL OR _seconds < 0 THEN
    RAISE EXCEPTION 'add_stt_audio_seconds: seconds must be zero or more' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.ai_usage AS u (user_id, day, kind, count)
  VALUES (_user_id, current_date, 'stt_seconds', _seconds)
  ON CONFLICT (user_id, day, kind) DO UPDATE
    SET count = u.count + EXCLUDED.count, updated_at = now()
  RETURNING u.count INTO total;
  RETURN total;
END;
$$;
REVOKE ALL ON FUNCTION public.add_stt_audio_seconds(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_stt_audio_seconds(uuid, integer) TO service_role;
