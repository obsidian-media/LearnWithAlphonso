-- Trial-ending reminder email (docs/OPEN-ITEMS.md item 94).
--
-- RevenueCat sends no reminder before a one-week trial converts to paid. The maintenance sweep
-- (src/lib/trial-reminder.server.ts) finds learners whose Pro trial ends within 3 days and emails each ONE reminder.
-- The step is OFF unless the web app has TRIAL_REMINDER_ENABLED=true, so this migration changes nothing visible.
--
--   trial_reminders         one row per learner who was reminded (or whose reminder is being sent). The primary key
--                           is the dedupe: one trial per person, one email per trial. The row is claimed BEFORE the
--                           send and removed again if the send fails, so two overlapping sweeps cannot both email.
--   trial_reminder_checked  when each learner's trial state was last read from RevenueCat. Every 15-minute sweep
--                           takes the least recently checked active learners first, within a time budget, so a cut-off
--                           sweep simply continues on the next one and no learner is starved.
--   trial_reminder_candidates()  the selection, in the database: learners active since a day, not yet reminded, not
--                           checked since a time, never-checked first, then oldest check first.
--
-- All service role only: no policy, no client grant.
--
-- Rollback: DROP FUNCTION public.trial_reminder_candidates(date, timestamptz, integer);
--           DROP TABLE public.trial_reminder_checked; DROP TABLE public.trial_reminders;

-- client-grants: none public.trial_reminders
CREATE TABLE public.trial_reminders (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  trial_ends_at timestamptz NOT NULL,
  claimed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.trial_reminders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.trial_reminders FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.trial_reminders TO service_role;

-- client-grants: none public.trial_reminder_checked
CREATE TABLE public.trial_reminder_checked (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  checked_at timestamptz NOT NULL
);
ALTER TABLE public.trial_reminder_checked ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.trial_reminder_checked FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.trial_reminder_checked TO service_role;

CREATE FUNCTION public.trial_reminder_candidates(
  p_active_since date,
  p_checked_before timestamptz,
  p_limit integer
) RETURNS TABLE (user_id uuid)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT a.user_id
    FROM (SELECT DISTINCT ad.user_id FROM public.activity_days ad WHERE ad.day >= p_active_since) a
    LEFT JOIN public.trial_reminder_checked c ON c.user_id = a.user_id
   WHERE NOT EXISTS (SELECT 1 FROM public.trial_reminders r WHERE r.user_id = a.user_id)
     AND (c.checked_at IS NULL OR c.checked_at < p_checked_before)
   ORDER BY c.checked_at ASC NULLS FIRST, a.user_id
   LIMIT GREATEST(p_limit, 0);
$$;
REVOKE ALL ON FUNCTION public.trial_reminder_candidates(date, timestamptz, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trial_reminder_candidates(date, timestamptz, integer) TO service_role;
