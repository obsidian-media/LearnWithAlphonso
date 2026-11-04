-- Anti-farming, machine speed only (owner decision 2026-11-04: no minimum lesson time, no daily XP cap).
-- complete-lesson refuses more than 60 completions per user in any rolling hour. Production's busiest real hour is 7,
-- so 60 is about 8x human pace. Completions are counted at their (clamped) completion instant, so an offline queue
-- that replays many lessons after reconnecting is spread over the hours they were actually played and is not refused
-- for arriving together.
--
-- client-grants: none public.lesson_completion_hits
CREATE TABLE public.lesson_completion_hits (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  at timestamptz NOT NULL
);
CREATE INDEX lesson_completion_hits_user_at_idx ON public.lesson_completion_hits (user_id, at);
ALTER TABLE public.lesson_completion_hits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lesson_completion_hits FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.lesson_completion_hits TO service_role;

-- True when the completion may proceed (and records it); false when this user already has _limit completions within an
-- hour of _at. Serialised per user so two concurrent requests cannot both squeeze under the limit.
CREATE FUNCTION public.consume_lesson_completion_slot(_user_id uuid, _at timestamptz, _limit integer DEFAULT 60)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  n integer;
BEGIN
  IF _user_id IS NULL OR _at IS NULL OR _limit IS NULL OR _limit < 1 THEN
    RAISE EXCEPTION 'invalid completion slot request';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('lesson_completion_hits:' || _user_id::text, 0));

  SELECT count(*) INTO n FROM public.lesson_completion_hits h
  WHERE h.user_id = _user_id AND h.at > _at - interval '1 hour' AND h.at < _at + interval '1 hour';
  IF n >= _limit THEN
    RETURN false;
  END IF;

  INSERT INTO public.lesson_completion_hits (user_id, at) VALUES (_user_id, _at);
  DELETE FROM public.lesson_completion_hits h WHERE h.user_id = _user_id AND h.at < now() - interval '2 days';
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_lesson_completion_slot(uuid, timestamptz, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_lesson_completion_slot(uuid, timestamptz, integer) TO service_role;

-- Rollback: DROP FUNCTION public.consume_lesson_completion_slot(uuid, timestamptz, integer);
--           DROP TABLE public.lesson_completion_hits;
