-- In-app Help chat, milestone 6: telling the learner when a person replies, the owner's new-ticket digest, and how long
-- support chats are kept.
--
--   support_notify_queue   one row per "tell the learner" job. A trigger on support_messages queues a row when a PERSON
--                          (author_kind 'staff') writes, unless a job for that conversation is still waiting or was
--                          delivered in the last 30 minutes (so a burst of replies is one notice). The AI, the learner
--                          and system lines never queue. The row holds ids and times only: never a message, a name or
--                          an address. The web app route /api/internal/support-notify reads the learner's address and
--                          the staff member's first name itself, sends the email and the push, and stamps the row; the
--                          15-minute sweep retries rows that were not delivered after 10 minutes and gives up after
--                          24 hours (gave_up_at).
--   support_digest_seen    the conversations the owner has already been told about ("N new tickets", no learner text),
--                          so each hand-off is counted once.
--   support_purge_old()    retention: a solved conversation is deleted 12 months after it was solved (its messages,
--                          notes, queue rows and digest rows follow by ON DELETE CASCADE). Conversations that are not
--                          solved are never deleted by it. The action record (staff_audit_log) keeps ids and status
--                          changes only, never message text, and is not touched. Run by run_maintenance_sweep.
--
-- The trigger posts to the web app through pg_net with the same Vault shared secret as the report notification
-- (report_notify_secret); without it nothing is posted and the sweep delivers the row later. Any failure inside the
-- trigger is a WARNING: a staff reply is never lost or refused because a notice could not be queued or sent.
--
-- Grants (memory: pg_net's default grants cannot be revoked by a migration, and new tables start with no client
-- privileges): the three tables are server-only, RLS on with no policy, client roles revoked, service_role only.
--
-- Depends on 20261117100000 (support tables and the append-only trigger, which allows DELETE under
-- lwa.support_retention = 'on') and 20261105101100 (run_maintenance_sweep, latest body).
--
-- Rollback (one transaction):
--   DROP TRIGGER support_messages_notify ON public.support_messages;
--   DROP FUNCTION public.support_queue_staff_reply(), public.support_purge_old();
--   DROP TABLE public.support_digest_seen, public.support_notify_queue;
--   then re-run run_maintenance_sweep from 20261105101100.

-- client-grants: none public.support_notify_queue
CREATE TABLE public.support_notify_queue (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES public.support_conversations(id) ON DELETE CASCADE,
  message_id bigint NOT NULL REFERENCES public.support_messages(id) ON DELETE CASCADE,
  queued_at timestamptz NOT NULL DEFAULT now(),
  email_sent_at timestamptz,
  push_sent_at timestamptz,
  delivered_at timestamptz,
  gave_up_at timestamptz,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_attempt_at timestamptz
);
CREATE INDEX support_notify_queue_pending ON public.support_notify_queue (queued_at)
  WHERE delivered_at IS NULL AND gave_up_at IS NULL;
CREATE INDEX support_notify_queue_conversation ON public.support_notify_queue (conversation_id, queued_at DESC);
CREATE INDEX support_notify_queue_email_sent ON public.support_notify_queue (email_sent_at)
  WHERE email_sent_at IS NOT NULL;

