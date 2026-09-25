-- The podcast admin allowlist (Phase 4, see
-- docs/superpowers/specs/2026-09-25-podcast-phase4-admin-design.md).
--
-- RLS is enabled with ZERO policies, deliberately. A table with RLS on
-- and no policy is readable by nobody except service_role, which bypasses
-- RLS. That is the point: an allowlist the guarded application can read
-- is an allowlist an attacker can enumerate, and one it can write is not
-- an allowlist at all.
--
-- The first row is inserted BY HAND in the Supabase SQL editor. There is
-- deliberately no bootstrap endpoint, no seed, and no environment
-- variable naming an email: every self-bootstrapping admin mechanism is
-- an authentication bypass waiting for a misconfiguration.
--
--   INSERT INTO public.admin_users (user_id, note)
--   SELECT id, 'account owner' FROM auth.users WHERE email = '<owner>';
--
-- Versioned above 20260927230000 (transcripts) because wall-clock "now"
-- does not sort correctly here: the podcast library migration was
-- renumbered forward out of a version collision, so this file series runs
-- ahead of the calendar.
CREATE TABLE public.admin_users (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  added_at timestamptz NOT NULL DEFAULT now(),
  added_by uuid REFERENCES auth.users(id),
  note text
);

ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

-- Belt and braces. RLS with no policies already denies anon/authenticated,
-- but a future migration that adds a permissive policy for some other
-- reason would silently open the table; without the grant it still cannot
-- be read. Two independent things must go wrong instead of one.
REVOKE ALL ON public.admin_users FROM anon, authenticated;
GRANT ALL ON public.admin_users TO service_role;
