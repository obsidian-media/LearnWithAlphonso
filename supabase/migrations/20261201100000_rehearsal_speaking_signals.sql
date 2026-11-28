-- Rehearsals v2, slice B1: the speaking signals of a finished run ("How you spoke"), as numbers only.
--
-- rehearsal_runs gains five nullable integer columns (null for a run written before this migration):
--   speaking_replies   the learner replies of the run (the call's own count)
--   speaking_full      of those, how many were a full answer (not short, by the server's own measureReply)
--   speaking_english   of those, how many fell back to English
--   key_phrases_used   how many of the brief's key phrases the learner used (matched by the server at recap time)
--   key_phrases_total  how many key phrases the brief had
-- Never a learner word, never a phrase's text: counts only.
--
-- finish_rehearsal_recap gains `_key_phrases_used` and `_key_phrases_total` (both DEFAULT NULL, so a caller that does
-- not send them writes a run with no key-phrase signal). The three reply counts are read from the locked practice_calls
-- row inside the function, so they cannot disagree with the call. The 10-argument function is dropped and replaced, so
-- there is still exactly one. Grants are exactly as before: service_role only.
--
-- Depends on 20261130100000 (finish_rehearsal_recap with _min_replies).
--
-- Rollback: DROP FUNCTION public.finish_rehearsal_recap(uuid, text, uuid, text[], jsonb, boolean, text[], text[], text[], integer, integer, integer);
--           ALTER TABLE public.rehearsal_runs DROP COLUMN speaking_replies, DROP COLUMN speaking_full,
--             DROP COLUMN speaking_english, DROP COLUMN key_phrases_used, DROP COLUMN key_phrases_total;
--           and re-run finish_rehearsal_recap from 20261130100000 (the 10-argument one).

ALTER TABLE public.rehearsal_runs
  ADD COLUMN speaking_replies integer CHECK (speaking_replies BETWEEN 0 AND 1000),
  ADD COLUMN speaking_full integer CHECK (speaking_full >= 0),
  ADD COLUMN speaking_english integer CHECK (speaking_english >= 0),
  ADD COLUMN key_phrases_used integer CHECK (key_phrases_used >= 0),
  ADD COLUMN key_phrases_total integer CHECK (key_phrases_total BETWEEN 0 AND 50),
  ADD CONSTRAINT rehearsal_runs_speaking_counts_ok CHECK (
    (speaking_full IS NULL OR (speaking_replies IS NOT NULL AND speaking_full <= speaking_replies))
    AND (speaking_english IS NULL OR (speaking_replies IS NOT NULL AND speaking_english <= speaking_replies))
    AND (key_phrases_used IS NULL OR (key_phrases_total IS NOT NULL AND key_phrases_used <= key_phrases_total))
  );

DROP FUNCTION public.finish_rehearsal_recap(uuid, text, uuid, text[], jsonb, boolean, text[], text[], text[], integer);

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
  _key_phrases_total integer DEFAULT NULL
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

  rehearsal_id := split_part(call_row.item_key, ':', 1)::uuid;
  -- The learner may have deleted the rehearsal while the call was open: the recap is still completed, no run is kept.
  INSERT INTO public.rehearsal_runs (
    rehearsal_id, user_id, practice_call_id, stage, moments_shown, went_well, corrections,
    speaking_replies, speaking_full, speaking_english, key_phrases_used, key_phrases_total)
  SELECT r.id, _user_id, _call_id, split_part(call_row.item_key, ':', 2),
         coalesce(_moments[1:5], '{}'), coalesce(_went_well[1:5], '{}'), coalesce(_corrections[1:5], '{}'),
         call_row.replies, call_row.replies - call_row.short_replies, call_row.english_replies,
         key_used, key_total
    FROM public.rehearsals AS r
    WHERE r.id = rehearsal_id AND r.user_id = _user_id
  ON CONFLICT (practice_call_id) WHERE practice_call_id IS NOT NULL DO NOTHING;
  RETURN saved;
END;
$$;
REVOKE ALL ON FUNCTION public.finish_rehearsal_recap(uuid, text, uuid, text[], jsonb, boolean, text[], text[], text[], integer, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_rehearsal_recap(uuid, text, uuid, text[], jsonb, boolean, text[], text[], text[], integer, integer, integer)
  TO service_role;
