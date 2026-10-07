-- Study together, Phase 5: preset messages between study buddies (spec 2026-10-06-study-together-design.md Part 3,
-- plan 2026-10-07-buddy-messages-web.md). Buddies can send each other one of 8 fixed encouragements; the server stores
-- and checks only the preset id, never text (owner decision 2026-10-06: free text would add user-generated content and
-- change the App Store submission). The wording lives in the clients (src/lib/buddy.ts, iOS/Android BuddyCopy), pinned
-- by the shared buddy.fixtures.json. Writes only through send_buddy_message; clients read their own pairs' messages.
--
-- ROLLBACK: DROP FUNCTION public.get_buddy_messages(timestamptz); DROP FUNCTION public.send_buddy_message(text);
-- DROP TABLE public.buddy_messages;

CREATE TABLE public.buddy_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pair_id uuid NOT NULL REFERENCES public.buddy_pairs(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  preset_id text NOT NULL CHECK (preset_id IN ('lets_study', 'nice_work', 'keep_going', 'need_a_hand', 'on_my_way', 'good_morning', 'good_night', 'proud_of_you')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX buddy_messages_pair_idx ON public.buddy_messages (pair_id, created_at DESC);
CREATE INDEX buddy_messages_sender_idx ON public.buddy_messages (sender_id, created_at);
ALTER TABLE public.buddy_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY buddy_messages_select_own ON public.buddy_messages FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.buddy_pairs bp WHERE bp.id = buddy_messages.pair_id AND (SELECT auth.uid()) IN (bp.user_a, bp.user_b)));
GRANT SELECT ON public.buddy_messages TO authenticated;
GRANT ALL ON public.buddy_messages TO service_role;

CREATE OR REPLACE FUNCTION public.send_buddy_message(_preset text)
RETURNS TABLE(status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET timezone = 'UTC'
AS $$
DECLARE
  me uuid := auth.uid();
  pid uuid;
  other uuid;
BEGIN
  IF me IS NULL THEN RETURN QUERY SELECT 'unauthenticated'::text; RETURN; END IF;
  IF _preset IS NULL OR NOT (_preset IN ('lets_study', 'nice_work', 'keep_going', 'need_a_hand', 'on_my_way', 'good_morning', 'good_night', 'proud_of_you')) THEN
    RETURN QUERY SELECT 'bad_preset'::text; RETURN;
  END IF;
  SELECT bm.pair_id INTO pid FROM public.buddy_members bm WHERE bm.user_id = me;
  IF pid IS NULL THEN RETURN QUERY SELECT 'not_paired'::text; RETURN; END IF;
  SELECT CASE WHEN bp.user_a = me THEN bp.user_b ELSE bp.user_a END INTO other FROM public.buddy_pairs bp WHERE bp.id = pid;
  -- The same per-person lock as pairing and ending: an unfriend or block that commits first wins, and two parallel
  -- sends cannot both pass the limit.
  PERFORM public._lock_buddy_users(me, other);
  IF NOT EXISTS (SELECT 1 FROM public.buddy_members bm WHERE bm.user_id = me AND bm.pair_id = pid) THEN
    RETURN QUERY SELECT 'not_paired'::text; RETURN;
  END IF;
  IF (SELECT count(*) FROM public.buddy_messages m WHERE m.sender_id = me AND m.created_at > now() - interval '1 hour') >= 20 THEN
    RETURN QUERY SELECT 'rate_limited'::text; RETURN;
  END IF;
  INSERT INTO public.buddy_messages (pair_id, sender_id, preset_id) VALUES (pid, me, _preset);
  RETURN QUERY SELECT 'sent'::text;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_buddy_messages(_since timestamptz DEFAULT NULL)
RETURNS TABLE(message_id uuid, sender_id uuid, is_mine boolean, preset_id text, sent_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET timezone = 'UTC'
AS $$
DECLARE
  me uuid := auth.uid();
  pid uuid;
BEGIN
  IF me IS NULL THEN RETURN; END IF;
  SELECT bm.pair_id INTO pid FROM public.buddy_members bm WHERE bm.user_id = me;
  IF pid IS NULL THEN RETURN; END IF;
  -- The newest 50 of the ACTIVE pair, returned oldest first. Ended pairs' history stays readable through RLS/export.
  RETURN QUERY
  SELECT recent.id, recent.sender_id, recent.sender_id = me, recent.preset_id, recent.created_at
  FROM (
    SELECT m.id, m.sender_id, m.preset_id, m.created_at FROM public.buddy_messages m
    WHERE m.pair_id = pid AND m.created_at > coalesce(_since, '-infinity'::timestamptz)
    ORDER BY m.created_at DESC
    LIMIT 50
  ) recent
  ORDER BY recent.created_at ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.send_buddy_message(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_buddy_message(text) TO authenticated;
REVOKE ALL ON FUNCTION public.get_buddy_messages(timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_buddy_messages(timestamptz) TO authenticated;
