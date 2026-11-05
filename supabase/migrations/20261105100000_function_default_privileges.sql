-- New functions and sequences start closed to the client roles, as new tables have since 20261006120000.
--
-- Until now every function created in `public` was executable by PUBLIC, `anon` and `authenticated` unless its
-- migration revoked that, so a forgotten REVOKE made a server-only SECURITY DEFINER helper callable through
-- /rest/v1/rpc. From this migration on:
--   - functions the `postgres` role creates get no EXECUTE for PUBLIC (a global default; PUBLIC's EXECUTE on
--     functions is built into Postgres, so it can only be removed without IN SCHEMA), and none for `anon` or
--     `authenticated` in `public`;
--   - sequences the `postgres` role creates in `public` get no privileges for `anon` or `authenticated`.
-- Existing functions and sequences keep their current privileges (default privileges apply to new objects only).
-- A migration that adds a client RPC must GRANT EXECUTE to `authenticated` explicitly; the CI guard
-- (src/lib/migration-grants.ts, checkNewFunctionGrants) requires every later migration to state it either way.
-- Trigger functions need no EXECUTE for the inserting role; a helper called inside an RLS policy does.
--
-- Also: get_cohort_weekly_xp (20260922050000) revoked PUBLIC and anon but not `authenticated`, so any signed-in
-- user could read a cohort's weekly XP by id. Only the get-season-status Edge Function (service role) calls it.
--
-- Rollback:
--   ALTER DEFAULT PRIVILEGES FOR ROLE postgres GRANT EXECUTE ON FUNCTIONS TO PUBLIC;
--   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated;
--   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated;
--   GRANT EXECUTE ON FUNCTION public.get_cohort_weekly_xp(uuid, date) TO authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon, authenticated;

REVOKE ALL ON FUNCTION public.get_cohort_weekly_xp(uuid, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_cohort_weekly_xp(uuid, date) TO service_role;
