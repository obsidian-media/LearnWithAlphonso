-- Whole-codebase audit finding (2026-09-29): 20260920020000_nudges.sql
-- deliberately shipped with no server-side rate limit -- correct at the
-- time, since a nudge only produced an in-app polling banner, and the
-- client's own soft cooldown (NudgeCooldownCache.swift, 24h) was a
-- reasonable-enough backstop for that low-stakes case.
--
-- 20260921030000_remote_push_notifications.sql's nudges_push_after_insert
-- trigger changed what a nudge actually does -- it now fires a REAL APNs
-- push unconditionally on every insert -- without anyone revisiting
-- whether "client-side cooldown only" was still the right call once the
-- blast radius went from "a banner next time they open the app" to
-- "their lock screen, right now." It wasn't: nudges_insert_to_friend's
-- RLS policy only checks that sender/recipient are accepted friends, not
-- rate -- any accepted friend could bypass the client's cooldown button
-- entirely (a modified client, or a direct PostgREST insert with a valid
-- token) and spam a real person's lock screen indefinitely. That is a
-- real harassment vector between real users, not a theoretical one.
--
-- Fixed at the one place that actually matters -- the push trigger, not
-- the insert policy -- so the underlying row/notification-badge behavior
-- is unchanged; only redundant real pushes within the client's own
-- cooldown window are suppressed. Mirrors NudgeCooldownCache's 24h
-- exactly, so server and client agree on what "too soon" means.
CREATE OR REPLACE FUNCTION public.notify_nudge_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  service_key text;
  recent_push_exists boolean;
BEGIN
  -- Same cooldown as NudgeCooldownCache.swift (24h) -- checked against
  -- every OTHER nudge this sender has sent this recipient, not just ones
  -- that reached this trigger successfully, so a client that skips its
  -- own cooldown (or calls PostgREST directly) still can't force a
  -- second real push inside the window.
  SELECT EXISTS (
    SELECT 1 FROM public.nudges n
    WHERE n.sender_id = NEW.sender_id
      AND n.recipient_id = NEW.recipient_id
      AND n.id <> NEW.id
      AND n.created_at > now() - interval '24 hours'
  ) INTO recent_push_exists;

  IF recent_push_exists THEN
    RETURN NEW;
  END IF;

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
