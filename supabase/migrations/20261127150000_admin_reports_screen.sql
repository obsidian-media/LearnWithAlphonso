-- Admin console rebuild, PR 6 (Reports): every report action now carries a reason.
--
--   N-6  staff_dismiss_report, staff_reset_display_name, staff_rename_team, staff_disband_team
--        REPLACED with one more argument, p_reason (last). The reason is trimmed and must be 3 to 500 characters; it is
--        checked IN SQL, before anything changes, and is written to the staff_audit_log row in the same transaction as
--        the change. A missing, short or long reason raises 22023 and nothing changes and nothing is recorded.
--
-- The old four signatures are DROPPED, not kept: the only caller is admin.functions.ts (grepped), and a report action
-- that can be called without a reason is the gap this closes. Behaviour is otherwise unchanged (same return values, same
-- action names report.dismiss / report.reset_display_name / report.rename_team / report.disband_team).
--
-- All SECURITY DEFINER, search_path = '', EXECUTE for service_role only.
-- Depends on 20261113100000 (staff_record, admin_reset_display_name, admin_rename_team, the four functions replaced).
--
-- Rollback: DROP the five-argument functions below and re-run the four report-action definitions from
--   20261113100000_staff_console.sql.

DROP FUNCTION public.staff_reset_display_name(uuid, text, uuid, uuid);
DROP FUNCTION public.staff_rename_team(uuid, text, uuid, uuid, uuid, text);
DROP FUNCTION public.staff_disband_team(uuid, text, uuid, uuid, uuid);
DROP FUNCTION public.staff_dismiss_report(uuid, text, uuid, uuid);

-- The one place the reason rule lives for the four report actions.
CREATE FUNCTION public.staff_report_reason(p_reason text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_reason IS NULL OR char_length(btrim(p_reason)) < 3 OR char_length(btrim(p_reason)) > 500 THEN
    RAISE EXCEPTION 'a reason of 3 to 500 characters is required' USING ERRCODE = '22023';
  END IF;
  RETURN btrim(p_reason);
END;
$$;
REVOKE ALL ON FUNCTION public.staff_report_reason(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staff_report_reason(text) TO service_role;

CREATE FUNCTION public.staff_reset_display_name(p_actor uuid, p_role text, p_target uuid, p_report uuid, p_reason text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  why text := public.staff_report_reason(p_reason);
  new_name text;
BEGIN
  new_name := public.admin_reset_display_name(p_target);
  IF new_name IS NULL THEN
    RETURN NULL;
  END IF;
  PERFORM public.staff_record(
    p_actor, p_role, 'report.reset_display_name', p_target, why, NULL,
    jsonb_build_object('report_id', p_report), NULL);
  RETURN new_name;
END;
$$;
REVOKE ALL ON FUNCTION public.staff_reset_display_name(uuid, text, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staff_reset_display_name(uuid, text, uuid, uuid, text) TO service_role;

-- Returns NULL when renamed, else the refusal reason from admin_rename_team (nothing recorded, nothing changed).
CREATE FUNCTION public.staff_rename_team(
  p_actor uuid, p_role text, p_target uuid, p_report uuid, p_team uuid, p_name text, p_reason text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  why text := public.staff_report_reason(p_reason);
  problem text;
BEGIN
  problem := public.admin_rename_team(p_team, p_name);
  IF problem IS NOT NULL THEN
    RETURN problem;
  END IF;
  PERFORM public.staff_record(
    p_actor, p_role, 'report.rename_team', p_target, why, NULL,
    jsonb_build_object('report_id', p_report, 'team_id', p_team), NULL);
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.staff_rename_team(uuid, text, uuid, uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staff_rename_team(uuid, text, uuid, uuid, uuid, text, text) TO service_role;

-- Returns false (nothing recorded) when the team is already gone.
CREATE FUNCTION public.staff_disband_team(
  p_actor uuid, p_role text, p_target uuid, p_report uuid, p_team uuid, p_reason text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  why text := public.staff_report_reason(p_reason);
  removed integer;
BEGIN
  DELETE FROM public.teams WHERE id = p_team;
  GET DIAGNOSTICS removed = ROW_COUNT;
  IF removed = 0 THEN
    RETURN false;
  END IF;
  PERFORM public.staff_record(
    p_actor, p_role, 'report.disband_team', p_target, why, NULL,
    jsonb_build_object('report_id', p_report, 'team_id', p_team), NULL);
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.staff_disband_team(uuid, text, uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staff_disband_team(uuid, text, uuid, uuid, uuid, text) TO service_role;

-- Returns false (nothing recorded) when the report is already gone.
CREATE FUNCTION public.staff_dismiss_report(p_actor uuid, p_role text, p_target uuid, p_report uuid, p_reason text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  why text := public.staff_report_reason(p_reason);
  removed integer;
BEGIN
  DELETE FROM public.content_reports WHERE id = p_report;
  GET DIAGNOSTICS removed = ROW_COUNT;
  IF removed = 0 THEN
    RETURN false;
  END IF;
  PERFORM public.staff_record(
    p_actor, p_role, 'report.dismiss', p_target, why, NULL, jsonb_build_object('report_id', p_report), NULL);
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.staff_dismiss_report(uuid, text, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staff_dismiss_report(uuid, text, uuid, uuid, text) TO service_role;
