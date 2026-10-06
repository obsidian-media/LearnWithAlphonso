-- 20261006100000_learning_goals.sql intended SELECT-only access for clients (writes go through
-- /api/learning-goal with the service role). A production check after it deployed showed
-- Supabase's default privileges had also given BOTH `anon` and `authenticated` INSERT, UPDATE,
-- DELETE, TRUNCATE, REFERENCES and TRIGGER on the new table: the migration's explicit
-- `GRANT SELECT` only added to what the defaults had already granted.
--
-- Not exploitable through PostgREST today (RLS is on and there is a SELECT-only policy for
-- `authenticated`, so row writes are denied and `anon` sees nothing), but TRUNCATE and the
-- other table-level privileges are not governed by RLS, and the privileges should say what the
-- design says. So: take everything away from both roles, then give `authenticated` SELECT back.
-- `service_role` (the route) keeps its full access.
--
-- VERSIONING: 20261006110000 sorts after the migration that creates the table.

REVOKE ALL ON public.learning_goals FROM anon;
REVOKE ALL ON public.learning_goals FROM authenticated;
GRANT SELECT ON public.learning_goals TO authenticated;
