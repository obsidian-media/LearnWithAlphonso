-- Rehearsals: a learner prepares one real upcoming conversation (an interview, a meeting, an appointment) in three
-- live stages, and the tutor remembers every run.
--
-- rehearsals:          one row per rehearsal. The learner's own words (counterpart, worries) and the server-built
--                      scenario brief live here, shown only to that learner, exported with the account and removed
--                      with it. `free` marks the learner's one free rehearsal.
-- rehearsal_runs:      what each finished run of a stage taught the tutor: moment labels and corrected forms only,
--                      never the learner's own words. Written by the server when a call's recap is made.
-- rehearsal_free_used: the one-free-rehearsal-ever marker. It deliberately has no foreign key to `rehearsals`, so
--                      deleting or cancelling the free rehearsal does not give back another free one. It goes with
--                      the account (ON DELETE CASCADE from auth.users).
--
-- Runs are ordinary practice_calls rows with kind 'rehearsal' and item_key '<rehearsal id>:<stage>', so stars, recap
-- and memory work unchanged. The kind CHECKs on practice_calls and practice_stars are widened to allow it.
--
-- Clients may SELECT their own rows, and DELETE their own rehearsal. Every write goes through the server.
--
-- Rollback: DROP TABLE public.rehearsal_runs; DROP TABLE public.rehearsals; DROP TABLE public.rehearsal_free_used;
--           DROP FUNCTION public.rehearsal_text_array_ok(text[]);
--           and restore the two kind CHECKs to ('scenario', 'scene').

-- At most 5 items, each at most 140 characters. A CHECK cannot hold a subquery, so the per-item rule is a function.
CREATE FUNCTION public.rehearsal_text_array_ok(items text[])
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT items IS NOT NULL
    AND cardinality(items) <= 5
    AND coalesce((SELECT max(char_length(i)) FROM unnest(items) AS i), 0) <= 140
$$;
REVOKE ALL ON FUNCTION public.rehearsal_text_array_ok(text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rehearsal_text_array_ok(text[]) TO service_role;

CREATE TABLE public.rehearsals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course text NOT NULL CHECK (course IN ('en', 'fr', 'es')),
  event_kind text NOT NULL CHECK (
    event_kind IN ('interview', 'meeting', 'presentation', 'appointment', 'housing', 'first_day', 'other')
  ),
  event_date date,
  counterpart text NOT NULL CHECK (char_length(counterpart) <= 200),
  worries text CHECK (char_length(worries) <= 200),
  brief jsonb NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'done', 'cancelled')),
  free boolean NOT NULL,
  outcome jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz
);
CREATE INDEX rehearsals_user_idx ON public.rehearsals (user_id, course, status);
-- One active rehearsal per learner and course, enforced where it cannot race.
CREATE UNIQUE INDEX rehearsals_one_active_idx ON public.rehearsals (user_id, course) WHERE status = 'active';
ALTER TABLE public.rehearsals ENABLE ROW LEVEL SECURITY;
CREATE POLICY rehearsals_select_own ON public.rehearsals
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
CREATE POLICY rehearsals_delete_own ON public.rehearsals
  FOR DELETE TO authenticated USING ((SELECT auth.uid()) = user_id);
REVOKE ALL ON public.rehearsals FROM PUBLIC, anon, authenticated;
GRANT SELECT, DELETE ON public.rehearsals TO authenticated;
GRANT ALL ON public.rehearsals TO service_role;

CREATE TABLE public.rehearsal_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rehearsal_id uuid NOT NULL REFERENCES public.rehearsals(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  practice_call_id uuid REFERENCES public.practice_calls(id) ON DELETE SET NULL,
  stage text NOT NULL CHECK (stage IN ('warmup', 'conversation', 'hard_moments')),
  finished_at timestamptz NOT NULL DEFAULT now(),
  moments_shown text[] NOT NULL DEFAULT '{}' CHECK (public.rehearsal_text_array_ok(moments_shown)),
  went_well text[] NOT NULL DEFAULT '{}' CHECK (public.rehearsal_text_array_ok(went_well)),
  corrections text[] NOT NULL DEFAULT '{}' CHECK (public.rehearsal_text_array_ok(corrections))
);
CREATE INDEX rehearsal_runs_rehearsal_idx ON public.rehearsal_runs (rehearsal_id, finished_at);
-- A call is one run, once, so a retried recap can never write it twice.
CREATE UNIQUE INDEX rehearsal_runs_call_idx ON public.rehearsal_runs (practice_call_id)
  WHERE practice_call_id IS NOT NULL;
