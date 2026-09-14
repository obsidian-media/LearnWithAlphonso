-- accept_friend_invite and get_friends_progress were the only two
-- SECURITY DEFINER functions in this project that skipped the
-- "REVOKE ALL ... FROM PUBLIC, anon" step every other one uses (see
-- get_leaderboard, consume_ai_quota, consume_ai_rate_limit). Both happen
-- to fail closed on their own (auth.uid() IS NULL checks), so this isn't
-- an active anon-exploitable gap, but a newly created Postgres function
-- grants EXECUTE to PUBLIC by default, and this closes that explicitly
-- rather than relying solely on the function body's own guard.

REVOKE ALL ON FUNCTION public.accept_friend_invite(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_friends_progress() FROM PUBLIC, anon;
