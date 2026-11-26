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