ALTER TABLE public.rehearsal_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY rehearsal_runs_select_own ON public.rehearsal_runs
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
REVOKE ALL ON public.rehearsal_runs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.rehearsal_runs TO authenticated;
GRANT ALL ON public.rehearsal_runs TO service_role;

CREATE TABLE public.rehearsal_free_used (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  used_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.rehearsal_free_used ENABLE ROW LEVEL SECURITY;
CREATE POLICY rehearsal_free_used_select_own ON public.rehearsal_free_used
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
REVOKE ALL ON public.rehearsal_free_used FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.rehearsal_free_used TO authenticated;
GRANT ALL ON public.rehearsal_free_used TO service_role;

-- A rehearsal's calls are recorded and starred like any other call.
ALTER TABLE public.practice_calls DROP CONSTRAINT practice_calls_kind_check;
ALTER TABLE public.practice_calls
  ADD CONSTRAINT practice_calls_kind_check CHECK (kind IN ('scenario', 'scene', 'rehearsal'));
ALTER TABLE public.practice_stars DROP CONSTRAINT practice_stars_kind_check;
ALTER TABLE public.practice_stars
  ADD CONSTRAINT practice_stars_kind_check CHECK (kind IN ('scenario', 'scene', 'rehearsal'));

-- ---------------------------------------------------------------------------------------------------------------
-- The writes. Service role only: the server checks Pro, the free rule and the blocked-term filter first.
-- ---------------------------------------------------------------------------------------------------------------

-- Creates a rehearsal. With _free the one-free-rehearsal marker is taken in the same transaction, so two requests
-- cannot both win it (the loser raises rehearsal_free_used) and a failed insert gives the marker back. A second
-- active rehearsal in the same course violates rehearsals_one_active_idx (23505).
CREATE FUNCTION public.create_rehearsal(
  _user_id uuid,
  _course text,
  _event_kind text,
  _event_date date,
  _counterpart text,
  _worries text,
  _brief jsonb,
  _free boolean
)
RETURNS public.rehearsals
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  made public.rehearsals;
  taken integer;
BEGIN
  IF _user_id IS NULL OR _free IS NULL THEN
    RAISE EXCEPTION 'create_rehearsal: missing argument' USING ERRCODE = '22023';
  END IF;
  IF _free THEN
    INSERT INTO public.rehearsal_free_used (user_id) VALUES (_user_id) ON CONFLICT (user_id) DO NOTHING;
    GET DIAGNOSTICS taken = ROW_COUNT;
    IF taken = 0 THEN
      RAISE EXCEPTION 'rehearsal_free_used' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  INSERT INTO public.rehearsals (user_id, course, event_kind, event_date, counterpart, worries, brief, free)
  VALUES (_user_id, _course, _event_kind, _event_date, _counterpart, _worries, _brief, _free)
  RETURNING * INTO made;
  RETURN made;
END;
$$;
REVOKE ALL ON FUNCTION public.create_rehearsal(uuid, text, text, date, text, text, jsonb, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_rehearsal(uuid, text, text, date, text, text, jsonb, boolean)
  TO service_role;

-- Re-answers the intake of the learner's ACTIVE rehearsal (new brief included). Course and `free` never change.
CREATE FUNCTION public.adjust_rehearsal(
  _user_id uuid,
  _id uuid,
  _event_kind text,
  _event_date date,
  _counterpart text,
  _worries text,
  _brief jsonb
)
RETURNS public.rehearsals
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  changed public.rehearsals;
BEGIN
  UPDATE public.rehearsals AS r
    SET event_kind = _event_kind, event_date = _event_date, counterpart = _counterpart,
        worries = _worries, brief = _brief
    WHERE r.id = _id AND r.user_id = _user_id AND r.status = 'active'
    RETURNING r.* INTO changed;
  IF changed.id IS NULL THEN
    RAISE EXCEPTION 'rehearsal_not_found' USING ERRCODE = 'P0002';
  END IF;
  RETURN changed;
END;
$$;
REVOKE ALL ON FUNCTION public.adjust_rehearsal(uuid, uuid, text, date, text, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.adjust_rehearsal(uuid, uuid, text, date, text, text, jsonb) TO service_role;

-- Cancels the learner's ACTIVE rehearsal. The plan and its runs stay readable; the free marker is untouched.
CREATE FUNCTION public.cancel_rehearsal(_user_id uuid, _id uuid)
RETURNS public.rehearsals
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  changed public.rehearsals;
BEGIN
  UPDATE public.rehearsals AS r
    SET status = 'cancelled', closed_at = now()
    WHERE r.id = _id AND r.user_id = _user_id AND r.status = 'active'
    RETURNING r.* INTO changed;
  IF changed.id IS NULL THEN
    RAISE EXCEPTION 'rehearsal_not_found' USING ERRCODE = 'P0002';
  END IF;
  RETURN changed;
END;
$$;
REVOKE ALL ON FUNCTION public.cancel_rehearsal(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_rehearsal(uuid, uuid) TO service_role;

-- The brief call's own AI quota kind: 5 a day and 5 a minute. These two definitions are 20261119100000's, plus it.
CREATE OR REPLACE FUNCTION public.consume_ai_quota(_kind text)
RETURNS TABLE(allowed boolean, used integer, quota integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  me uuid := auth.uid();
  new_count integer;
  daily_limit integer;
BEGIN
  daily_limit := CASE _kind
    WHEN 'chat' THEN 60
    WHEN 'stt' THEN 120
    WHEN 'tts' THEN 80
    WHEN 'translate' THEN 60
    WHEN 'define' THEN 40
    WHEN 'hector' THEN 150
    WHEN 'explain' THEN 40
    WHEN 'support' THEN 30
    WHEN 'recap' THEN 30
    WHEN 'rehearsal_brief' THEN 5
    ELSE NULL
  END;

  IF me IS NULL OR daily_limit IS NULL THEN
    RETURN QUERY SELECT false, 0, COALESCE(daily_limit, 0);
    RETURN;
  END IF;

  INSERT INTO public.ai_usage (user_id, day, kind, count)
  VALUES (me, current_date, _kind, 1)
  ON CONFLICT (user_id, day, kind) DO UPDATE
    SET count = public.ai_usage.count + 1, updated_at = now()
  RETURNING public.ai_usage.count INTO new_count;

  IF new_count > daily_limit THEN
    RETURN QUERY SELECT false, new_count, daily_limit;
  ELSE
    RETURN QUERY SELECT true, new_count, daily_limit;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_ai_quota(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.consume_ai_quota(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.consume_ai_rate_limit(_kind text)
RETURNS TABLE(allowed boolean, count integer, per_minute_limit integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  me uuid := auth.uid();
  bucket timestamptz := date_trunc('minute', now());
  new_count integer;
  minute_limit integer;
BEGIN
  minute_limit := CASE _kind
    WHEN 'chat' THEN 10
    WHEN 'stt' THEN 10
    WHEN 'tts' THEN 15
    WHEN 'translate' THEN 10
    WHEN 'define' THEN 10
    WHEN 'hector' THEN 10
    WHEN 'explain' THEN 10
    WHEN 'support' THEN 5
    WHEN 'recap' THEN 5
    WHEN 'rehearsal_brief' THEN 5
    ELSE NULL
  END;

  IF me IS NULL OR minute_limit IS NULL THEN
    RETURN QUERY SELECT false, 0, COALESCE(minute_limit, 0);
    RETURN;
  END IF;

  -- Opportunistically drop this user's stale buckets so the table stays
  -- small; indexed by (user_id, kind, minute_bucket) so this is cheap.
  DELETE FROM public.ai_rate_limits
    WHERE user_id = me AND minute_bucket < bucket - interval '5 minutes';

  INSERT INTO public.ai_rate_limits (user_id, kind, minute_bucket, count)
  VALUES (me, _kind, bucket, 1)
  ON CONFLICT (user_id, kind, minute_bucket) DO UPDATE
    SET count = public.ai_rate_limits.count + 1, updated_at = now()
  RETURNING public.ai_rate_limits.count INTO new_count;

  IF new_count > minute_limit THEN
    RETURN QUERY SELECT false, new_count, minute_limit;
  ELSE
    RETURN QUERY SELECT true, new_count, minute_limit;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_ai_rate_limit(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.consume_ai_rate_limit(text) TO authenticated, service_role;
