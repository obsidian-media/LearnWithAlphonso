-- Rehearsals, slice 0: a per-account switch, closing by time, and one source of truth for the finish floor.
--
-- rehearsals_off:           the accounts rehearsals are switched OFF for. REHEARSALS_ENABLED stays the global kill switch;
--                           a row here turns it off for one account on top of that. Server-only (no client privileges),
--                           so a client can never turn itself back on. One row per account, with the reason.
-- set_rehearsals_off:       the one way to flip it: turns an account off (or back on) and writes the staff action record
--                           in the same transaction (action user.rehearsals_off / user.rehearsals_on).
-- close_stale_rehearsals:   an ACTIVE rehearsal ends by itself with outcome {"choice":"none"}: 7 days after its event
--                           date (by the learner's calendar day, passed in), or, with no date, 30 days after its last
--                           activity (the newest finished run, else its creation). Closes nothing else, writes no memory
--                           line, and leaves the plan and its runs readable. The server calls it for one learner when
--                           that learner's rehearsals are read or created; a daily job calls it for everyone.
-- finish_rehearsal_recap:   gains `_min_replies` (the finish floor), so the floor is passed by the server instead of
--                           being a second copy of the number. The default is 4, the same as
--                           REHEARSAL_FINISH_MIN_REPLIES in src/lib/practice-calls.server.ts (one test pins the two).
--                           The 9-argument function is dropped and replaced, so there is still exactly one.
--
-- Depends on 20261129110000 (finish_rehearsal_recap) and 20261113100000 (staff_record).
--
-- Rollback: SELECT cron.unschedule('rehearsals-close-stale');
--           DROP FUNCTION public.close_stale_rehearsals(uuid, date);
--           DROP FUNCTION public.set_rehearsals_off(uuid, boolean, text, uuid);
--           DROP TABLE public.rehearsals_off;
--           and re-run finish_rehearsal_recap from 20261129110000 (drop the 10-argument one first).

-- client-grants: none public.rehearsals_off
CREATE TABLE public.rehearsals_off (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  reason text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 3 AND 500),
  set_by uuid,
  set_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.rehearsals_off ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rehearsals_off FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.rehearsals_off TO service_role;

-- Turns rehearsals off (_off = true) or on (false) for ONE account, with the reason, and records who did it.
-- Returns true when something changed (false when it was already in that state).
CREATE FUNCTION public.set_rehearsals_off(_user_id uuid, _off boolean, _reason text, _actor uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  changed integer;
  why text := btrim(coalesce(_reason, ''));
BEGIN
  IF _user_id IS NULL OR _off IS NULL THEN
    RAISE EXCEPTION 'set_rehearsals_off: missing argument' USING ERRCODE = '22023';
  END IF;
  IF char_length(why) < 3 THEN
    RAISE EXCEPTION 'set_rehearsals_off: a reason is required' USING ERRCODE = '22023';
  END IF;
  IF _off THEN
    INSERT INTO public.rehearsals_off (user_id, reason, set_by) VALUES (_user_id, why, _actor)
      ON CONFLICT (user_id) DO NOTHING;
  ELSE
    DELETE FROM public.rehearsals_off WHERE user_id = _user_id;
  END IF;
  GET DIAGNOSTICS changed = ROW_COUNT;
  IF changed > 0 THEN
    PERFORM public.staff_record(
      _actor, 'owner', CASE WHEN _off THEN 'user.rehearsals_off' ELSE 'user.rehearsals_on' END,
      _user_id, why, jsonb_build_object('rehearsals_off', NOT _off), jsonb_build_object('rehearsals_off', _off), NULL);
  END IF;
  RETURN changed > 0;
END;
$$;
REVOKE ALL ON FUNCTION public.set_rehearsals_off(uuid, boolean, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_rehearsals_off(uuid, boolean, text, uuid) TO service_role;

-- Closes the ACTIVE rehearsals that ran out of time. `_user_id` NULL means everyone's. `_today` is the learner's own
-- calendar day: a dated rehearsal ends once `_today` is event_date + 7 or later. An undated one ends 30 days after its
-- last activity. Returns how many it closed.
CREATE FUNCTION public.close_stale_rehearsals(_user_id uuid, _today date)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  closed integer;
BEGIN
  IF _today IS NULL THEN
    RAISE EXCEPTION 'close_stale_rehearsals: a day is required' USING ERRCODE = '22023';
  END IF;
  UPDATE public.rehearsals AS r
    SET status = 'done', closed_at = now(), outcome = '{"choice":"none"}'::jsonb
    WHERE r.status = 'active'
      AND (_user_id IS NULL OR r.user_id = _user_id)
      AND (
        (r.event_date IS NOT NULL AND r.event_date + 7 <= _today)
        OR (
          r.event_date IS NULL
          AND greatest(
                r.created_at,
                coalesce((SELECT max(x.finished_at) FROM public.rehearsal_runs AS x WHERE x.rehearsal_id = r.id), r.created_at)
              ) <= now() - interval '30 days'
        )
      );
  GET DIAGNOSTICS closed = ROW_COUNT;
  RETURN closed;
END;
$$;
REVOKE ALL ON FUNCTION public.close_stale_rehearsals(uuid, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.close_stale_rehearsals(uuid, date) TO service_role;

-- Everyone's, once a day. The day passed is YESTERDAY in UTC: no learner's own calendar day is ever earlier than that,
-- so the daily pass can only close a rehearsal a little late, never early. (cron is absent in a plain Postgres, so
-- a database without the extension skips the schedule.)
DO $$
BEGIN
  IF to_regnamespace('cron') IS NOT NULL THEN
    PERFORM cron.schedule(
      'rehearsals-close-stale', '17 3 * * *',
      'SELECT public.close_stale_rehearsals(NULL, current_date - 1)');
  END IF;
END
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- finish_rehearsal_recap with the finish floor as an argument (20261129110000's body, plus `_min_replies`).
-- ---------------------------------------------------------------------------------------------------------------
DROP FUNCTION public.finish_rehearsal_recap(uuid, text, uuid, text[], jsonb, boolean, text[], text[], text[]);

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
  _min_replies integer DEFAULT 4
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
REVOKE ALL ON FUNCTION public.finish_rehearsal_recap(uuid, text, uuid, text[], jsonb, boolean, text[], text[], text[], integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_rehearsal_recap(uuid, text, uuid, text[], jsonb, boolean, text[], text[], text[], integer)
  TO service_role;
