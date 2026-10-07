-- W7 addendum A8 (owner decision O6): existing public names that fail the new filter are reset, not left in place.
-- Display names become a fresh Learner-XXXX handle with name_confirmed_at = NULL (W6's prompt asks again); team names
-- become a random team name. Both are backed up. The counts were shown to the owner before this file was committed
-- (W7 addendum A8 Step 2) and are written into the call at the bottom as a ceiling: if more rows fail at deploy time
-- (new sign-ups since the dry run), the migration aborts instead of renaming accounts nobody approved.
-- Also: generate_learner_handle now loops until the handle itself passes the filter (coordinator follow-up from W6:
-- never 'Learner-B00B').
--
-- Rollback (one transaction):
--   ALTER TABLE public.profiles DISABLE TRIGGER enforce_display_name_filter;
--   UPDATE public.profiles p SET display_name = b.old_display_name, name_confirmed_at = p.created_at
--     FROM public.display_name_migration_backup b WHERE b.user_id = p.id AND p.display_name = b.new_display_name
--     AND b.migrated_at >= '<this migration''s apply time>';
--   ALTER TABLE public.profiles ENABLE TRIGGER enforce_display_name_filter;
--   UPDATE public.teams t SET name = b.old_name FROM public.team_name_migration_backup b WHERE b.team_id = t.id;
--   re-run generate_learner_handle from 20261008130100_display_name_onboarding.sql;
--   DROP FUNCTION public._reset_failing_public_names(integer, integer), public._safe_random_team_name();
--   DROP TABLE public.team_name_migration_backup;

CREATE OR REPLACE FUNCTION public.generate_learner_handle()
RETURNS text
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $$
DECLARE
  candidate text;
BEGIN
  FOR i IN 1..50 LOOP
    candidate := 'Learner-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 4));
    IF public.display_name_problem(candidate) IS NULL THEN
      RETURN candidate;
    END IF;
  END LOOP;
  -- 50 blocked draws in a row is not a real case; a fixed handle the probe pins as passing.
  RETURN 'Learner-0000';
END;
$$;

REVOKE ALL ON FUNCTION public.generate_learner_handle() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_learner_handle() TO service_role;

CREATE OR REPLACE FUNCTION public._safe_random_team_name()
RETURNS text
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $$
DECLARE
  candidate text;
BEGIN
  FOR i IN 1..50 LOOP
    candidate := public._random_team_name();
    IF NOT public.contains_blocked_term(candidate) THEN
      RETURN candidate;
    END IF;
  END LOOP;
  RETURN 'Steady Otters';
END;
$$;

REVOKE ALL ON FUNCTION public._safe_random_team_name() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._safe_random_team_name() TO service_role;

-- client-grants: none public.team_name_migration_backup
-- What the O6 reset changed for teams, so it can be undone. Drop after 2026-11-08 (BACKLOG, W7 A9).
CREATE TABLE public.team_name_migration_backup (
  team_id uuid PRIMARY KEY REFERENCES public.teams(id) ON DELETE CASCADE,
  old_name text NOT NULL,
  new_name text NOT NULL,
  migrated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.team_name_migration_backup ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.team_name_migration_backup FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.team_name_migration_backup TO service_role;

CREATE OR REPLACE FUNCTION public._reset_failing_public_names(_approved_names integer, _approved_teams integer)
RETURNS TABLE(names_reset integer, teams_reset integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n_names integer;
  n_teams integer;
BEGIN
  SELECT count(*) INTO n_names FROM public.profiles p WHERE public.display_name_problem(p.display_name) IS NOT NULL;
  SELECT count(*) INTO n_teams FROM public.teams t
  WHERE public.moderation_clean_text(t.name) IS NULL OR char_length(public.moderation_clean_text(t.name)) > 40
     OR public.contains_blocked_term(public.moderation_clean_text(t.name));
  RAISE NOTICE 'O6 reset: % display names, % team names fail the filter (approved % and %)',
    n_names, n_teams, _approved_names, _approved_teams;
  IF n_names > coalesce(_approved_names, 0) OR n_teams > coalesce(_approved_teams, 0) THEN
    RAISE EXCEPTION 'o6-reset-not-approved: % names and % team names fail the filter; the owner approved % and %. Re-run W7 addendum A8 Step 2.',
      n_names, n_teams, _approved_names, _approved_teams USING ERRCODE = 'P0001';
  END IF;

  WITH targets AS (
    SELECT p.id, p.display_name AS old_name, public.generate_learner_handle() AS new_name
    FROM public.profiles p WHERE public.display_name_problem(p.display_name) IS NOT NULL
  ), saved AS (
    INSERT INTO public.display_name_migration_backup (user_id, old_display_name, new_display_name)
    SELECT id, old_name, new_name FROM targets
    ON CONFLICT (user_id) DO UPDATE
      SET new_display_name = excluded.new_display_name, migrated_at = now() -- keep the ORIGINAL old name
    RETURNING user_id, new_display_name
  )
  UPDATE public.profiles p
  SET display_name = s.new_display_name, name_confirmed_at = NULL
  FROM saved s WHERE p.id = s.user_id;

  WITH targets AS (
    SELECT t.id, t.name AS old_name, public._safe_random_team_name() AS new_name
    FROM public.teams t
    WHERE public.moderation_clean_text(t.name) IS NULL OR char_length(public.moderation_clean_text(t.name)) > 40
       OR public.contains_blocked_term(public.moderation_clean_text(t.name))
  ), saved AS (
    INSERT INTO public.team_name_migration_backup (team_id, old_name, new_name)
    SELECT id, old_name, new_name FROM targets
    ON CONFLICT (team_id) DO UPDATE SET new_name = excluded.new_name, migrated_at = now()
    RETURNING team_id, new_name
  )
  UPDATE public.teams t SET name = s.new_name FROM saved s WHERE t.id = s.team_id;

  RETURN QUERY SELECT n_names, n_teams;
END;
$$;

REVOKE ALL ON FUNCTION public._reset_failing_public_names(integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._reset_failing_public_names(integer, integer) TO service_role;

-- Owner-approved counts from the A8 Step 2 dry run: 0 display names, 0 team names (owner OK 2026-10-07).
SELECT * FROM public._reset_failing_public_names(0, 0);

