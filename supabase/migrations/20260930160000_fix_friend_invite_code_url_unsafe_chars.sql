-- Found via a fresh-context audit (2026-09-30), confirmed by inspection:
-- get_or_create_my_friend_code() generated codes via
-- encode(gen_random_bytes(6), 'base64'), and standard base64 includes '/'
-- and '+'. The code is spliced UNENCODED directly into a URL path segment
-- on both clients -- web: `${origin}/invite/${code}`
-- (profile_.friends.tsx), iOS: appendingPathComponent("invite/\(code)")
-- (FriendsView.swift) -- with no encodeURIComponent/percent-encoding
-- anywhere in the chain. For 8 base64 characters from 6 random bytes,
-- P(at least one '/') ~= 1-(63/64)^8 ~= 11.7%, P('/' or '+') ~= 22%: a
-- meaningful fraction of invite links would silently 404 instead of
-- reaching the invite-accept screen, since a '/' splits the URL into an
-- extra path segment neither router's single dynamic segment (`/invite/$code`)
-- matches. Nothing in the test suite could ever catch this -- every
-- test/fixture uses a hand-picked alphanumeric string, never a real
-- gen_random_bytes output.
--
-- Fixed by switching to hex, which has no characters that are ever
-- special in a URL path segment -- no encoding/decoding needed on
-- either client at all. Same 48 bits of entropy either way (12 hex
-- characters vs 8 base64 characters for the same 6 random bytes), so
-- this is a pure encoding fix, not a security regression.
CREATE OR REPLACE FUNCTION public.get_or_create_my_friend_code()
RETURNS TABLE(code text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  existing text;
BEGIN
  IF me IS NULL THEN
    RETURN;
  END IF;
  SELECT c.code INTO existing FROM public.friend_invite_codes c WHERE c.user_id = me;
  IF existing IS NOT NULL THEN
    RETURN QUERY SELECT existing;
    RETURN;
  END IF;
  INSERT INTO public.friend_invite_codes (user_id, code)
  VALUES (me, encode(extensions.gen_random_bytes(6), 'hex'))
  ON CONFLICT (user_id) DO NOTHING;
  SELECT c.code INTO existing FROM public.friend_invite_codes c WHERE c.user_id = me;
  RETURN QUERY SELECT existing;
END;
$$;
REVOKE ALL ON FUNCTION public.get_or_create_my_friend_code() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_or_create_my_friend_code() TO authenticated, service_role;

-- This feature deployed only minutes before this fix (same session), so
-- no real user is expected to have generated a code yet -- but delete
-- any existing row containing the unsafe characters rather than assume.
-- get_or_create_my_friend_code() always returns the EXISTING row first
-- if one is present, so a bad row left in place would keep returning
-- the same broken code forever; deleting it just means the next call
-- regenerates a clean hex one.
DELETE FROM public.friend_invite_codes WHERE code ~ '[/+]';
