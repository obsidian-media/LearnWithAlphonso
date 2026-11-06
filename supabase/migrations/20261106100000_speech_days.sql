-- Minutes spoken: seconds of the learner's own speech that were transcribed, per learner per UTC day.
--
-- Recorded by /api/stt (the one server path that transcribes learner speech: Practice call, campaigns, Hector, speak
-- answer questions, on web, iOS and Android) after a SUCCESSFUL transcription only: the provider answered 2xx, the
-- answer was readable, it reported the audio's length, and the transcript is not empty. The seconds are the same
-- settled length the voice time budget (20261105100900) charges, the provider's metadata.duration rounded up, never
-- the reserved per-call maximum. Failed, refused, timed-out, over-budget and silent recordings add nothing, and
-- the text-to-speech replies never pass through /api/stt.
--
-- Why a table of its own and not a column on activity_days: a row in activity_days means "earned XP that day".
-- Team quests count active days as count(DISTINCT day) there, apply_lesson_completion compares the day's row against
-- its read snapshot, and the weekly XP trigger fires on every write to it. A speech-only row would create "active"
-- days with no XP and make lesson completions retry against a row that changed under them. A separate table has none
-- of those couplings, and its own retention (none: Profile shows real history).
--
-- The day: the UTC calendar date at the moment of recording, (now() AT TIME ZONE 'UTC')::date, which is how the
-- lesson completion path picks the activity_days day for XP (src/lib/sync.functions.ts todayStr() and the
-- complete-lesson Edge Function's server day are both the UTC date of the server clock). Written explicitly as UTC,
-- so it does not depend on the session's TimeZone setting.
--
-- add_speech_seconds adds in ONE statement (INSERT ... ON CONFLICT DO UPDATE SET n = n + EXCLUDED.n): parallel calls
-- queue on the row lock and every addition counts; there is no read-modify-write. Server (service role) only. One
-- call adds at most 3600 s (an hour): the upload cap (1 MB) keeps a real recording far below that, so a larger
-- number can only be a bug, and it is refused rather than inflating the day.
-- Learners read their own rows (RLS); no client can write. Rows go with the account (ON DELETE CASCADE from
-- auth.users) and are part of the account export.
--
-- Rollback: DROP FUNCTION public.add_speech_seconds(uuid, integer); DROP TABLE public.speech_days;

CREATE TABLE public.speech_days (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day date NOT NULL,
  speech_seconds integer NOT NULL DEFAULT 0 CHECK (speech_seconds >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, day)
);
ALTER TABLE public.speech_days ENABLE ROW LEVEL SECURITY;
CREATE POLICY speech_days_select_own ON public.speech_days
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
REVOKE ALL ON public.speech_days FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.speech_days TO authenticated;
GRANT ALL ON public.speech_days TO service_role;

CREATE FUNCTION public.add_speech_seconds(_user_id uuid, _seconds integer)
RETURNS date
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  booked date;
BEGIN
  IF _user_id IS NULL OR _seconds IS NULL OR _seconds < 0 OR _seconds > 3600 THEN
    RAISE EXCEPTION 'add_speech_seconds: seconds must be from 0 to 3600' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.speech_days AS s (user_id, day, speech_seconds)
  VALUES (_user_id, (now() AT TIME ZONE 'UTC')::date, _seconds)
  ON CONFLICT (user_id, day) DO UPDATE
    SET speech_seconds = s.speech_seconds + EXCLUDED.speech_seconds, updated_at = now()
  RETURNING s.day INTO booked;
  RETURN booked;
END;
$$;
REVOKE ALL ON FUNCTION public.add_speech_seconds(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_speech_seconds(uuid, integer) TO service_role;
