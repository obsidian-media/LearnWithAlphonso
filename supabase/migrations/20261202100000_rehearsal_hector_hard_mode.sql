-- Rehearsals v2, slice F: Hector rehearsals and hard mode (Pro). Storage only; the rules live in the server.
--
-- practice_calls gains `persona` ('alphonso' | 'hector', default 'alphonso') and `hard_mode` (boolean, default false).
-- record_practice_reply stores them in the SAME statement that creates the call row (new optional arguments `_persona`
-- and `_hard_mode`, defaulting to 'alphonso' and false, so the previous deploy's calls resolve to the same behaviour),
-- and every later turn reads them back, so a call keeps the mode it started with. A conflict (a later reply) never
-- rewrites them. There is no separate UPDATE that could fail and leave a Hector run recorded as Alphonso. The 8-argument
-- function is dropped and replaced, so there is exactly one; grants are exactly as before (service_role only).
-- So Pro is checked at that start and never again, and a free run cannot be turned into a Hector run halfway. rehearsal_runs gains the same two columns, copied from the call when the run is written, so "hard mode done"
-- is a fact about a finished run and a hard-mode run can be told apart from the stage's own run (it never marks its
-- stage done). A CHECK keeps hard mode to Hector on the last stage ('<id>:hard_moments').
--
-- finish_rehearsal_recap keeps its exact signature (CREATE OR REPLACE, so the grants stay and the code of the previous
-- deploy keeps calling it): it only also copies the call's persona and hard_mode into the run. Rows written before this
-- migration read as Alphonso, not hard, through the column defaults.
--
-- Depends on 20261201100000 (finish_rehearsal_recap with the speaking signals).
--
-- Rollback: DROP FUNCTION public.record_practice_reply(uuid, uuid, text, text, text, boolean, boolean, boolean, text, boolean)
--           and re-create the 8-argument one from 20261107032021; re-run finish_rehearsal_recap from 20261201100000, then
--           ALTER TABLE public.rehearsal_runs DROP COLUMN persona, DROP COLUMN hard_mode;
--           ALTER TABLE public.practice_calls DROP COLUMN persona, DROP COLUMN hard_mode;

ALTER TABLE public.practice_calls
  ADD COLUMN IF NOT EXISTS persona text NOT NULL DEFAULT 'alphonso' CHECK (persona IN ('alphonso', 'hector')),
  ADD COLUMN IF NOT EXISTS hard_mode boolean NOT NULL DEFAULT false,
  ADD CONSTRAINT practice_calls_hard_mode_ok CHECK (
    NOT hard_mode OR (persona = 'hector' AND kind = 'rehearsal' AND item_key LIKE '%:hard_moments')
  ) NOT VALID;
ALTER TABLE public.practice_calls VALIDATE CONSTRAINT practice_calls_hard_mode_ok;

ALTER TABLE public.rehearsal_runs
  ADD COLUMN IF NOT EXISTS persona text NOT NULL DEFAULT 'alphonso' CHECK (persona IN ('alphonso', 'hector')),
  ADD COLUMN IF NOT EXISTS hard_mode boolean NOT NULL DEFAULT false,
  ADD CONSTRAINT rehearsal_runs_hard_mode_ok CHECK (NOT hard_mode OR (persona = 'hector' AND stage = 'hard_moments'))
  NOT VALID;
ALTER TABLE public.rehearsal_runs VALIDATE CONSTRAINT rehearsal_runs_hard_mode_ok;

-- record_practice_reply with the run's mode. Everything else is exactly 20261107032021's body.
DROP FUNCTION public.record_practice_reply(uuid, uuid, text, text, text, boolean, boolean, boolean);
CREATE FUNCTION public.record_practice_reply(
  _user_id uuid,
  _call_id uuid,
  _course text,
  _kind text,
  _item_key text,
  _right boolean,
  _short boolean,
  _english boolean,
  _persona text DEFAULT 'alphonso',
  _hard_mode boolean DEFAULT false
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  total integer;
BEGIN
  IF _user_id IS NULL OR _call_id IS NULL OR _right IS NULL OR _short IS NULL OR _english IS NULL
     OR _persona IS NULL OR _hard_mode IS NULL THEN
    RAISE EXCEPTION 'record_practice_reply: missing argument' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.practice_calls AS c
    (id, user_id, course, kind, item_key, replies, right_replies, short_replies, english_replies, persona, hard_mode)
  VALUES
    (_call_id, _user_id, _course, _kind, _item_key, 1, _right::int, _short::int, _english::int, _persona, _hard_mode)
  ON CONFLICT (id) DO UPDATE
    SET replies = c.replies + 1,
        right_replies = c.right_replies + EXCLUDED.right_replies,
        short_replies = c.short_replies + EXCLUDED.short_replies,
        english_replies = c.english_replies + EXCLUDED.english_replies,
        last_reply_at = now()
    WHERE c.user_id = EXCLUDED.user_id
      AND c.course = EXCLUDED.course
      AND c.kind = EXCLUDED.kind
      AND c.item_key = EXCLUDED.item_key
      AND c.finished_at IS NULL
  RETURNING c.replies INTO total;
  IF total IS NULL THEN
    RAISE EXCEPTION 'record_practice_reply: call belongs to another user or item, or is finished'
      USING ERRCODE = '22023';
  END IF;
  RETURN total;
END;
$$;
REVOKE ALL ON FUNCTION public.record_practice_reply(uuid, uuid, text, text, text, boolean, boolean, boolean, text, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_practice_reply(uuid, uuid, text, text, text, boolean, boolean, boolean, text, boolean)
  TO service_role;

CREATE OR REPLACE FUNCTION public.finish_rehearsal_recap(
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
    speaking_replies, speaking_full, speaking_english, key_phrases_used, key_phrases_total,
    persona, hard_mode)
  SELECT r.id, _user_id, _call_id, split_part(call_row.item_key, ':', 2),
         coalesce(_moments[1:5], '{}'), coalesce(_went_well[1:5], '{}'), coalesce(_corrections[1:5], '{}'),
         call_row.replies, call_row.replies - call_row.short_replies, call_row.english_replies,
         key_used, key_total,
         call_row.persona, call_row.hard_mode
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
