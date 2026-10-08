-- One verdict for AI output, from the moderation filter (20261008130000_moderation_filter_v2.sql). The server
-- sends each user-visible model string here before showing it; a TRUE is replaced with a safe fallback and logged.
-- No word list lives in TypeScript.
--
-- SECURITY DEFINER because contains_blocked_term is revoked from clients (the lists must not be readable). This
-- returns booleans only, the same exposure display_name_problem() already accepts.
-- Bounded: one dimension, at most 20 strings per call, each truncated to 8000 characters. A larger or
-- multi-dimensional array (PostgREST accepts one) is refused with invalid-argument, because slicing [1:20] would cap
-- only the first dimension while unnest flattens the rest. Callers chunk long text into pieces of at most 8000
-- characters; a missing element is treated as blocked by the server (fail closed).
--
-- Rollback: revert the server filter first (an RPC error makes the server serve the fallback for every reply),
-- then: DROP FUNCTION IF EXISTS public.ai_output_blocked(text[]);

CREATE OR REPLACE FUNCTION public.ai_output_blocked(_texts text[])
RETURNS boolean[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _out boolean[];
BEGIN
  IF array_ndims(_texts) > 1 OR cardinality(_texts) > 20 THEN
    RAISE EXCEPTION 'invalid-argument' USING ERRCODE = '22023';
  END IF;
  SELECT coalesce(array_agg(public.contains_blocked_term(left(x.t, 8000)) ORDER BY x.i), ARRAY[]::boolean[])
    INTO _out
    FROM unnest(_texts) WITH ORDINALITY AS x(t, i);
  RETURN _out;
END;
$$;

REVOKE ALL ON FUNCTION public.ai_output_blocked(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ai_output_blocked(text[]) TO authenticated, service_role;
