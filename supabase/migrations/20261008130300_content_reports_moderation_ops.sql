-- Report kinds, structured context, and an email to the owner per report.
--
-- kind: 'user' (a person), 'team_name' (a team's name; context.team_id names the team; reported is the team's
-- creator), 'ai_response' ("Report this response" on an AI reply: no reported user; context carries source, course and the
-- AI message). Legacy iOS team-name reports encoded the team in reason as 'team_name:<uuid>:<reason>'; they are
-- tagged below, and the admin app still parses the prefix for rows written by old builds after this migration.
--
-- notify_content_report: AFTER INSERT, posts the report to the Vercel route /api/internal/report-notify through
-- pg_net (same mechanism as notify_nudge_push), authenticated by a shared secret read from Vault. Without the
-- Vault secret it does nothing (the owner creates it). At most 10 notifications per reporter per hour.
-- Any failure is a WARNING: a report is never lost because email is down.
--
-- Rollback (one transaction):
--   DROP TRIGGER notify_content_report ON public.content_reports; DROP FUNCTION public.notify_content_report();
--   DELETE FROM public.content_reports WHERE kind = 'ai_response';
--   ALTER TABLE public.content_reports DROP CONSTRAINT content_reports_reported_by_kind_chk,
--     DROP CONSTRAINT content_reports_context_chk, DROP CONSTRAINT content_reports_kind_chk;
--   ALTER TABLE public.content_reports ALTER COLUMN reported SET NOT NULL;
--   DROP INDEX public.content_reports_reporter_created_idx;
--   ALTER TABLE public.content_reports DROP COLUMN context, DROP COLUMN kind;

ALTER TABLE public.content_reports ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'user';
ALTER TABLE public.content_reports ADD COLUMN IF NOT EXISTS context jsonb NULL;
ALTER TABLE public.content_reports ALTER COLUMN reported DROP NOT NULL;

UPDATE public.content_reports
SET kind = 'team_name',
    context = jsonb_build_object('team_id', substring(reason FROM '^team_name:([0-9a-fA-F-]{36}):'))
WHERE kind = 'user' AND reason ~ '^team_name:[0-9a-fA-F-]{36}:';

ALTER TABLE public.content_reports
  ADD CONSTRAINT content_reports_kind_chk CHECK (kind IN ('user', 'team_name', 'ai_response')),
  ADD CONSTRAINT content_reports_context_chk
    CHECK (context IS NULL OR (jsonb_typeof(context) = 'object' AND octet_length(context::text) <= 8192)),
  ADD CONSTRAINT content_reports_reported_by_kind_chk CHECK ((kind = 'ai_response') = (reported IS NULL));

CREATE INDEX IF NOT EXISTS content_reports_reporter_created_idx ON public.content_reports (reporter, created_at);

CREATE OR REPLACE FUNCTION public.notify_content_report()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  secret text;
  reporter_name text;
  reported_name text;
  team_name text;
BEGIN
  SELECT decrypted_secret INTO secret FROM vault.decrypted_secrets WHERE name = 'report_notify_secret';
  IF secret IS NULL THEN
    RETURN NULL;
  END IF;
  -- Throttle per reporter (this row included): a spammer cannot flood the owner's inbox.
  IF (SELECT count(*) FROM public.content_reports cr
      WHERE cr.reporter = NEW.reporter AND cr.created_at > now() - interval '1 hour') > 10 THEN
    RETURN NULL;
  END IF;

  SELECT p.display_name INTO reporter_name FROM public.profiles p WHERE p.id = NEW.reporter;
  SELECT p.display_name INTO reported_name FROM public.profiles p WHERE p.id = NEW.reported;
  IF NEW.kind = 'team_name' AND NEW.context ? 'team_id' THEN
    SELECT t.name INTO team_name FROM public.teams t WHERE t.id::text = NEW.context->>'team_id';
  END IF;

  PERFORM net.http_post(
    url := 'https://learn.alphonsoecosystem.app/api/internal/report-notify',
    headers := jsonb_build_object('Content-Type', 'application/json', 'X-Report-Notify-Secret', secret),
    body := jsonb_build_object(
      'id', NEW.id,
      'kind', NEW.kind,
      'reason', NEW.reason,
      'context', NEW.context,
      'reporterName', reporter_name,
      'reportedId', NEW.reported,
      'reportedName', reported_name,
      'teamName', team_name,
      'createdAt', NEW.created_at
    ),
    timeout_milliseconds := 5000
  );
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_content_report failed for report %: % %', NEW.id, SQLSTATE, SQLERRM;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS notify_content_report ON public.content_reports;
CREATE TRIGGER notify_content_report
  AFTER INSERT ON public.content_reports
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_content_report();

REVOKE ALL ON FUNCTION public.notify_content_report() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_content_report() TO service_role;
