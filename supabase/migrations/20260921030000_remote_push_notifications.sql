-- Real (remote APNs) push notifications -- V4 candidate #2
-- (docs/BACKLOG.md sec 2.1). Additive to the already-shipped LOCAL
-- notification system (NotificationScheduler.swift/NotificationLogic.swift)
-- -- this migration has nothing to do with that; it exists purely to let
-- the server reach a specific device via Apple Push Notification service.
-- See docs/superpowers/specs/2026-09-21-remote-push-notifications-design.md
-- for the full design and the explicit, unresolved external blocker (no
-- APNs Auth Key exists yet -- this table and everything built on top of
-- it can't be tested end-to-end until a human creates one at
-- developer.apple.com).

-- pg_net is available on this project but not enabled yet (verified via
-- list_extensions before writing this migration, not assumed) -- needed
-- for the trigger below to call out to the send-push Edge Function
-- asynchronously (a trigger blocking on a synchronous HTTP call would be
-- a real production hazard for something as high-frequency as a nudge
-- insert).
CREATE EXTENSION IF NOT EXISTS pg_net;

-- One row per (user, device) -- a user with two phones gets two rows,
-- both receive a push. `token` is the raw APNs device token (hex string
-- from didRegisterForRemoteNotificationsWithDeviceToken). Unique on
-- (user_id, token) rather than token alone -- a shared physical device
-- with two different accounts signed in over its lifetime each get their
-- own row instead of needing cross-user reassignment logic (a real edge
-- case, deliberately left out of this slice -- see the design doc's
-- "Left out" section). No explicit revocation column -- APNs itself
-- reports a dead token via a 400/410 response, which the send path
-- (supabase/functions/_shared/apns.ts) prunes reactively; there's also no
-- client-side "delete my token on sign-out" call wired up yet (same doc,
-- same section) -- a stale token just lingers until its first failed
-- send.
CREATE TABLE public.device_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  token text NOT NULL,
  platform text NOT NULL DEFAULT 'ios' CHECK (platform IN ('ios')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, token)
);

CREATE INDEX device_tokens_user_id_idx ON public.device_tokens (user_id);

ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.device_tokens TO authenticated;
GRANT ALL ON public.device_tokens TO service_role;
REVOKE ALL ON public.device_tokens FROM PUBLIC, anon;

-- Own-row only, same auth.uid()-scoped pattern as every other table this
-- project uses (nudges, duels, friend_activity_events). The send path
-- itself always reads via the service_role admin client (RLS bypassed),
-- never on behalf of the recipient, so there's no "read a friend's
-- tokens" policy needed here at all.
CREATE POLICY "device_tokens_select_own" ON public.device_tokens
  FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);

CREATE POLICY "device_tokens_insert_own" ON public.device_tokens
  FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "device_tokens_update_own" ON public.device_tokens
  FOR UPDATE TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "device_tokens_delete_own" ON public.device_tokens
  FOR DELETE TO authenticated
  USING ((select auth.uid()) = user_id);

-- ---------- Nudge-a-friend: real push delivery ----------
-- A Database Webhook (Supabase's own convenience wrapper around a plain
-- pg_net trigger -- see the design doc's "Server-side trigger mechanism"
-- section for why this, not pg_cron, is the right tool for an
-- event-driven send). Fires asynchronously on every nudge insert; never
-- blocks or fails the insert itself, whether or not push is actually
-- configured yet.
CREATE OR REPLACE FUNCTION public.notify_nudge_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  service_key text;
BEGIN
  -- Not set until a human runs, once, against the real project:
  --   select vault.create_secret('<the real service_role key>', 'push_trigger_service_key');
  -- Deliberately not done inside this migration -- a real secret value
  -- has no business being typed into a git-committed file. Until it's
  -- set, this is a silent no-op (same "unconfigured -> do nothing"
  -- contract as everywhere else in this feature).
  SELECT decrypted_secret INTO service_key
    FROM vault.decrypted_secrets WHERE name = 'push_trigger_service_key';
  IF service_key IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := 'https://qhcjpfbxfcltjbiuknyt.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_key
    ),
    body := jsonb_build_object(
      'userId', NEW.recipient_id,
      'title', 'You''ve been nudged!',
      'body', 'A friend nudged you to keep your streak going.',
      'data', jsonb_build_object('type', 'nudge', 'senderId', NEW.sender_id)
    ),
    timeout_milliseconds := 5000
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- A push-delivery hiccup (network blip, misconfigured secret, APNs
  -- outage) must never break the nudge insert itself.
  RETURN NEW;
END;
$$;

CREATE TRIGGER nudges_push_after_insert
  AFTER INSERT ON public.nudges
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_nudge_push();

-- Leaderboard "you've been overtaken" push delivery is NOT a database
-- trigger -- it's computed inside complete-lesson/index.ts (the one place
-- that already knows a user's XP just changed) and calls
-- supabase/functions/_shared/apns.ts in-process. Nothing to add here.
