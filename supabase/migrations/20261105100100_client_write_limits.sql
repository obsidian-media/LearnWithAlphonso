-- Bounds on what a signed-in client can write, so no single account can fill the database or flood another user.
--
-- weakness_events: only the server writes it (analyze-weaknesses and completeLessonRemote use the service role),
--   so the client INSERT privilege and its policy go. Categories are short taxonomy labels: at most 64 characters.
-- device_tokens: every app registers through claim_device_token (20261012400000) and removes its own row with
--   DELETE, so direct INSERT and UPDATE go. A token is at most 4096 characters, and an iOS token is the hex APNs
--   device token (64 to 200 hex characters, the same rule as supabase/functions/_shared/apns-token.ts). Rows that
--   could never receive a push are removed first.
-- nudges: a client sends only the recipient (sender_id defaults to auth.uid(), created_at to now()), and the
--   recipient only marks a nudge read. Column grants make that the whole surface, so the 24-hour push cooldown in
--   notify_nudge_push always counts real server timestamps. At most 20 nudges per sender per hour.
-- content_reports: at most 20 reports per reporter per hour (the e-mail alert was already throttled; the row was not).
-- podcast_play_events: at most 120 play events per listener per hour; extra events are dropped silently, since
--   they are analytics and the player must not show an error.
--
-- Depends on 20260921000000 (weakness_events), 20260921030000 / 20261012400000 (device_tokens), 20260920020000 /
-- 20260930070000 (nudges), 20260928020000 / 20261008130300 (content_reports), 20260926030000 (podcast_play_events),
-- and 20261105100000 (function defaults).
--
-- Rollback:
--   DROP TRIGGER limit_client_rows ON public.nudges; DROP TRIGGER limit_client_rows ON public.content_reports;
--   DROP TRIGGER limit_client_rows ON public.podcast_play_events; DROP FUNCTION public._limit_client_rows();
--   DROP INDEX public.nudges_sender_created_idx; DROP INDEX public.podcast_play_events_user_started_idx;
--   ALTER TABLE public.weakness_events DROP CONSTRAINT weakness_events_category_len;
--   ALTER TABLE public.device_tokens DROP CONSTRAINT device_tokens_token_len, DROP CONSTRAINT device_tokens_apns_hex;
--   GRANT INSERT ON public.weakness_events TO authenticated;
--   CREATE POLICY weakness_events_insert_own ON public.weakness_events FOR INSERT WITH CHECK (auth.uid() = user_id);
--   GRANT INSERT, UPDATE ON public.device_tokens TO authenticated; (and recreate device_tokens_insert_own / _update_own)
--   GRANT INSERT, UPDATE ON public.nudges TO authenticated;

-- ---------- weakness_events ----------
REVOKE INSERT ON public.weakness_events FROM authenticated;
DROP POLICY IF EXISTS weakness_events_insert_own ON public.weakness_events;
UPDATE public.weakness_events SET category = left(category, 64) WHERE char_length(category) > 64;
ALTER TABLE public.weakness_events
  ADD CONSTRAINT weakness_events_category_len CHECK (char_length(category) BETWEEN 1 AND 64);

-- ---------- device_tokens ----------
REVOKE INSERT, UPDATE ON public.device_tokens FROM authenticated;
DROP POLICY IF EXISTS "device_tokens_insert_own" ON public.device_tokens;
DROP POLICY IF EXISTS "device_tokens_update_own" ON public.device_tokens;
DELETE FROM public.device_tokens
 WHERE char_length(token) NOT BETWEEN 1 AND 4096
    OR (platform = 'ios' AND token !~ '^[0-9A-Fa-f]{64,200}$');
ALTER TABLE public.device_tokens
  ADD CONSTRAINT device_tokens_token_len CHECK (char_length(token) BETWEEN 1 AND 4096),
  ADD CONSTRAINT device_tokens_apns_hex CHECK (platform <> 'ios' OR token ~ '^[0-9A-Fa-f]{64,200}$');

-- ---------- nudges ----------
REVOKE INSERT, UPDATE ON public.nudges FROM authenticated;
GRANT INSERT (sender_id, recipient_id) ON public.nudges TO authenticated;
GRANT UPDATE (read_at) ON public.nudges TO authenticated;
CREATE INDEX IF NOT EXISTS nudges_sender_created_idx ON public.nudges (sender_id, created_at);

-- ---------- per-account hourly caps ----------
CREATE INDEX IF NOT EXISTS podcast_play_events_user_started_idx
  ON public.podcast_play_events (user_id, started_at);

CREATE OR REPLACE FUNCTION public._limit_client_rows()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  recent integer;
BEGIN
  IF TG_TABLE_NAME = 'nudges' THEN
    SELECT count(*) INTO recent FROM public.nudges n
     WHERE n.sender_id = NEW.sender_id AND n.created_at > now() - interval '1 hour';
    IF recent >= 20 THEN
      RAISE EXCEPTION 'rate-limited' USING ERRCODE = 'P0001';
    END IF;
  ELSIF TG_TABLE_NAME = 'content_reports' THEN
    SELECT count(*) INTO recent FROM public.content_reports r
     WHERE r.reporter = NEW.reporter AND r.created_at > now() - interval '1 hour';
    IF recent >= 20 THEN
      RAISE EXCEPTION 'rate-limited' USING ERRCODE = 'P0001';
    END IF;
  ELSIF TG_TABLE_NAME = 'podcast_play_events' THEN
    SELECT count(*) INTO recent FROM public.podcast_play_events e
     WHERE e.user_id = NEW.user_id AND e.started_at > now() - interval '1 hour';
    IF recent >= 120 THEN
      RETURN NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public._limit_client_rows() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS limit_client_rows ON public.nudges;
CREATE TRIGGER limit_client_rows BEFORE INSERT ON public.nudges
  FOR EACH ROW EXECUTE FUNCTION public._limit_client_rows();
DROP TRIGGER IF EXISTS limit_client_rows ON public.content_reports;
CREATE TRIGGER limit_client_rows BEFORE INSERT ON public.content_reports
  FOR EACH ROW EXECUTE FUNCTION public._limit_client_rows();
DROP TRIGGER IF EXISTS limit_client_rows ON public.podcast_play_events;
CREATE TRIGGER limit_client_rows BEFORE INSERT ON public.podcast_play_events
  FOR EACH ROW EXECUTE FUNCTION public._limit_client_rows();