-- client-grants: none public.support_digest_seen
CREATE TABLE public.support_digest_seen (
  conversation_id uuid PRIMARY KEY REFERENCES public.support_conversations(id) ON DELETE CASCADE,
  seen_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.support_notify_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_digest_seen ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.support_notify_queue, public.support_digest_seen FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.support_notify_queue, public.support_digest_seen TO service_role;

-- ---- queue a notice when a person replies ----
CREATE FUNCTION public.support_queue_staff_reply() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  queue_id bigint;
  secret text;
BEGIN
  -- One notice per burst: skip while a job for this conversation is waiting (not delivered, not given up) or was
  -- delivered within the last 30 minutes.
  IF EXISTS (
    SELECT 1 FROM public.support_notify_queue q
     WHERE q.conversation_id = NEW.conversation_id
       AND ((q.delivered_at IS NULL AND q.gave_up_at IS NULL)
            OR q.delivered_at > now() - interval '30 minutes')
  ) THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.support_notify_queue (conversation_id, message_id)
  VALUES (NEW.conversation_id, NEW.id)
  RETURNING id INTO queue_id;

  -- The row is queued before the call, in its own block below, so a failed call leaves the row for the sweep to retry.
  BEGIN
    SELECT decrypted_secret INTO secret FROM vault.decrypted_secrets WHERE name = 'report_notify_secret';
    IF secret IS NOT NULL THEN
      PERFORM net.http_post(
        url := 'https://learn.alphonsoecosystem.app/api/internal/support-notify',
        headers := jsonb_build_object('Content-Type', 'application/json', 'X-Report-Notify-Secret', secret),
        body := jsonb_build_object('queueId', queue_id),
        timeout_milliseconds := 10000
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'support_queue_staff_reply could not call the web app for message %: % %', NEW.id, SQLSTATE, SQLERRM;
  END;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'support_queue_staff_reply failed for message %: % %', NEW.id, SQLSTATE, SQLERRM;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.support_queue_staff_reply() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER support_messages_notify
  AFTER INSERT ON public.support_messages
  FOR EACH ROW WHEN (NEW.author_kind = 'staff')
  EXECUTE FUNCTION public.support_queue_staff_reply();

-- ---- retention ----
-- A solved conversation goes 12 months after it was solved. Returns how many conversations were deleted. The setting
-- lets the append-only trigger on support_messages allow the cascade it causes; it is local to this transaction. The
-- cut-off is 12 calendar months back in UTC, so the session's time zone cannot move it.
CREATE FUNCTION public.support_purge_old() RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  removed integer;
BEGIN
  PERFORM set_config('lwa.support_retention', 'on', true);
  DELETE FROM public.support_conversations
   WHERE status = 'solved' AND solved_at IS NOT NULL
     AND solved_at < ((now() AT TIME ZONE 'UTC' - interval '12 months') AT TIME ZONE 'UTC');
  GET DIAGNOSTICS removed = ROW_COUNT;
  PERFORM set_config('lwa.support_retention', 'off', true);
  RETURN removed;
END;
$$;
REVOKE ALL ON FUNCTION public.support_purge_old() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.support_purge_old() TO service_role;

-- ---- the sweep: everything it did before, plus the retention call ----
CREATE OR REPLACE FUNCTION public.run_maintenance_sweep() RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  secret text;
BEGIN
  -- A receipt only matters while the app may still retry that grade; the app's queue is long gone after 30 days.
  DELETE FROM public.review_grade_attempts WHERE created_at < now() - interval '30 days';
  -- Retention: see 20261105100600's header.
  DELETE FROM public.ai_usage WHERE day < current_date - 90;
  DELETE FROM public.nudges WHERE created_at < now() - interval '90 days';
  DELETE FROM public.friend_activity_events
   WHERE event_type <> 'league_promotion' AND created_at < now() - interval '180 days';
  DELETE FROM public.podcast_play_events WHERE started_at < now() - interval '400 days';
  -- Reports kept after an account was deleted: 90 days from that deletion (20261105101100).
  DELETE FROM public.content_reports WHERE account_deleted_at < now() - interval '90 days';

  -- Support chats: solved conversations go 12 months after they were solved (this file). Its own block, so a failure
  -- here cannot undo the pruning above or stop the call to the web app below.
  BEGIN
    PERFORM public.support_purge_old();
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'run_maintenance_sweep could not purge old support chats: % %', SQLSTATE, SQLERRM;
  END;

  -- Its own block: a failure to reach the web app must not undo the pruning above.
  BEGIN
    SELECT decrypted_secret INTO secret FROM vault.decrypted_secrets WHERE name = 'report_notify_secret';
    IF secret IS NULL THEN
      RETURN;
    END IF;
    PERFORM net.http_post(
      url := 'https://learn.alphonsoecosystem.app/api/internal/maintenance',
      headers := jsonb_build_object('Content-Type', 'application/json', 'X-Report-Notify-Secret', secret),
      body := '{}'::jsonb,
      timeout_milliseconds := 30000
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'run_maintenance_sweep could not call the web app: % %', SQLSTATE, SQLERRM;
  END;
END;
$$;
REVOKE ALL ON FUNCTION public.run_maintenance_sweep() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_maintenance_sweep() TO service_role;
