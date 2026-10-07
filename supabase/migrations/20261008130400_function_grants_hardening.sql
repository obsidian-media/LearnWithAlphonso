-- W7 / L8: the last two security-advisor lints on functions.
--   function_search_path_mutable: _random_team_name (blocked_moderation_terms is fixed in 20261008130000).
--   anon_security_definer_function_executable: notify_nudge_push (a trigger function; it never needs EXECUTE for
--     the trigger to fire: Postgres checks EXECUTE on a trigger function only at CREATE TRIGGER time).
-- _random_team_name is only called by auto_join_team, which is SECURITY DEFINER, so clients lose nothing.
-- Rollback:
--   ALTER FUNCTION public._random_team_name() RESET search_path;
--   GRANT EXECUTE ON FUNCTION public._random_team_name(), public.notify_nudge_push() TO PUBLIC;

ALTER FUNCTION public._random_team_name() SET search_path = '';
REVOKE ALL ON FUNCTION public._random_team_name() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._random_team_name() TO service_role;

REVOKE ALL ON FUNCTION public.notify_nudge_push() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_nudge_push() TO service_role;
