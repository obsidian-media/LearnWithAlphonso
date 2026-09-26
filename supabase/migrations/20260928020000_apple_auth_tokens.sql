-- Apple Sign in with Apple refresh tokens, stored so account deletion can
-- revoke the grant -- which Apple requires of any app offering Sign in with
-- Apple, and checks.
--
-- WHY A TABLE AND NOT THE CLIENT. The app receives a one-time authorization
-- code at sign-in. It is single-use, expires in five minutes, and the app's
-- copy does not survive relaunch -- so "sign in with Apple, quit, come back
-- tomorrow, delete account" would leave nothing to revoke with. The server
-- exchanges that code for a refresh token once and keeps it here.
--
-- VERSIONING: deliberately above 20260928010000_admin_users.sql, the current
-- latest. Wall-clock "now" when this was written was 2026-09-25, which sorts
-- BELOW several existing migrations because 20260926030000 was itself
-- renumbered forward out of a collision. A real timestamp guarantees
-- uniqueness, not dependency order -- see src/lib/migration-order.test.ts.
CREATE TABLE public.apple_auth_tokens (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  refresh_token text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- The same posture as admin_users: RLS on with ZERO policies, so only
-- service_role (which bypasses RLS) can read or write it. A refresh token a
-- client can read is a credential the client can exfiltrate, and this one
-- authorises Apple identity operations for the whole app. There is
-- deliberately no "own row" policy -- the app never needs to read this back,
-- it only ever posts a fresh authorization code.
ALTER TABLE public.apple_auth_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.apple_auth_tokens FROM anon, authenticated;
GRANT ALL ON public.apple_auth_tokens TO service_role;

COMMENT ON TABLE public.apple_auth_tokens IS
  'Apple refresh tokens for Sign in with Apple revocation on account deletion. service_role only -- RLS enabled with no policies by design.';
