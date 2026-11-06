-- Keep reports for moderation for 90 days after an account involved is deleted.
--
-- Until now content_reports.reporter and .reported referenced auth.users ON DELETE CASCADE, so deleting either
-- account (self-service deleteMyAccount, an admin, or the dashboard: all of them delete the auth.users row) removed
-- every report it was part of, and a moderator lost the history needed to handle repeated abuse. Now:
--   - both columns are ON DELETE SET NULL, so the report row stays and no longer points at the deleted account;
--   - a BEFORE UPDATE trigger stamps account_deleted_at the moment either reference is cleared (the first deletion
--     wins if both accounts go);
--   - the 15-minute maintenance sweep deletes such a report 90 days after account_deleted_at (its delivery row
--     follows by its own ON DELETE CASCADE).
-- Nothing from the deleted profile is kept: the table never held a name, email or picture, and the id is cleared.
-- The reason and context (team id, or the AI reply and where it appeared) stay as the reported content.
-- Reports between two live accounts are unchanged and stay until a moderator resolves them.
--
-- Clients cannot write account_deleted_at (their INSERT grant is the column list from 20261103100000), so a client
-- cannot start the 90-day clock. A person or team-name report must still name an account when it is filed; it may
-- lose that account only through a deletion, which always stamps account_deleted_at.
--
-- Depends on 20260928020000 (content_reports), 20261008130300 (kind and its check), 20261015100000
-- (content_report_delivery) and 20261105100600 (run_maintenance_sweep, latest body).
--
-- Rollback (one transaction; reports kept since this migration that have lost an account are deleted first, which
-- is what the old CASCADE would have done):
--   DELETE FROM public.content_reports WHERE reporter IS NULL OR (reported IS NULL AND kind <> 'ai_response');
--   DROP TRIGGER stamp_report_account_deleted ON public.content_reports;
--   DROP FUNCTION public._stamp_report_account_deleted();
--   ALTER TABLE public.content_reports DROP CONSTRAINT content_reports_reporter_present_chk,
--     DROP CONSTRAINT content_reports_reported_by_kind_chk,
--     ADD CONSTRAINT content_reports_reported_by_kind_chk CHECK ((kind = 'ai_response') = (reported IS NULL)),
--     DROP CONSTRAINT content_reports_reporter_fkey, DROP CONSTRAINT content_reports_reported_fkey,
--     ADD CONSTRAINT content_reports_reporter_fkey FOREIGN KEY (reporter) REFERENCES auth.users(id) ON DELETE CASCADE,
--     ADD CONSTRAINT content_reports_reported_fkey FOREIGN KEY (reported) REFERENCES auth.users(id) ON DELETE CASCADE,
--     ALTER COLUMN reporter SET NOT NULL;
--   DROP INDEX public.content_reports_account_deleted_at_idx;
--   ALTER TABLE public.content_reports DROP COLUMN account_deleted_at;
--   Re-run run_maintenance_sweep from 20261105100600.

ALTER TABLE public.content_reports ADD COLUMN account_deleted_at timestamptz NULL;

ALTER TABLE public.content_reports
  DROP CONSTRAINT content_reports_reporter_fkey,
  DROP CONSTRAINT content_reports_reported_fkey,
  ADD CONSTRAINT content_reports_reporter_fkey FOREIGN KEY (reporter) REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD CONSTRAINT content_reports_reported_fkey FOREIGN KEY (reported) REFERENCES auth.users(id) ON DELETE SET NULL,
  ALTER COLUMN reporter DROP NOT NULL,
  -- A reporter is required at filing; only a deletion (which stamps the row) may clear it.
  ADD CONSTRAINT content_reports_reporter_present_chk CHECK (reporter IS NOT NULL OR account_deleted_at IS NOT NULL),
  DROP CONSTRAINT content_reports_reported_by_kind_chk,
  ADD CONSTRAINT content_reports_reported_by_kind_chk CHECK (
    CASE WHEN kind = 'ai_response' THEN reported IS NULL
         ELSE reported IS NOT NULL OR account_deleted_at IS NOT NULL
    END
  );

-- The sweep's lookup; only kept reports carry a value.
CREATE INDEX content_reports_account_deleted_at_idx
  ON public.content_reports (account_deleted_at) WHERE account_deleted_at IS NOT NULL;

-- Runs inside the ON DELETE SET NULL update, before the checks above are evaluated.
CREATE FUNCTION public._stamp_report_account_deleted() RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF (OLD.reporter IS NOT NULL AND NEW.reporter IS NULL)
     OR (OLD.reported IS NOT NULL AND NEW.reported IS NULL) THEN
    NEW.account_deleted_at := coalesce(OLD.account_deleted_at, now());
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public._stamp_report_account_deleted() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER stamp_report_account_deleted
  BEFORE UPDATE OF reporter, reported ON public.content_reports
  FOR EACH ROW EXECUTE FUNCTION public._stamp_report_account_deleted();

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
