-- A push token belongs to one physical device, and a device is signed in as one account at a time. With the
-- plain per-user upsert, a phone that A signed out of and B signed in on kept A's row whenever A's sign-out
-- cleanup could not run (offline, expired session), so A's nudges kept reaching B's phone.
--
-- claim_device_token(_token, _platform): the caller takes the token. It removes the same token for every OTHER
-- user (RLS only lets a user delete their own rows, so this needs a definer function), then upserts the
-- caller's own row. It never touches the caller's other tokens or anyone else's other tokens.
--
-- Depends on 20260921030000_remote_push_notifications.sql (device_tokens) and
-- 20260930170000_device_tokens_android.sql (platform 'android').
--
-- Rollback:
--   DROP FUNCTION public.claim_device_token(text, text);

CREATE OR REPLACE FUNCTION public.claim_device_token(_token text, _platform text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = 'P0001';
  END IF;
  IF _token IS NULL OR length(_token) = 0 OR length(_token) > 4096 THEN
    RAISE EXCEPTION 'invalid-token' USING ERRCODE = 'P0001';
  END IF;
  IF _platform IS NULL OR _platform NOT IN ('ios', 'android') THEN
    RAISE EXCEPTION 'invalid-platform' USING ERRCODE = 'P0001';
  END IF;

  DELETE FROM public.device_tokens
  WHERE token = _token AND user_id <> me;

  INSERT INTO public.device_tokens (user_id, token, platform)
  VALUES (me, _token, _platform)
  ON CONFLICT (user_id, token)
  DO UPDATE SET platform = EXCLUDED.platform, updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.claim_device_token(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_device_token(text, text) TO authenticated;
