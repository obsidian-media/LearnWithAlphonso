-- Hector re-parenting, Phase 0 (docs/superpowers/specs/2026-09-26-hector-reparenting-design.md):
-- maps this app's account to the separate Cloud Voice account Hector
-- uses (AlphonsoEcosystem, a different Supabase project entirely --
-- see AppConfig.cloudVoiceSupabaseURL), so account deletion can reach
-- and revoke it. Before this table existed, nothing recorded which
-- Cloud Voice account belonged to which main account, so deletion
-- structurally could not reach Hector no matter what it tried.
--
-- Same posture as apple_auth_tokens: it maps one identity to another,
-- which is exactly the kind of thing a client should never be able to
-- read back and enumerate. RLS on with ZERO policies -- only
-- service_role (which bypasses RLS) can read or write it. The app
-- never needs to read this back either; it only ever posts a link
-- once, right after Hector enrollment succeeds.
-- UNIQUE on cloud_voice_user_id: two main accounts must never map to the
-- same Cloud Voice account -- if they somehow did, deleting one would
-- revoke Hector access the other account is still actively using.
CREATE TABLE public.hector_links (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  cloud_voice_user_id uuid NOT NULL UNIQUE,
  linked_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.hector_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hector_links FROM anon, authenticated;
GRANT ALL ON public.hector_links TO service_role;

COMMENT ON TABLE public.hector_links IS
  'Maps this account to its Cloud Voice (Hector) account in a separate Supabase project, so account deletion can revoke it. service_role only -- RLS enabled with no policies by design.';
