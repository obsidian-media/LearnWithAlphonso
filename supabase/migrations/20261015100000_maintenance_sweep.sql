-- Scheduled maintenance, and the three small server-only tables it works from. Nothing here is readable or
-- writable by a client role. Deploy before the server code that uses it: until that code is live the scheduled
-- call gets a 404 from the web app and does nothing else.
--
-- apple_revocation_pending: when an account is deleted and Apple cannot be reached to revoke its Sign in with
--   Apple grant, the stored credential used to be deleted with the account, so the revocation could never be
--   retried. The credential is now parked here (with no link to the deleted account) until Apple confirms, or
--   for 7 days at most, after which it is removed and the owner is told.
-- content_report_delivery: whether the owner was actually emailed about a report, and whether an unresolved
--   report was escalated. Kept apart from content_reports because clients hold INSERT on that table and must not
--   be able to mark their own report as delivered.
-- app_switches: off switches for AI features and the paid tutor, read by the server. Lessons do not depend on them.
-- run_maintenance_sweep: every 15 minutes prunes old review-grade receipts and asks the web app to retry pending
--   revocations and undelivered or overdue reports. Authenticated by the existing Vault shared secret
--   (report_notify_secret); without it only the pruning runs.
--
-- Rollback (one transaction):
--   SELECT cron.unschedule('maintenance-sweep'); DROP FUNCTION public.run_maintenance_sweep();
--   DROP TABLE public.app_switches, public.content_report_delivery, public.apple_revocation_pending;
--   (leave the pg_cron extension installed)

-- client-grants: none public.apple_revocation_pending
CREATE TABLE public.apple_revocation_pending (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  refresh_token text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_attempt_at timestamptz
);
ALTER TABLE public.apple_revocation_pending ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.apple_revocation_pending FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.apple_revocation_pending TO service_role;

-- client-grants: none public.content_report_delivery
CREATE TABLE public.content_report_delivery (
  report_id uuid PRIMARY KEY REFERENCES public.content_reports(id) ON DELETE CASCADE,
  notified_at timestamptz,
  escalated_at timestamptz,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.content_report_delivery ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.content_report_delivery FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.content_report_delivery TO service_role;

-- Reports filed before this existed were emailed by the insert trigger; do not send them again.
INSERT INTO public.content_report_delivery (report_id, notified_at)
SELECT id, created_at FROM public.content_reports;

-- client-grants: none public.app_switches
CREATE TABLE public.app_switches (
  key text PRIMARY KEY CHECK (key IN ('ai', 'tutor')),
  enabled boolean NOT NULL DEFAULT true,
  note text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.app_switches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_switches FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.app_switches TO service_role;
INSERT INTO public.app_switches (key, enabled, note) VALUES
  ('ai', true, 'All AI features: conversation, speech, AI grading, word lookup, the tutor.'),
  ('tutor', true, 'The paid voice tutor only.');

CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE FUNCTION public.run_maintenance_sweep() RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  secret text;
BEGIN
  -- A receipt only matters while the app may still retry that grade; the app's queue is long gone after 30 days.
  DELETE FROM public.review_grade_attempts WHERE created_at < now() - interval '30 days';

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

SELECT cron.schedule('maintenance-sweep', '*/15 * * * *', 'SELECT public.run_maintenance_sweep()');
