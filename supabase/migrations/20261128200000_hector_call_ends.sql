-- A Hector call is saved once: the claim /api/hector-call-end takes before it spends quota or asks the model.
--
-- The route used to check tutor_memory.call_id and then call remember_call_recap. Two concurrent requests for the
-- same call both passed the check (both charged quota, both ran the model, both inserted weakness_events), and a
-- retry of an OLDER call passed too, because tutor_memory.call_id is overwritten by later calls on the same topic.
-- This table is the atomic claim, with a lease so a request that dies after claiming cannot lock the call out:
--
--   claimed_at    when the claim was taken. A claim without completed_at is held for 2 minutes, then anyone may take
--                 it over (the request that held it died). The same lease as practice calls' recap_claimed_at.
--   completed_at  set once the call's memory was written (or the model's words were all dropped). Only this means
--                 "already saved"; a completed call is never claimed again.
--
--   claim_hector_call     'claimed' (go ahead), 'done' (already saved) or 'busy' (another request holds a live lease).
--   release_hector_call   gives an unfinished claim back (the attempt failed before the write); false once completed.
--   complete_hector_call  marks the call done.
--
-- All three are service role only (the route uses supabaseAdmin), as is the table. It goes with the account (ON
-- DELETE CASCADE) and is part of the GDPR export, read with the service role.
--
-- Depends on nothing: it only references auth.users. Versioned last so it can merge after the other migrations in flight.
--
-- Rollback: DROP FUNCTION public.claim_hector_call(uuid, uuid); DROP FUNCTION public.release_hector_call(uuid, uuid);
--   DROP FUNCTION public.complete_hector_call(uuid, uuid); DROP TABLE public.hector_call_ends;

-- client-grants: none public.hector_call_ends
CREATE TABLE public.hector_call_ends (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  call_id uuid NOT NULL,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  PRIMARY KEY (user_id, call_id)
);
ALTER TABLE public.hector_call_ends ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hector_call_ends FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.hector_call_ends TO service_role;

CREATE FUNCTION public.claim_hector_call(_user_id uuid, _call_id uuid) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  taken boolean;
BEGIN
  -- One statement, so two concurrent callers cannot both win: a fresh row, or an UNFINISHED row whose lease ran out.
  INSERT INTO public.hector_call_ends AS c (user_id, call_id)
  VALUES (_user_id, _call_id)
  ON CONFLICT (user_id, call_id) DO UPDATE SET claimed_at = now()
    WHERE c.completed_at IS NULL AND c.claimed_at < now() - interval '2 minutes'
  RETURNING true INTO taken;
  IF taken THEN
    RETURN 'claimed';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.hector_call_ends
     WHERE user_id = _user_id AND call_id = _call_id AND completed_at IS NOT NULL
  ) THEN
    RETURN 'done';
  END IF;
  RETURN 'busy';
END;
$$;

CREATE FUNCTION public.release_hector_call(_user_id uuid, _call_id uuid) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  gone integer;
BEGIN
  DELETE FROM public.hector_call_ends
   WHERE user_id = _user_id AND call_id = _call_id AND completed_at IS NULL;
  GET DIAGNOSTICS gone = ROW_COUNT;
  RETURN gone > 0;
END;
$$;

CREATE FUNCTION public.complete_hector_call(_user_id uuid, _call_id uuid) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  done integer;
BEGIN
  UPDATE public.hector_call_ends SET completed_at = now()
   WHERE user_id = _user_id AND call_id = _call_id AND completed_at IS NULL;
  GET DIAGNOSTICS done = ROW_COUNT;
  RETURN done > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_hector_call(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_hector_call(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_hector_call(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_hector_call(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_hector_call(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_hector_call(uuid, uuid) TO service_role;
