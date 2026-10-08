-- ai_output_blocked is called by the server only (with the service role), never by a signed-in learner's own
-- session. Measured: one call with 20 strings of 8000 characters takes about 2 seconds of database time, so leaving
-- EXECUTE on `authenticated` let any signed-in user burn database CPU in a loop. The routes now pass the
-- service-role client to the check.
--
-- Rollback: GRANT EXECUTE ON FUNCTION public.ai_output_blocked(text[]) TO authenticated;
-- (only after reverting the server to a user-scoped client, which is not recommended).

REVOKE ALL ON FUNCTION public.ai_output_blocked(text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_output_blocked(text[]) TO service_role;
