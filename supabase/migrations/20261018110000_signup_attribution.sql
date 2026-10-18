-- Where a new account came from.
--
-- Stores utm_source / utm_medium / utm_campaign and when the visitor first landed, ONCE, at
-- sign-up. Nothing else: no IP address, no user agent, no device id, no referrer URL. The
-- browser only sends it when the visitor chose "Accept all" in the cookie banner.
--
-- Clients cannot write this table. The only write path is record_signup_attribution(), which
-- is SECURITY DEFINER, checks the account is new, validates every value and never overwrites.
-- A learner can read their own row (so the GDPR export includes it). The row goes with the
-- account (ON DELETE CASCADE). How to read it: docs/attribution.md.

CREATE TABLE public.signup_attribution (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  utm_source text CHECK (utm_source ~ '^[a-z0-9_.-]{1,64}$'),
  utm_medium text CHECK (utm_medium ~ '^[a-z0-9_.-]{1,64}$'),
  utm_campaign text CHECK (utm_campaign ~ '^[a-z0-9_.-]{1,64}$'),
  landed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (utm_source IS NOT NULL OR utm_medium IS NOT NULL OR utm_campaign IS NOT NULL)
);

ALTER TABLE public.signup_attribution ENABLE ROW LEVEL SECURITY;

CREATE POLICY "signup_attribution_select_own" ON public.signup_attribution
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);

-- Start closed whatever the project's default privileges are, then grant exactly the policy.
REVOKE ALL ON public.signup_attribution FROM anon;
REVOKE ALL ON public.signup_attribution FROM authenticated;
GRANT SELECT ON public.signup_attribution TO authenticated;
GRANT ALL ON public.signup_attribution TO service_role;

CREATE FUNCTION public.record_signup_attribution(
  p_source text,
  p_medium text,
  p_campaign text,
  p_landed_at timestamptz
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_created timestamptz;
  v_source text := lower(btrim(p_source));
  v_medium text := lower(btrim(p_medium));
  v_campaign text := lower(btrim(p_campaign));
  v_rows integer;
BEGIN
  IF v_uid IS NULL THEN
    RETURN 'unauthenticated';
  END IF;

  -- Only a NEW account has a sign-up to attribute. Stale browser storage on a returning
  -- learner's device must not label them. 7 days covers a delayed confirmation email.
  SELECT u.created_at INTO v_created FROM auth.users u WHERE u.id = v_uid;
  IF v_created IS NULL OR v_created < now() - interval '7 days' THEN
    RETURN 'not_new';
  END IF;

  -- Anything that is not a short plain tag is dropped, never stored.
  IF v_source IS NULL OR v_source !~ '^[a-z0-9_.-]{1,64}$' THEN v_source := NULL; END IF;
  IF v_medium IS NULL OR v_medium !~ '^[a-z0-9_.-]{1,64}$' THEN v_medium := NULL; END IF;
  IF v_campaign IS NULL OR v_campaign !~ '^[a-z0-9_.-]{1,64}$' THEN v_campaign := NULL; END IF;
  IF v_source IS NULL AND v_medium IS NULL AND v_campaign IS NULL THEN
    RETURN 'empty';
  END IF;

  INSERT INTO public.signup_attribution (user_id, utm_source, utm_medium, utm_campaign, landed_at)
  VALUES (
    v_uid, v_source, v_medium, v_campaign,
    CASE WHEN p_landed_at IS NULL THEN NULL ELSE least(p_landed_at, now()) END
  )
  ON CONFLICT (user_id) DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  RETURN CASE WHEN v_rows = 1 THEN 'recorded' ELSE 'already' END;
END;
$$;

REVOKE ALL ON FUNCTION public.record_signup_attribution(text, text, text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_signup_attribution(text, text, text, timestamptz) FROM anon;
GRANT EXECUTE ON FUNCTION public.record_signup_attribution(text, text, text, timestamptz)
  TO authenticated, service_role;
