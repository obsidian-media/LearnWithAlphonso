-- Drop profiles.active_language: nothing ever wrote it (every row is 'en'), no web, iOS, Android or edge-function
-- code reads it, and no view, policy, trigger or function body depends on it (20261006170000 moved XP payouts to the
-- course the learner actually studies). A dead column that looks authoritative is how French and Spanish learners went
-- unpaid, so remove it rather than leave the trap.
--
-- Rollback: ALTER TABLE public.profiles ADD COLUMN active_language text NOT NULL DEFAULT 'en';
--           GRANT INSERT, SELECT, UPDATE (active_language) ON public.profiles TO authenticated;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS active_language;
