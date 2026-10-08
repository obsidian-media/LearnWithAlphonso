-- While matching is switched off
-- (UPDATE public.buddy_settings SET matching_enabled = false), matched-stranger pairs cannot send preset messages.
-- Friend pairs are unaffected and every pair keeps its progress (counts, streak, grace). Turning the switch back on
-- restores sending without any client release. Enforced here, so an old app build is muted too.
-- get_my_buddy gains matching_enabled so the apps can hide the presets for a matched pair and say why.
--
-- Rollback (one transaction):
--   re-run CREATE OR REPLACE FUNCTION public.send_buddy_message from 20261007100000_buddy_messages.sql;
--   DROP FUNCTION public.get_my_buddy(); re-run get_my_buddy from 20261007120000_buddy_matching.sql, then
--   REVOKE ALL ON FUNCTION public.get_my_buddy() FROM PUBLIC, anon;
--   GRANT EXECUTE ON FUNCTION public.get_my_buddy() TO authenticated, service_role;

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
  -- The kill switch also mutes matched-stranger pairs. Friend pairs keep sending.
  IF EXISTS (SELECT 1 FROM public.buddy_pairs bp WHERE bp.id = pid AND bp.source = 'match')
     AND NOT coalesce((SELECT bs.matching_enabled FROM public.buddy_settings bs WHERE bs.id), false) THEN
    RETURN QUERY SELECT 'matching_paused'::text; RETURN;
  END IF;
  IF (SELECT count(*) FROM public.buddy_messages m WHERE m.sender_id = me AND m.created_at > now() - interval '1 hour') >= 20 THEN
    RETURN QUERY SELECT 'rate_limited'::text; RETURN;
  END IF;
  INSERT INTO public.buddy_messages (pair_id, sender_id, preset_id) VALUES (pid, me, _preset);
  RETURN QUERY SELECT 'sent'::text;
END;
$$;

REVOKE ALL ON FUNCTION public.send_buddy_message(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_buddy_message(text) TO authenticated, service_role;

-- The return type changes, so drop and recreate; the body is 20261007120000's plus matching_enabled.
DROP FUNCTION public.get_my_buddy();
CREATE OR REPLACE FUNCTION public.get_my_buddy()
RETURNS TABLE(pair_id uuid, buddy_id uuid, buddy_name text, buddy_avatar_seed text, paired_at timestamptz, week_start date,
  my_count integer, buddy_count integer, goal integer, streak_weeks integer, grace_available boolean, last_outcome text,
  is_match boolean, matching_enabled boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET timezone = 'UTC'
AS $$
DECLARE
  me uuid := auth.uid();
  pid uuid;
  wk date := date_trunc('week', current_date)::date;
BEGIN
  IF me IS NULL THEN RETURN; END IF;
  SELECT bm.pair_id INTO pid FROM public.buddy_members bm WHERE bm.user_id = me;
  IF pid IS NULL THEN RETURN; END IF;
  PERFORM public._resolve_buddy_pair(pid);
  RETURN QUERY
  SELECT bp.id,
    other.id,
    other.display_name,
    other.avatar_seed,
    bp.created_at,
    wk,
    public._buddy_count(me, greatest(wk::timestamptz, bp.created_at), (wk + 7)::timestamptz),
    public._buddy_count(other.id, greatest(wk::timestamptz, bp.created_at), (wk + 7)::timestamptz),
    3,
    bp.streak_weeks,
    bp.grace_available,
    (SELECT bw.outcome FROM public.buddy_weeks bw WHERE bw.pair_id = bp.id ORDER BY bw.week_start DESC LIMIT 1),
    bp.source = 'match',
    -- The live switch; clients hide the presets when is_match AND NOT matching_enabled.
    coalesce((SELECT bs.matching_enabled FROM public.buddy_settings bs WHERE bs.id), false)
  FROM public.buddy_pairs bp
  JOIN public.profiles other ON other.id = CASE WHEN bp.user_a = me THEN bp.user_b ELSE bp.user_a END
  WHERE bp.id = pid AND bp.ended_at IS NULL; -- the pair may have ended while we waited for its lock
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_buddy() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_buddy() TO authenticated, service_role;

