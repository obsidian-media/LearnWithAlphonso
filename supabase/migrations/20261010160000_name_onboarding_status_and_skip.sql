-- What the onboarding name prompt needs.
--
-- 1. get_my_name_status(): the caller's own display_name and name_confirmed_at. A definer function, so it works
--    the same whatever SELECT policy profiles has.
-- 2. skip_display_name_prompt(): "Skip" on the prompt. It must never publish a name the learner did not choose:
--    handle_new_user keeps a Google full_name when it passes the filter, so a skip that only stamped the
--    confirmation would make a full name public. It keeps a current Learner-XXXX handle that passes the filter,
--    otherwise it stores a fresh handle (retrying until display_name_problem accepts one), then stamps
--    name_confirmed_at. A name already confirmed is returned unchanged.
--
-- Depends on 20261008130100_display_name_onboarding.sql (name_confirmed_at, generate_learner_handle) and
-- 20261008130000_moderation_filter_v2.sql (display_name_problem).
--
-- Rollback:
--   DROP FUNCTION public.skip_display_name_prompt();
--   DROP FUNCTION public.get_my_name_status();

CREATE OR REPLACE FUNCTION public.get_my_name_status()
RETURNS TABLE (display_name text, name_confirmed_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.display_name, p.name_confirmed_at
  FROM public.profiles p
  WHERE p.id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.get_my_name_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_name_status() TO authenticated;

CREATE OR REPLACE FUNCTION public.skip_display_name_prompt()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  current_name text;
  confirmed_at timestamptz;
  candidate text;
  tries int := 0;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = 'P0001';
  END IF;

  SELECT p.display_name, p.name_confirmed_at INTO current_name, confirmed_at FROM public.profiles p WHERE p.id = me FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not-found' USING ERRCODE = 'P0001';
  END IF;

  -- Already chosen or confirmed: Skip must not replace a name the learner picked.
  IF confirmed_at IS NOT NULL THEN
    RETURN current_name;
  END IF;

  IF current_name ~ '^Learner-[0-9A-F]{4}$' AND public.display_name_problem(current_name) IS NULL THEN
    candidate := current_name;
  ELSE
    LOOP
      candidate := public.generate_learner_handle();
      tries := tries + 1;
      EXIT WHEN public.display_name_problem(candidate) IS NULL OR tries >= 20;
    END LOOP;
  END IF;

  IF public.display_name_problem(candidate) IS NOT NULL THEN
    RAISE EXCEPTION 'handle-unavailable' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.profiles p
  SET display_name = candidate, name_confirmed_at = now()
  WHERE p.id = me
  RETURNING p.display_name INTO candidate;

  RETURN candidate;
END;
$$;

REVOKE ALL ON FUNCTION public.skip_display_name_prompt() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.skip_display_name_prompt() TO authenticated;
