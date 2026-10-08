-- AI consent is recorded on the account, not on the device.
--
-- profiles.ai_consent_at is NULL until the learner allows AI processing and NULL again after they withdraw it.
-- /api/chat, stt, tts, hector-respond, grade-translation, define-word and analyze-weaknesses refuse with
-- 403 ai-consent-required when it is NULL; complete-lesson, grade-review and the web lesson/review server
-- functions skip the AI grader and grade locally. Nobody is backfilled: a learner who never chose has not consented.
--
-- Writes go through set_ai_consent() only. profiles keeps its own-row UPDATE grant (display name, theme), so a
-- trigger refuses a direct change to this column unless set_ai_consent opened the transaction-local switch
-- app.ai_consent_write, or the session is a server role (service_role, postgres, supabase_admin: the review-account
-- re-seed resets consent to NULL this way). Every client-written value is therefore an explicit choice stamped by
-- the server clock.
--
-- Other learners cannot read this column: profiles is own-row only (20261008130800_profiles_own_row_read.sql).
-- Clients read their own value through get_ai_consent().
--
-- Rollback (one transaction, after 20261009100100's rollback, and only after ENFORCE_AI_CONSENT=false is live on
-- Vercel and in Supabase secrets, or every AI request fails its consent read):
--   DROP TRIGGER IF EXISTS profiles_guard_ai_consent ON public.profiles;
--   DROP FUNCTION IF EXISTS public.guard_ai_consent_column();
--   DROP FUNCTION IF EXISTS public.set_ai_consent(boolean);
--   DROP FUNCTION IF EXISTS public.get_ai_consent();
--   ALTER TABLE public.profiles DROP COLUMN IF EXISTS ai_consent_at;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS ai_consent_at timestamptz NULL;

COMMENT ON COLUMN public.profiles.ai_consent_at IS
  'When the learner allowed AI processing (Deepgram speech, NVIDIA text). NULL = not allowed. Written only by set_ai_consent() or a server role.';

-- Not SECURITY DEFINER and not revoked: a trigger function cannot be called directly, and it must run for every
-- role that can write profiles (handle_new_user, the own-row PATCH, set_ai_consent).
CREATE OR REPLACE FUNCTION public.guard_ai_consent_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user IN ('service_role', 'postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.ai_consent_at IS NOT NULL
       AND coalesce(current_setting('app.ai_consent_write', true), '') <> 'on' THEN
      RAISE EXCEPTION 'ai-consent-via-rpc-only' USING ERRCODE = '42501';
    END IF;
  ELSIF NEW.ai_consent_at IS DISTINCT FROM OLD.ai_consent_at
        AND coalesce(current_setting('app.ai_consent_write', true), '') <> 'on' THEN
    RAISE EXCEPTION 'ai-consent-via-rpc-only' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_guard_ai_consent ON public.profiles;
CREATE TRIGGER profiles_guard_ai_consent
  BEFORE INSERT OR UPDATE OF ai_consent_at ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_ai_consent_column();

CREATE OR REPLACE FUNCTION public.set_ai_consent(_granted boolean)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _stamp timestamptz;
  _rows integer;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not-authenticated' USING ERRCODE = '42501';
  END IF;
  IF _granted IS NULL THEN
    RAISE EXCEPTION 'invalid-argument' USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('app.ai_consent_write', 'on', true);
  UPDATE public.profiles p
     SET ai_consent_at = CASE WHEN _granted THEN now() ELSE NULL END
   WHERE p.id = _uid
  RETURNING p.ai_consent_at INTO _stamp;
  GET DIAGNOSTICS _rows = ROW_COUNT;
  PERFORM set_config('app.ai_consent_write', 'off', true);

  IF _rows = 0 THEN
    RAISE EXCEPTION 'profile-not-found' USING ERRCODE = 'P0002';
  END IF;
  RETURN _stamp;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_ai_consent()
RETURNS timestamptz
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.ai_consent_at FROM public.profiles p WHERE p.id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.set_ai_consent(boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_ai_consent() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_ai_consent(boolean), public.get_ai_consent() TO authenticated, service_role;
