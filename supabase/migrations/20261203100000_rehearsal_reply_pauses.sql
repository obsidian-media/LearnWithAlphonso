-- Rehearsals v2, slice B2: how many of a run's replies were slow to start (the pause note), as numbers only.
--
-- rehearsal_runs gains two nullable integer columns (null for a run written before this migration, or when the client
-- sent no timings):
--   reply_latency_total  how many learner replies the client timed (at most 60, one per reply)
--   reply_latency_slow   of those, how many took the slow threshold (4000 ms, set by the server in code) or more to start
-- Never a timing, never a word: two counts. The threshold lives in the server code, not here, so it can be tuned
-- without a migration; the counts are only comparable between runs while it stays the same.
--
-- finish_rehearsal_recap gains `_latency_total` and `_latency_slow` (both DEFAULT NULL, so a caller that does not send
-- them writes a run with no pause signal). A bad pair (one missing, slow above total, total above 60 or above the
-- call's own reply count) is stored as no signal rather than failing the finish. The 12-argument function is dropped
-- and replaced, so there is still exactly one. Grants are exactly as before: service_role only.
--
-- The run INSERT also still copies the call's persona and hard_mode into the run (added by 20261202100000, slice F):
-- this file re-creates the function, so it must carry them or the Hector / hard-mode facts would silently be lost.
--
-- Depends on 20261202100000 (finish_rehearsal_recap that copies persona and hard_mode, on top of the key-phrase
-- arguments of 20261201100000, and the persona / hard_mode columns).
--
-- Rollback: DROP FUNCTION public.finish_rehearsal_recap(uuid, text, uuid, text[], jsonb, boolean, text[], text[], text[], integer, integer, integer, integer, integer);
--           ALTER TABLE public.rehearsal_runs DROP CONSTRAINT IF EXISTS rehearsal_runs_latency_counts_ok,
--             DROP COLUMN reply_latency_total, DROP COLUMN reply_latency_slow;
--           and re-run finish_rehearsal_recap from 20261202100000 (the 12-argument one).

ALTER TABLE public.rehearsal_runs
  ADD COLUMN IF NOT EXISTS reply_latency_total integer CHECK (reply_latency_total BETWEEN 0 AND 60),
  ADD COLUMN IF NOT EXISTS reply_latency_slow integer CHECK (reply_latency_slow >= 0);

ALTER TABLE public.rehearsal_runs DROP CONSTRAINT IF EXISTS rehearsal_runs_latency_counts_ok;
ALTER TABLE public.rehearsal_runs
  ADD CONSTRAINT rehearsal_runs_latency_counts_ok CHECK (
    (reply_latency_total IS NULL) = (reply_latency_slow IS NULL)
    AND (reply_latency_slow IS NULL OR reply_latency_slow <= reply_latency_total)
  );

DROP FUNCTION IF EXISTS public.finish_rehearsal_recap(uuid, text, uuid, text[], jsonb, boolean, text[], text[], text[], integer, integer, integer);
-- Also the new signature, so a second run of this file is harmless.
DROP FUNCTION IF EXISTS public.finish_rehearsal_recap(uuid, text, uuid, text[], jsonb, boolean, text[], text[], text[], integer, integer, integer, integer, integer);

CREATE FUNCTION public.finish_rehearsal_recap(
  _user_id uuid,
  _course text,
  _call_id uuid,
  _topics text[],
  _mistakes jsonb,
  _save boolean,
  _moments text[],
  _went_well text[],
  _corrections text[],
  _min_replies integer DEFAULT 4,
  _key_phrases_used integer DEFAULT NULL,
  _key_phrases_total integer DEFAULT NULL,
  _latency_total integer DEFAULT NULL,
  _latency_slow integer DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  call_row public.practice_calls%ROWTYPE;
  rehearsal_id uuid;
  saved integer;
  key_used integer;
  key_total integer;
  lat_total integer;
  lat_slow integer;
BEGIN
  IF _min_replies IS NULL OR _min_replies < 1 THEN
    RAISE EXCEPTION 'finish_rehearsal_recap: bad finish floor' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO call_row FROM public.practice_calls
    WHERE id = _call_id AND user_id = _user_id AND kind = 'rehearsal'
      AND finished_at IS NOT NULL AND recap_at IS NULL
    FOR UPDATE;
  IF NOT FOUND THEN
    RETURN -1;
  END IF;
  -- The finish rule: fewer replies than this is no run, so no memory, no stage done.
  IF call_row.replies < _min_replies THEN
    RETURN -2;
  END IF;

  saved := public.finish_call_recap(_user_id, _course, _call_id, _topics, _mistakes, _save);
  IF saved = -1 THEN
    RETURN -1;
  END IF;

  -- Key phrases: both or neither, and never more used than there are (a bad pair is stored as no signal).
  IF _key_phrases_used IS NOT NULL AND _key_phrases_total IS NOT NULL
     AND _key_phrases_total BETWEEN 0 AND 50 AND _key_phrases_used BETWEEN 0 AND _key_phrases_total THEN
    key_used := _key_phrases_used;
    key_total := _key_phrases_total;
  END IF;

  -- Reply timings: both or neither, never more slow than timed, never more timed than the call had replies.
  IF _latency_total IS NOT NULL AND _latency_slow IS NOT NULL
     AND _latency_total BETWEEN 1 AND 60 AND _latency_total <= call_row.replies
     AND _latency_slow BETWEEN 0 AND _latency_total THEN
    lat_total := _latency_total;
    lat_slow := _latency_slow;
  END IF;

  rehearsal_id := split_part(call_row.item_key, ':', 1)::uuid;
  -- The learner may have deleted the rehearsal while the call was open: the recap is still completed, no run is kept.
  INSERT INTO public.rehearsal_runs (
    rehearsal_id, user_id, practice_call_id, stage, moments_shown, went_well, corrections,
    speaking_replies, speaking_full, speaking_english, key_phrases_used, key_phrases_total,
    reply_latency_total, reply_latency_slow, persona, hard_mode)
  SELECT r.id, _user_id, _call_id, split_part(call_row.item_key, ':', 2),
         coalesce(_moments[1:5], '{}'), coalesce(_went_well[1:5], '{}'), coalesce(_corrections[1:5], '{}'),
         call_row.replies, call_row.replies - call_row.short_replies, call_row.english_replies,
         key_used, key_total, lat_total, lat_slow,
         call_row.persona, call_row.hard_mode
    FROM public.rehearsals AS r
    WHERE r.id = rehearsal_id AND r.user_id = _user_id
  ON CONFLICT (practice_call_id) WHERE practice_call_id IS NOT NULL DO NOTHING;
  RETURN saved;
END;
$$;
REVOKE ALL ON FUNCTION public.finish_rehearsal_recap(uuid, text, uuid, text[], jsonb, boolean, text[], text[], text[], integer, integer, integer, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_rehearsal_recap(uuid, text, uuid, text[], jsonb, boolean, text[], text[], text[], integer, integer, integer, integer, integer)
  TO service_role;
