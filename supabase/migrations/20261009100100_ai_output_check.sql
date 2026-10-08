-- One verdict for AI output, from the moderation filter (20261008130000_moderation_filter_v2.sql). The server
-- sends each user-visible model string here before showing it; a TRUE is replaced with a safe fallback and logged.
-- No word list lives in TypeScript.
--
-- SECURITY DEFINER because contains_blocked_term is revoked from clients (the lists must not be readable). This
-- returns booleans only, the same exposure display_name_problem() already accepts.
-- Bounded: at most 20 strings per call, each truncated to 8000 characters. Callers chunk; a missing element is
-- treated as blocked by the server (fail closed).
--
-- Rollback: revert the server filter first (an RPC error makes the server serve the fallback for every reply),
-- then: DROP FUNCTION IF EXISTS public.ai_output_blocked(text[]);

CREATE OR REPLACE FUNCTION public.ai_output_blocked(_texts text[])
RETURNS boolean[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(array_agg(public.contains_blocked_term(left(x.t, 8000)) ORDER BY x.i), ARRAY[]::boolean[])
  FROM unnest(_texts[1:20]) WITH ORDINALITY AS x(t, i);
$$;

REVOKE ALL ON FUNCTION public.ai_output_blocked(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ai_output_blocked(text[]) TO authenticated, service_role;
