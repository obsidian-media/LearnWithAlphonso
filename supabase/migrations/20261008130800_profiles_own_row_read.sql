-- A signed-in user reads only their OWN profile row.
--
-- Before: profiles_read_all_auth (USING (true)) let any signed-in user read every column of every profile:
-- country, theme, created_at, updated_at, active_language, and newer columns such as name_confirmed_at.
-- A matched stranger got the buddy's id from get_my_buddy and could read that row.
--
-- After: own row only. Every cross-user read in the product already goes through a SECURITY DEFINER RPC that
-- scopes rows to a relationship and returns display_name and avatar_seed (plus country on the leaderboard):
-- get_leaderboard, get_friends_progress, get_team_members, get_friend_invite_preview, get_buddy_requests,
-- get_my_buddy. Those bypass RLS and are unchanged; src/lib/profile-exposure.test.ts pins their columns.
-- No view: a default view bypasses RLS (re-opens enumeration), a security_invoker view returns only the own row.
-- Table grants are unchanged: the own row still needs SELECT (theme, country, export, consent, name status).
--
-- Rollback (one transaction):
--   DROP POLICY profiles_select_own ON public.profiles;
--   CREATE POLICY "profiles_read_all_auth" ON public.profiles FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "profiles_read_all_auth" ON public.profiles;

CREATE POLICY profiles_select_own ON public.profiles
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = id);

COMMENT ON POLICY profiles_select_own ON public.profiles IS
  'Own row only. Other learners are read through relationship-scoped SECURITY DEFINER RPCs.';

