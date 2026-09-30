-- Android device tokens (docs/superpowers/specs/2026-09-29-android-app-design.md
-- section 8). 20260921030000_remote_push_notifications.sql created
-- device_tokens with `platform text NOT NULL DEFAULT 'ios' CHECK (platform
-- IN ('ios'))`, so an Android client registering its FCM token would fail
-- the CHECK. Widened to both platforms; the send path
-- (supabase/functions/_shared/apns.ts sendPushToUser) now selects
-- `platform` and fans out iOS rows to APNs and Android rows to FCM
-- (supabase/functions/_shared/fcm.ts), each no-oping until its own secrets
-- exist.
--
-- Additive only: the default stays 'ios' so the existing iOS client, which
-- sends platform explicitly anyway, is unaffected, and no row changes.
--
-- VERSIONING: 20260930170000 sorts after every migration on main as of
-- 2026-09-30 (the last is 20260930160000), and the table it alters exists
-- since 20260921030000.

ALTER TABLE public.device_tokens DROP CONSTRAINT IF EXISTS device_tokens_platform_check;
ALTER TABLE public.device_tokens
  ADD CONSTRAINT device_tokens_platform_check CHECK (platform IN ('ios', 'android'));
