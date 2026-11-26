-- Trial-ending reminder email (docs/OPEN-ITEMS.md item 94).
--
-- RevenueCat sends no reminder before a one-week trial converts to paid. The maintenance sweep
-- (src/lib/trial-reminder.server.ts) now finds learners whose Pro trial ends within 3 days and emails each ONE reminder.
-- The step is OFF unless the web app has TRIAL_REMINDER_ENABLED=true, so this migration changes nothing visible.
--
--   trial_reminders      one row per learner who was reminded (or whose reminder is being sent). The primary key is
--                        the dedupe: one trial per person, one email per trial. The row is claimed BEFORE the send
--                        and removed again if the send fails, so two overlapping sweeps cannot both email.
--   trial_reminder_scan  a single row holding when the last scan ran, so the 15-minute sweep scans about once a day.
--
-- Both are service role only: no policy, no client grant.
--
-- Rollback: DROP TABLE public.trial_reminders; DROP TABLE public.trial_reminder_scan;

-- client-grants: none public.trial_reminders
CREATE TABLE public.trial_reminders (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  trial_ends_at timestamptz NOT NULL,
  claimed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.trial_reminders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.trial_reminders FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.trial_reminders TO service_role;

-- client-grants: none public.trial_reminder_scan
CREATE TABLE public.trial_reminder_scan (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  last_scan_at timestamptz NOT NULL DEFAULT 'epoch'
);
INSERT INTO public.trial_reminder_scan (id) VALUES (true);
ALTER TABLE public.trial_reminder_scan ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.trial_reminder_scan FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.trial_reminder_scan TO service_role;
