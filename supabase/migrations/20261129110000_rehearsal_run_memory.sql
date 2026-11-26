-- Rehearsals, slice 2: what a finished run teaches the tutor, and "How did it go?".
--
-- finish_rehearsal_recap: the rehearsal twin of finish_call_recap (20261128170000). In ONE transaction it completes
-- the call's recap (weakness events and memory lines, through finish_call_recap) and writes the run's rehearsal_runs
-- row. A call under the rehearsal finish rule (4 learner replies) writes nothing at all and is not completed. A
-- completed call is never written twice: finish_call_recap answers -1 and the run row is skipped, and the unique index
-- on rehearsal_runs.practice_call_id is the backstop. The arrays are the server's moment labels and corrected forms,
-- never the learner's own words; they are cut to 5 items here as well as by the CHECK.
-- Returns the number of memory lines written, -1 when there is nothing to complete (not this learner's, not a
-- rehearsal call, not finished, already completed), -2 when the call is under the finish rule.
--
-- close_rehearsal: closes the learner's ACTIVE rehearsal ('done') with the chosen outcome and writes ONE fixed memory
-- line (kind 'phrase', a template per outcome, no learner text) in the same transaction. A closed rehearsal raises
-- rehearsal_closed (P0001), an unknown one rehearsal_not_found (P0002).
-- move_rehearsal: moves the date of an ACTIVE rehearsal; it stays active.
--
-- Rollback: DROP FUNCTION public.finish_rehearsal_recap(uuid, text, uuid, text[], jsonb, boolean, text[], text[], text[]),
--           public.close_rehearsal(uuid, uuid, jsonb, text), public.move_rehearsal(uuid, uuid, date);

CREATE FUNCTION public.finish_rehearsal_recap(
  _user_id uuid,
  _course text,
  _call_id uuid,
  _topics text[],
  _mistakes jsonb,
  _save boolean,
  _moments text[],
  _went_well text[],
  _corrections text[]
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
BEGIN
  SELECT * INTO call_row FROM public.practice_calls
    WHERE id = _call_id AND user_id = _user_id AND kind = 'rehearsal'
      AND finished_at IS NOT NULL AND recap_at IS NULL
    FOR UPDATE;
  IF NOT FOUND THEN
    RETURN -1;
  END IF;
  -- The finish rule: fewer replies than this is no run, so no memory, no stage done.
  IF call_row.replies < 4 THEN
    RETURN -2;
  END IF;

  saved := public.finish_call_recap(_user_id, _course, _call_id, _topics, _mistakes, _save);
  IF saved = -1 THEN
    RETURN -1;
  END IF;

  rehearsal_id := split_part(call_row.item_key, ':', 1)::uuid;
  -- The learner may have deleted the rehearsal while the call was open: the recap is still completed, no run is kept.
  INSERT INTO public.rehearsal_runs (rehearsal_id, user_id, practice_call_id, stage, moments_shown, went_well, corrections)
  SELECT r.id, _user_id, _call_id, split_part(call_row.item_key, ':', 2),
         coalesce(_moments[1:5], '{}'), coalesce(_went_well[1:5], '{}'), coalesce(_corrections[1:5], '{}')
    FROM public.rehearsals AS r
    WHERE r.id = rehearsal_id AND r.user_id = _user_id
  ON CONFLICT (practice_call_id) WHERE practice_call_id IS NOT NULL DO NOTHING;
  RETURN saved;
END;
$$;
REVOKE ALL ON FUNCTION public.finish_rehearsal_recap(uuid, text, uuid, text[], jsonb, boolean, text[], text[], text[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_rehearsal_recap(uuid, text, uuid, text[], jsonb, boolean, text[], text[], text[])
  TO service_role;

CREATE FUNCTION public.close_rehearsal(_user_id uuid, _id uuid, _outcome jsonb, _memory_text text)
RETURNS public.rehearsals
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  changed public.rehearsals;
  total integer;
BEGIN
  UPDATE public.rehearsals AS r
    SET status = 'done', closed_at = now(), outcome = _outcome
    WHERE r.id = _id AND r.user_id = _user_id AND r.status = 'active'
    RETURNING r.* INTO changed;
  IF changed.id IS NULL THEN
    PERFORM 1 FROM public.rehearsals WHERE id = _id AND user_id = _user_id;
    IF FOUND THEN
      RAISE EXCEPTION 'rehearsal_closed' USING ERRCODE = 'P0001';
    END IF;
    RAISE EXCEPTION 'rehearsal_not_found' USING ERRCODE = 'P0002';
  END IF;
  -- The memory keeps its 200-line cap per learner (the same rule as remember_call_recap).
  SELECT count(*) INTO total FROM public.tutor_memory WHERE user_id = _user_id;
  IF _memory_text IS NOT NULL AND total < 200 THEN
    INSERT INTO public.tutor_memory (user_id, course, kind, memory_key, text)
    VALUES (_user_id, changed.course, 'phrase', 'rehearsal:' || _id::text, left(_memory_text, 140))
    ON CONFLICT (user_id, course, kind, memory_key) DO NOTHING;
  END IF;
  RETURN changed;
END;
$$;
REVOKE ALL ON FUNCTION public.close_rehearsal(uuid, uuid, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.close_rehearsal(uuid, uuid, jsonb, text) TO service_role;

CREATE FUNCTION public.move_rehearsal(_user_id uuid, _id uuid, _event_date date)
RETURNS public.rehearsals
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  changed public.rehearsals;
BEGIN
  UPDATE public.rehearsals AS r
    SET event_date = _event_date
    WHERE r.id = _id AND r.user_id = _user_id AND r.status = 'active'
    RETURNING r.* INTO changed;
  IF changed.id IS NULL THEN
    RAISE EXCEPTION 'rehearsal_not_found' USING ERRCODE = 'P0002';
  END IF;
  RETURN changed;
END;
$$;
REVOKE ALL ON FUNCTION public.move_rehearsal(uuid, uuid, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.move_rehearsal(uuid, uuid, date) TO service_role;
