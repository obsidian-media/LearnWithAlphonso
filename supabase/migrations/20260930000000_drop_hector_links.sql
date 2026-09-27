-- Hector decoupling (docs/superpowers/specs/2026-09-27-hector-decoupling-design.md):
-- Hector now runs in-account via /api/hector-respond, authenticated with
-- the main Supabase account. The table that mapped an Alphonso account to
-- a separate Cloud Voice account is dead -- nothing reads or writes it
-- after this change (hector-link, hector-shadow-account, hector-revocation
-- and cloud-voice-auth are all removed, and deleteMyAccount no longer
-- touches it). Dropping it also removes the last reason account deletion
-- could leave Hector data behind: there is no longer a separate account.
DROP TABLE IF EXISTS public.hector_links;
