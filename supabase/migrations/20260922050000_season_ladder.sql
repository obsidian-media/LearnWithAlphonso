-- Season ladder -- V4 candidate #7 (deeper gamification, docs/
-- superpowers/specs/2026-09-22-deeper-gamification-design.md).
-- Weekly promotion/demotion cohorts, resolved by the get-season-status
-- Edge Function (not raw SQL -- the ranking/promotion math is complex
-- enough to want real unit tests, which PL/pgSQL can't give us).
CREATE TABLE public.season_cohorts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  division integer NOT NULL CHECK (division BETWEEN 1 AND 5),
  week_start date NOT NULL,
  resolved_at timestamptz
);
GRANT ALL ON public.season_cohorts TO service_role;
ALTER TABLE public.season_cohorts ENABLE ROW LEVEL SECURITY;
-- No client policy -- only the Edge Function (service_role) touches
-- this table directly; clients only ever see it through the Edge
-- Function's response.

CREATE TABLE public.season_cohort_members (
  cohort_id uuid NOT NULL REFERENCES public.season_cohorts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  PRIMARY KEY (cohort_id, user_id)
);
GRANT ALL ON public.season_cohort_members TO service_role;
ALTER TABLE public.season_cohort_members ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.season_placements (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  division integer NOT NULL,
  rank_in_cohort integer NOT NULL,
  cohort_size integer NOT NULL,
  PRIMARY KEY (user_id, week_start)
);
GRANT ALL ON public.season_placements TO service_role;
ALTER TABLE public.season_placements ENABLE ROW LEVEL SECURITY;

-- Batched weekly-XP fetch for a whole cohort in one round trip (up to
-- 30 members) instead of the Edge Function calling weekly_xp once per
-- member.
CREATE OR REPLACE FUNCTION public.get_cohort_weekly_xp(_cohort_id uuid, _week_start date)
RETURNS TABLE(user_id uuid, xp integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT scm.user_id, public.weekly_xp(scm.user_id, _week_start)
  FROM public.season_cohort_members scm
  WHERE scm.cohort_id = _cohort_id;
$$;
REVOKE ALL ON FUNCTION public.get_cohort_weekly_xp(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_cohort_weekly_xp(uuid, date) TO service_role;
