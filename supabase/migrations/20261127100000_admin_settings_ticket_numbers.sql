-- Admin console rebuild, PR 1 (shell + Home): what the new Home needs from the database.
--
--   admin_settings              a tiny owner-editable settings table. Today one key: support_breach_hours (seeded 8,
--                               the owner's decision), the hours a ticket may wait for a staff reply before it counts
--                               as breaching. It is a REAL row the owner can change, not a constant in the code.
--   staff_get_settings          read it (any active staff member).
--   staff_set_setting           change it (an owner only, with a reason; one row in staff_audit_log, same transaction).
--   support_conversations       + ticket_no (a visible, contiguous number given when a chat first reaches a person) and
--                               + handed_off_at (when it reached a person), both set by a trigger so the existing
--                               hand-off functions are untouched. Backfilled for every chat already with a person.
--   support_waiting_since       when the learner started waiting for a staff reply (NULL unless the ticket needs one).
--   staff_support_inbox         REPLACED (same signature): per-row ticketNo, waitingSince, breaching; counts mine,
--                               openUnassigned, breaching, oldestWaitingSince; breachHours; a new filter "breaching".
--   staff_home_metrics          the Home metric row: new learners, lessons finished, active today. Counts only.
--
-- Status words (owner ruling): "New" = status new; "Needs reply" = status open (awaiting staff); "Waiting on learner";
-- "Resolved". BREACHING = a ticket that needs a reply (new or open) whose wait is longer than support_breach_hours.
-- The wait starts at: the hand-off (no staff reply yet), else the learner's first message after the last staff reply,
-- else the last update (a ticket a person reopened).
--
-- Every function is SECURITY DEFINER with search_path = '' and EXECUTE for service_role only. The console checks the scope
-- before calling; the settings functions also check the actor in SQL (active staff to read, an owner to write), so a
-- caller that skipped the console is still refused.
--
-- Depends on 20261113100000 (staff_console: staff_roles, admin_users, staff_record), 20261117100000 (support chat) and
-- 20261117100200 (the function this replaces), 20261107120000 (learning_days), the lesson_completions table.
--
-- Rollback: DROP FUNCTION public.staff_home_metrics(text), public.support_waiting_since(uuid,text,timestamptz,timestamptz),
--   public.staff_set_setting(uuid,text,text,jsonb,text), public.staff_get_settings(uuid);
--   DROP TRIGGER support_conversations_hand_off ON public.support_conversations;
--   DROP FUNCTION public.support_conversations_hand_off(); DROP TABLE public.admin_settings;
--   ALTER TABLE public.support_conversations DROP COLUMN ticket_no, DROP COLUMN handed_off_at;
--   DROP SEQUENCE public.support_ticket_no_seq; and re-run 20261117100200's staff_support_inbox.

-- ---- settings ----
-- client-grants: none public.admin_settings
CREATE TABLE public.admin_settings (
  key text PRIMARY KEY CHECK (key IN ('support_breach_hours')),
  value jsonb NOT NULL,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.admin_settings ENABLE ROW LEVEL SECURITY;
-- Reads only for the server; every write is staff_set_setting (service_role would otherwise inherit ALL).
REVOKE ALL ON public.admin_settings FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.admin_settings TO service_role;
INSERT INTO public.admin_settings (key, value) VALUES ('support_breach_hours', '8'::jsonb);

-- The caller's working role: 'owner' or 'support' for an active staff member, NULL for anyone else (not staff,
-- disabled, or the support_ai label). A member of admin_users with no staff_roles row is the implicit owner.
CREATE FUNCTION public.staff_active_role(p_actor uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM public.staff_roles r WHERE r.user_id = p_actor)
      THEN (SELECT r.role FROM public.staff_roles r
             WHERE r.user_id = p_actor AND r.disabled_at IS NULL AND r.role IN ('owner', 'support'))
    WHEN EXISTS (SELECT 1 FROM public.admin_users a WHERE a.user_id = p_actor) THEN 'owner'
    ELSE NULL
  END;
$$;
REVOKE ALL ON FUNCTION public.staff_active_role(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staff_active_role(uuid) TO service_role;

CREATE FUNCTION public.staff_get_settings(p_actor uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_actor IS NULL OR public.staff_active_role(p_actor) IS NULL THEN
    RAISE EXCEPTION 'staff_get_settings: not an active staff member' USING ERRCODE = '42501';
  END IF;
  RETURN coalesce((SELECT jsonb_object_agg(s.key, s.value) FROM public.admin_settings s), '{}'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.staff_get_settings(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staff_get_settings(uuid) TO service_role;

-- Owner only. The reason (3 to 500 characters) goes into the action record with the old and the new value. TRUE when
-- the value changed; FALSE when it already was that value (nothing written, nothing recorded).
CREATE FUNCTION public.staff_set_setting(
  p_actor uuid, p_role text, p_key text, p_value jsonb, p_reason text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  old_value jsonb;
  hours numeric;
  new_value jsonb;
BEGIN
  IF p_actor IS NULL OR p_role IS DISTINCT FROM 'owner' OR public.staff_active_role(p_actor) IS DISTINCT FROM 'owner' THEN
    RAISE EXCEPTION 'staff_set_setting: only an owner can change settings' USING ERRCODE = '42501';
  END IF;
  IF p_reason IS NULL OR char_length(btrim(p_reason)) NOT BETWEEN 3 AND 500 THEN
    RAISE EXCEPTION 'staff_set_setting: a reason of 3 to 500 characters is required' USING ERRCODE = '22023';
  END IF;
  IF p_key = 'support_breach_hours' THEN
    IF p_value IS NULL OR jsonb_typeof(p_value) <> 'number' THEN
      RAISE EXCEPTION 'staff_set_setting: support_breach_hours must be a whole number of hours' USING ERRCODE = '22023';
    END IF;
    hours := (p_value #>> '{}')::numeric;
    IF hours <> trunc(hours) OR hours < 1 OR hours > 168 THEN
      RAISE EXCEPTION 'staff_set_setting: support_breach_hours must be 1 to 168' USING ERRCODE = '22023';
    END IF;
    -- Stored canonically (9.0 is stored as 9), so every reader can cast it.
    new_value := to_jsonb(hours::integer);
  ELSE
    RAISE EXCEPTION 'staff_set_setting: unknown setting' USING ERRCODE = '22023';
  END IF;
  SELECT s.value INTO old_value FROM public.admin_settings s WHERE s.key = p_key FOR UPDATE;
  IF old_value IS NOT DISTINCT FROM new_value THEN
    RETURN false;
  END IF;
  INSERT INTO public.admin_settings (key, value, updated_by, updated_at)
  VALUES (p_key, new_value, p_actor, now())
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now();
  PERFORM public.staff_record(
    p_actor, 'owner', 'settings.update', NULL, btrim(p_reason),
    jsonb_build_object('key', p_key, 'value', old_value),
    jsonb_build_object('key', p_key, 'value', new_value), NULL);
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.staff_set_setting(uuid, text, text, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staff_set_setting(uuid, text, text, jsonb, text) TO service_role;

-- ---- ticket number + hand-off time ----
ALTER TABLE public.support_conversations
  ADD COLUMN ticket_no bigint,
  ADD COLUMN handed_off_at timestamptz;

-- Chats already with a person: handed off when the "A person will reply here." line was written (else created), and
-- numbered in the order they were created.
UPDATE public.support_conversations c
   SET handed_off_at = coalesce(
         (SELECT min(m.created_at) FROM public.support_messages m
           WHERE m.conversation_id = c.id AND m.author_kind = 'system' AND m.body = 'A person will reply here.'),
         c.created_at)
 WHERE c.status <> 'ai';
WITH numbered AS (
  SELECT id, row_number() OVER (ORDER BY created_at, id) AS n
    FROM public.support_conversations WHERE status <> 'ai')
UPDATE public.support_conversations c SET ticket_no = numbered.n FROM numbered WHERE numbered.id = c.id;

CREATE SEQUENCE public.support_ticket_no_seq OWNED BY public.support_conversations.ticket_no;
SELECT setval('public.support_ticket_no_seq',
              coalesce((SELECT max(ticket_no) FROM public.support_conversations), 0) + 1, false);
REVOKE ALL ON SEQUENCE public.support_ticket_no_seq FROM PUBLIC, anon, authenticated;
CREATE UNIQUE INDEX support_conversations_ticket_no ON public.support_conversations (ticket_no);
CREATE INDEX support_conversations_handed_off ON public.support_conversations (status, handed_off_at);

-- The first time a chat leaves the AI for a person it gets its number and its hand-off time. The two hand-off
-- functions (support_add_ai_message, support_handoff) are not touched: they move status 'ai' to 'new'.
CREATE FUNCTION public.support_conversations_hand_off()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF OLD.status = 'ai' AND NEW.status <> 'ai' THEN
    IF NEW.ticket_no IS NULL THEN
      NEW.ticket_no := nextval('public.support_ticket_no_seq');
    END IF;
    IF NEW.handed_off_at IS NULL THEN
      NEW.handed_off_at := now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.support_conversations_hand_off() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER support_conversations_hand_off
  BEFORE UPDATE OF status ON public.support_conversations
  FOR EACH ROW EXECUTE FUNCTION public.support_conversations_hand_off();

-- ---- the wait ----
CREATE FUNCTION public.support_waiting_since(
  p_conversation uuid, p_status text, p_handed_off_at timestamptz, p_updated_at timestamptz
) RETURNS timestamptz
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_status NOT IN ('new', 'open') THEN NULL
    WHEN ls.last_staff IS NULL THEN coalesce(p_handed_off_at, p_updated_at)
    ELSE coalesce(
      (SELECT min(m.created_at) FROM public.support_messages m
        WHERE m.conversation_id = p_conversation AND m.author_kind = 'learner' AND m.created_at > ls.last_staff),
      p_updated_at)
  END
  FROM (SELECT max(m.created_at) AS last_staff FROM public.support_messages m
         WHERE m.conversation_id = p_conversation AND m.author_kind = 'staff') ls;
$$;
REVOKE ALL ON FUNCTION public.support_waiting_since(uuid, text, timestamptz, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.support_waiting_since(uuid, text, timestamptz, timestamptz) TO service_role;

-- ---- the list (replaces 20261117100200's staff_support_inbox; same signature) ----
-- p_filter: open (new and open), waiting, solved, breaching (open tickets waiting longer than the setting), all.
-- p_assigned: any, me, unassigned. counts.mine and counts.breaching and counts.openUnassigned are about tickets that
-- need a reply (new or open), the Home queue's tabs; counts.unassigned keeps its old meaning (any ticket not solved).
-- breachHours is the setting the server read; when the setting is missing it is NULL, no ticket is breaching and
-- counts.breaching is NULL (not 0).
CREATE OR REPLACE FUNCTION public.staff_support_inbox(
  p_actor uuid, p_filter text, p_assigned text, p_cursor_at timestamptz, p_cursor_id uuid, p_limit integer
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  want_filter text := coalesce(p_filter, 'open');
  want_assigned text := coalesce(p_assigned, 'any');
  page_size integer := least(greatest(coalesce(p_limit, 25), 1), 50);
  hours integer;
  breach_before timestamptz;
  page_rows jsonb;
  has_more boolean;
  last_at timestamptz;
  last_id uuid;
  matching integer;
  counts jsonb;
BEGIN
  IF want_filter NOT IN ('open', 'waiting', 'solved', 'breaching', 'all') THEN
    RAISE EXCEPTION 'staff_support_inbox: unknown filter' USING ERRCODE = '22023';
  END IF;
  IF want_assigned NOT IN ('any', 'me', 'unassigned') THEN
    RAISE EXCEPTION 'staff_support_inbox: unknown assignment filter' USING ERRCODE = '22023';
  END IF;
  IF want_assigned = 'me' AND p_actor IS NULL THEN
    RAISE EXCEPTION 'staff_support_inbox: an actor is required for "me"' USING ERRCODE = '22023';
  END IF;
  IF (p_cursor_at IS NULL) <> (p_cursor_id IS NULL) THEN
    RAISE EXCEPTION 'staff_support_inbox: a cursor needs both parts' USING ERRCODE = '22023';
  END IF;

  SELECT (s.value #>> '{}')::numeric::integer INTO hours FROM public.admin_settings s WHERE s.key = 'support_breach_hours';
  breach_before := CASE WHEN hours IS NULL THEN NULL ELSE now() - make_interval(hours => hours) END;

  WITH base AS (
    SELECT c.id, c.status, c.assigned_to, c.updated_at,
           public.support_waiting_since(c.id, c.status, c.handed_off_at, c.updated_at) AS ws
      FROM public.support_conversations c WHERE c.status <> 'ai'
  )
  SELECT count(*) INTO matching
    FROM base b
   WHERE CASE want_filter
           WHEN 'open' THEN b.status IN ('new', 'open')
           WHEN 'waiting' THEN b.status = 'waiting_learner'
           WHEN 'solved' THEN b.status = 'solved'
           WHEN 'breaching' THEN b.ws IS NOT NULL AND breach_before IS NOT NULL AND b.ws < breach_before
           ELSE true END
     AND CASE want_assigned
           WHEN 'me' THEN b.assigned_to = p_actor
           WHEN 'unassigned' THEN b.assigned_to IS NULL
           ELSE true END;

  WITH base AS (
    SELECT c.*, public.support_waiting_since(c.id, c.status, c.handed_off_at, c.updated_at) AS ws
      FROM public.support_conversations c WHERE c.status <> 'ai'
  ), page AS (
    SELECT c.*, row_number() OVER (ORDER BY c.updated_at DESC, c.id DESC) AS rn
      FROM (
        SELECT b.* FROM base b
         WHERE CASE want_filter
                 WHEN 'open' THEN b.status IN ('new', 'open')
                 WHEN 'waiting' THEN b.status = 'waiting_learner'
                 WHEN 'solved' THEN b.status = 'solved'
                 WHEN 'breaching' THEN b.ws IS NOT NULL AND breach_before IS NOT NULL AND b.ws < breach_before
                 ELSE true END
           AND CASE want_assigned
                 WHEN 'me' THEN b.assigned_to = p_actor
                 WHEN 'unassigned' THEN b.assigned_to IS NULL
                 ELSE true END
           AND (p_cursor_at IS NULL OR (b.updated_at, b.id) < (p_cursor_at, p_cursor_id))
         ORDER BY b.updated_at DESC, b.id DESC
         LIMIT page_size + 1
      ) c
  )
  SELECT
    coalesce(jsonb_agg(
      jsonb_build_object(
        'id', pg.id,
        'ticketNo', pg.ticket_no,
        'status', pg.status,
        'topic', pg.topic,
        'channel', pg.channel,
        'handoffReason', pg.handoff_reason,
        'assignedTo', pg.assigned_to,
        'assignedName', (SELECT p.display_name FROM public.profiles p WHERE p.id = pg.assigned_to),
        'snippet', (SELECT left(m.body, 200) FROM public.support_messages m
                     WHERE m.conversation_id = pg.id AND m.author_kind = 'learner'
                     ORDER BY m.id LIMIT 1),
        'createdAt', pg.created_at,
        'updatedAt', pg.updated_at,
        'waitingSince', pg.ws,
        'breaching', pg.ws IS NOT NULL AND breach_before IS NOT NULL AND pg.ws < breach_before,
        'unopened', pg.status IN ('new', 'open') AND NOT EXISTS (
          SELECT 1 FROM public.staff_audit_log l
           WHERE l.action = 'user.view' AND l.target_user_id = pg.user_id AND l.at >= pg.created_at)
      ) ORDER BY pg.rn) FILTER (WHERE pg.rn <= page_size), '[]'::jsonb),
    coalesce(bool_or(pg.rn > page_size), false),
    (array_agg(pg.updated_at ORDER BY pg.rn) FILTER (WHERE pg.rn = page_size))[1],
    (array_agg(pg.id ORDER BY pg.rn) FILTER (WHERE pg.rn = page_size))[1]
  INTO page_rows, has_more, last_at, last_id
  FROM page pg;

  WITH base AS (
    SELECT c.status, c.assigned_to,
           public.support_waiting_since(c.id, c.status, c.handed_off_at, c.updated_at) AS ws
      FROM public.support_conversations c WHERE c.status <> 'ai'
  )
  SELECT jsonb_build_object(
    'open', count(*) FILTER (WHERE b.status IN ('new', 'open')),
    'waiting', count(*) FILTER (WHERE b.status = 'waiting_learner'),
    'solved', count(*) FILTER (WHERE b.status = 'solved'),
    'all', count(*),
    'unassigned', count(*) FILTER (WHERE b.status <> 'solved' AND b.assigned_to IS NULL),
    'openUnassigned', count(*) FILTER (WHERE b.status IN ('new', 'open') AND b.assigned_to IS NULL),
    'mine', count(*) FILTER (WHERE b.status IN ('new', 'open') AND p_actor IS NOT NULL AND b.assigned_to = p_actor),
    'breaching', CASE WHEN breach_before IS NULL THEN NULL
                 ELSE count(*) FILTER (WHERE b.ws IS NOT NULL AND b.ws < breach_before) END,
    'oldestWaitingSince', min(b.ws))
    INTO counts
    FROM base b;

  RETURN jsonb_build_object(
    'tickets', page_rows,
    'total', matching,
    'counts', counts,
    'breachHours', hours,
    'next', CASE WHEN has_more THEN jsonb_build_object('at', last_at, 'id', last_id) ELSE NULL END);
END;
$$;
REVOKE ALL ON FUNCTION public.staff_support_inbox(uuid, text, text, timestamptz, uuid, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staff_support_inbox(uuid, text, text, timestamptz, uuid, integer) TO service_role;

-- ---- the Home metric row ----
-- The range tests compare the raw timestamp with UTC midnight (not a date cast), so these indexes can serve them.
CREATE INDEX IF NOT EXISTS lesson_completions_completed_at ON public.lesson_completions (completed_at);
CREATE INDEX IF NOT EXISTS profiles_created_at ON public.profiles (created_at);
-- p_range: today (this UTC day), 7 or 30 (the last 7 or 30 UTC days including today). Counts only: no id, no name.
--   newLearners   profiles created in the range
--   lessons       lesson_completions finished in the range
--   activeToday   distinct learners with a learning_days row for today (UTC); independent of the range
CREATE FUNCTION public.staff_home_metrics(p_range text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  today date := (now() AT TIME ZONE 'UTC')::date;
  first_day date;
BEGIN
  first_day := CASE p_range
    WHEN 'today' THEN today
    WHEN '7' THEN today - 6
    WHEN '30' THEN today - 29
    ELSE NULL END;
  IF first_day IS NULL THEN
    RAISE EXCEPTION 'staff_home_metrics: range must be today, 7 or 30' USING ERRCODE = '22023';
  END IF;
  RETURN jsonb_build_object(
    'newLearners', (SELECT count(*) FROM public.profiles p WHERE p.created_at >= first_day::timestamp AT TIME ZONE 'UTC'),
    'lessons', (SELECT count(*) FROM public.lesson_completions l WHERE l.completed_at >= first_day::timestamp AT TIME ZONE 'UTC'),
    'activeToday', (SELECT count(DISTINCT d.user_id) FROM public.learning_days d WHERE d.day = today));
END;
$$;
REVOKE ALL ON FUNCTION public.staff_home_metrics(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staff_home_metrics(text) TO service_role;
