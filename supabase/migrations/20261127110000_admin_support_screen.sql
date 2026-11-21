-- Admin console rebuild, PR 2 (Support): what the new Support screen needs from the database.
--
--   N-8   staff_support_set_status   REPLACED (+ p_reason): every status change (solve, reopen, waiting on the learner)
--                                    needs a reason of 3 to 500 characters, kept in the action record.
--         staff_support_assign       REPLACED (+ p_reason): handing a ticket to SOMEONE ELSE (or taking another person's
--                                    ticket back to the pool) needs a reason. Taking a ticket yourself, or giving back
--                                    one you hold, stays reason-free (a self-claim; the fixed words are recorded).
--   N-13  support_conversations.urgent  a flag set when a support agent hands a ticket to an owner.
--         staff_support_hand_to_owner   reassigns the ticket to an active owner and sets urgent, with a reason and one
--                                    action-record row ("support.handoff"), in one transaction. Refuses a ticket that is
--                                    still with the AI or already solved. FALSE (nothing written, nothing recorded) when
--                                    the ticket is already urgent and already with that owner.
--         staff_support_clear_urgent    an owner takes the flag off, with a reason ("support.urgent_clear"). Solving a
--                                    ticket clears it too.
--         staff_support_inbox        REPLACED (one new argument p_cursor_urgent): each row carries `urgent`; for an
--                                    OWNER, urgent tickets that still need attention sort first (then newest activity);
--                                    counts.urgent; the paging cursor carries the urgent part so pages stay stable.
--
-- Who is "an owner": an active staff_roles row with role owner, or a member of admin_users with no staff_roles row (the
-- implicit owner). The owner a ticket is handed to is the ticket's current assignee when that is already an owner, else
-- the active owner holding the fewest unsolved tickets (ties: the lowest id). The learner is never chosen.
--
-- All functions are SECURITY DEFINER, search_path = '', EXECUTE for service_role only. The console checks the scope
-- before calling; hand_to_owner and clear_urgent also check the actor in SQL (active staff to hand over, an owner to
-- clear), so a caller that skipped the console is still refused.
--
-- Depends on 20261117100200 (the two functions this replaces) and 20261127100000 (the inbox this replaces, ticket_no,
-- handed_off_at, support_waiting_since, staff_active_role).
--
-- Rollback: DROP FUNCTION public.staff_support_clear_urgent(uuid,text,uuid,text),
--   public.staff_support_hand_to_owner(uuid,text,uuid,text), public.staff_support_assign(uuid,text,uuid,uuid,text),
--   public.staff_support_set_status(uuid,text,uuid,text,text),
--   public.staff_support_inbox(uuid,text,text,timestamptz,uuid,integer,boolean);
--   ALTER TABLE public.support_conversations DROP COLUMN urgent; then re-run 20261117100200's assign and set_status and
--   20261127100000's staff_support_inbox.

ALTER TABLE public.support_conversations ADD COLUMN urgent boolean NOT NULL DEFAULT false;

-- ---- a reason, for the two functions that change a ticket's state ----
DROP FUNCTION public.staff_support_set_status(uuid, text, uuid, text);
CREATE FUNCTION public.staff_support_set_status(
  p_actor uuid, p_role text, p_conversation uuid, p_status text, p_reason text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  conv public.support_conversations%ROWTYPE;
BEGIN
  IF p_actor IS NULL THEN
    RAISE EXCEPTION 'staff_support_set_status: an actor is required' USING ERRCODE = '22023';
  END IF;
  IF p_status IS NULL OR p_status NOT IN ('open', 'waiting_learner', 'solved') THEN
    RAISE EXCEPTION 'staff_support_set_status: status must be open, waiting_learner or solved' USING ERRCODE = '22023';
  END IF;
  IF p_reason IS NULL OR char_length(btrim(p_reason)) NOT BETWEEN 3 AND 500 THEN
    RAISE EXCEPTION 'staff_support_set_status: a reason of 3 to 500 characters is required' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO conv FROM public.support_conversations WHERE id = p_conversation FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'support: no such ticket' USING ERRCODE = 'P0002';
  END IF;
  IF conv.user_id = p_actor THEN
    RAISE EXCEPTION 'staff_support_set_status: staff cannot act on their own account' USING ERRCODE = '42501';
  END IF;
  IF conv.status = 'ai' THEN
    RAISE EXCEPTION 'support: the conversation is still with the AI' USING ERRCODE = '55000';
  END IF;
  IF conv.status = p_status THEN
    RETURN false;
  END IF;
  IF conv.status = 'solved' AND p_status <> 'open' THEN
    RAISE EXCEPTION 'support: a solved ticket can only be reopened' USING ERRCODE = '22023';
  END IF;
  -- The learner's chat shows only their NEWEST conversation (support_learner_view), so a reopen must land on it, and
  -- only within the same 7 days a learner's own message can reopen a solved chat (support_open_conversation).
  IF conv.status = 'solved' AND (
       conv.solved_at IS NULL OR conv.solved_at <= now() - interval '7 days'
       OR EXISTS (SELECT 1 FROM public.support_conversations n
                   WHERE n.user_id = conv.user_id AND n.id <> conv.id
                     AND (n.created_at, n.id) > (conv.created_at, conv.id))) THEN
    RAISE EXCEPTION 'support: this chat is too old to reopen' USING ERRCODE = 'LW001';
  END IF;
  IF p_status = 'solved' THEN
    -- A solved ticket is no longer urgent.
    UPDATE public.support_conversations
       SET status = 'solved', solved_at = now(), updated_at = now(), urgent = false
     WHERE id = conv.id;
    INSERT INTO public.support_messages (conversation_id, user_id, author_kind, body)
    VALUES (conv.id, conv.user_id, 'system', 'This chat was marked solved.');
  ELSIF conv.status = 'solved' THEN
    UPDATE public.support_conversations
       SET status = 'open', solved_at = NULL, updated_at = now()
     WHERE id = conv.id;
    INSERT INTO public.support_messages (conversation_id, user_id, author_kind, body)
    VALUES (conv.id, conv.user_id, 'system', 'This chat was reopened. A person will reply here.');
  ELSE
    UPDATE public.support_conversations
       SET status = p_status, updated_at = now()
     WHERE id = conv.id;
  END IF;
  PERFORM public.staff_record(
    p_actor, p_role, 'support.status', conv.user_id, btrim(p_reason),
    jsonb_build_object('status', conv.status, 'urgent', conv.urgent),
    jsonb_build_object('status', p_status, 'conversation_id', conv.id), NULL);
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.staff_support_set_status(uuid, text, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staff_support_set_status(uuid, text, uuid, text, text) TO service_role;

-- A reason is required unless the actor takes the ticket for themselves or gives back one they hold.
DROP FUNCTION public.staff_support_assign(uuid, text, uuid, uuid);
CREATE FUNCTION public.staff_support_assign(
  p_actor uuid, p_role text, p_conversation uuid, p_assignee uuid, p_reason text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  conv public.support_conversations%ROWTYPE;
  member public.staff_roles%ROWTYPE;
  new_status text;
  self_move boolean;
BEGIN
  IF p_actor IS NULL THEN
    RAISE EXCEPTION 'staff_support_assign: an actor is required' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO conv FROM public.support_conversations WHERE id = p_conversation FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'support: no such ticket' USING ERRCODE = 'P0002';
  END IF;
  IF conv.user_id = p_actor THEN
    RAISE EXCEPTION 'staff_support_assign: staff cannot act on their own account' USING ERRCODE = '42501';
  END IF;
  IF conv.status = 'ai' THEN
    RAISE EXCEPTION 'support: the conversation is still with the AI' USING ERRCODE = '55000';
  END IF;
  IF p_assignee IS NOT NULL THEN
    IF p_assignee = conv.user_id THEN
      RAISE EXCEPTION 'support: the learner cannot be the assignee' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO member FROM public.staff_roles r WHERE r.user_id = p_assignee;
    IF FOUND THEN
      IF member.disabled_at IS NOT NULL OR member.role = 'support_ai'
         OR (member.role <> 'owner' AND NOT ('support.read' = ANY (member.scopes))) THEN
        RAISE EXCEPTION 'support: the assignee cannot work support tickets' USING ERRCODE = '22023';
      END IF;
    ELSIF NOT EXISTS (SELECT 1 FROM public.admin_users a WHERE a.user_id = p_assignee) THEN
      RAISE EXCEPTION 'support: the assignee is not staff' USING ERRCODE = '22023';
    END IF;
  END IF;
  IF conv.assigned_to IS NOT DISTINCT FROM p_assignee THEN
    RETURN false;
  END IF;
  self_move := p_assignee IS NOT DISTINCT FROM p_actor
            OR (p_assignee IS NULL AND conv.assigned_to IS NOT DISTINCT FROM p_actor);
  IF NOT self_move AND (p_reason IS NULL OR char_length(btrim(p_reason)) NOT BETWEEN 3 AND 500) THEN
    RAISE EXCEPTION 'staff_support_assign: handing a ticket to someone else needs a reason of 3 to 500 characters'
      USING ERRCODE = '22023';
  END IF;
  new_status := CASE WHEN p_assignee IS NOT NULL AND conv.status = 'new' THEN 'open' ELSE conv.status END;
  UPDATE public.support_conversations
     SET assigned_to = p_assignee, status = new_status, updated_at = now()
   WHERE id = conv.id;
  PERFORM public.staff_record(
    p_actor, p_role, 'support.assign', conv.user_id,
    CASE WHEN self_move THEN 'ticket assignment' ELSE btrim(p_reason) END,
    jsonb_build_object('assigned_to', conv.assigned_to, 'status', conv.status),
    jsonb_build_object('assigned_to', p_assignee, 'status', new_status, 'conversation_id', conv.id), NULL);
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.staff_support_assign(uuid, text, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staff_support_assign(uuid, text, uuid, uuid, text) TO service_role;

-- ---- Hand to owner (N-13) ----
CREATE FUNCTION public.staff_support_hand_to_owner(
  p_actor uuid, p_role text, p_conversation uuid, p_reason text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  conv public.support_conversations%ROWTYPE;
  target uuid;
  new_status text;
BEGIN
  IF p_actor IS NULL OR public.staff_active_role(p_actor) IS NULL THEN
    RAISE EXCEPTION 'staff_support_hand_to_owner: not an active staff member' USING ERRCODE = '42501';
  END IF;
  IF p_reason IS NULL OR char_length(btrim(p_reason)) NOT BETWEEN 3 AND 500 THEN
    RAISE EXCEPTION 'staff_support_hand_to_owner: a reason of 3 to 500 characters is required' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO conv FROM public.support_conversations WHERE id = p_conversation FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'support: no such ticket' USING ERRCODE = 'P0002';
  END IF;
  IF conv.user_id = p_actor THEN
    RAISE EXCEPTION 'staff_support_hand_to_owner: staff cannot act on their own account' USING ERRCODE = '42501';
  END IF;
  IF conv.status IN ('ai', 'solved') THEN
    RAISE EXCEPTION 'support: the conversation is still with the AI or solved' USING ERRCODE = '55000';
  END IF;

  WITH owners AS (
    SELECT r.user_id AS id FROM public.staff_roles r WHERE r.role = 'owner' AND r.disabled_at IS NULL
    UNION
    SELECT a.user_id FROM public.admin_users a
     WHERE NOT EXISTS (SELECT 1 FROM public.staff_roles r WHERE r.user_id = a.user_id)
  )
  SELECT o.id INTO target
    FROM owners o
   WHERE o.id <> conv.user_id
   ORDER BY (o.id IS NOT DISTINCT FROM conv.assigned_to) DESC,
            (SELECT count(*) FROM public.support_conversations c
              WHERE c.assigned_to = o.id AND c.status <> 'solved'),
            o.id
   LIMIT 1;
  IF target IS NULL THEN
    RAISE EXCEPTION 'support: there is no active owner to hand this to' USING ERRCODE = 'LW002';
  END IF;

  IF conv.assigned_to IS NOT DISTINCT FROM target AND conv.urgent THEN
    RETURN false;
  END IF;
  new_status := CASE WHEN conv.status = 'new' THEN 'open' ELSE conv.status END;
  UPDATE public.support_conversations
     SET assigned_to = target, urgent = true, status = new_status, updated_at = now()
   WHERE id = conv.id;
  PERFORM public.staff_record(
    p_actor, p_role, 'support.handoff', conv.user_id, btrim(p_reason),
    jsonb_build_object('assigned_to', conv.assigned_to, 'urgent', conv.urgent, 'status', conv.status),
    jsonb_build_object('assigned_to', target, 'urgent', true, 'status', new_status, 'conversation_id', conv.id), NULL);
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.staff_support_hand_to_owner(uuid, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staff_support_hand_to_owner(uuid, text, uuid, text) TO service_role;

CREATE FUNCTION public.staff_support_clear_urgent(
  p_actor uuid, p_role text, p_conversation uuid, p_reason text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  conv public.support_conversations%ROWTYPE;
BEGIN
  IF p_actor IS NULL OR p_role IS DISTINCT FROM 'owner' OR public.staff_active_role(p_actor) IS DISTINCT FROM 'owner' THEN
    RAISE EXCEPTION 'staff_support_clear_urgent: only an owner can clear the urgent flag' USING ERRCODE = '42501';
  END IF;
  IF p_reason IS NULL OR char_length(btrim(p_reason)) NOT BETWEEN 3 AND 500 THEN
    RAISE EXCEPTION 'staff_support_clear_urgent: a reason of 3 to 500 characters is required' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO conv FROM public.support_conversations WHERE id = p_conversation FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'support: no such ticket' USING ERRCODE = 'P0002';
  END IF;
  IF conv.user_id = p_actor THEN
    RAISE EXCEPTION 'staff_support_clear_urgent: staff cannot act on their own account' USING ERRCODE = '42501';
  END IF;
  IF NOT conv.urgent THEN
    RETURN false;
  END IF;
  UPDATE public.support_conversations SET urgent = false, updated_at = now() WHERE id = conv.id;
  PERFORM public.staff_record(
    p_actor, p_role, 'support.urgent_clear', conv.user_id, btrim(p_reason),
    jsonb_build_object('urgent', true),
    jsonb_build_object('urgent', false, 'conversation_id', conv.id), NULL);
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.staff_support_clear_urgent(uuid, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staff_support_clear_urgent(uuid, text, uuid, text) TO service_role;

-- ---- the list (replaces 20261127100000's staff_support_inbox; one new argument) ----
-- p_cursor_urgent: the sort group of the last row of the previous page (true = it was in the owner's urgent group).
DROP FUNCTION public.staff_support_inbox(uuid, text, text, timestamptz, uuid, integer);
CREATE FUNCTION public.staff_support_inbox(
  p_actor uuid, p_filter text, p_assigned text, p_cursor_at timestamptz, p_cursor_id uuid, p_limit integer,
  p_cursor_urgent boolean DEFAULT false
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
  is_owner boolean := p_actor IS NOT NULL AND public.staff_active_role(p_actor) = 'owner';
  cursor_group integer := CASE WHEN coalesce(p_cursor_urgent, false) THEN 1 ELSE 0 END;
  page_rows jsonb;
  has_more boolean;
  last_at timestamptz;
  last_id uuid;
  last_group integer;
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
    SELECT c.*, public.support_waiting_since(c.id, c.status, c.handed_off_at, c.updated_at) AS ws,
           CASE WHEN is_owner AND c.urgent AND c.status <> 'solved' THEN 1 ELSE 0 END AS grp
      FROM public.support_conversations c WHERE c.status <> 'ai'
  ), page AS (
    SELECT c.*, row_number() OVER (ORDER BY c.grp DESC, c.updated_at DESC, c.id DESC) AS rn
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
           AND (p_cursor_at IS NULL OR (b.grp, b.updated_at, b.id) < (cursor_group, p_cursor_at, p_cursor_id))
         ORDER BY b.grp DESC, b.updated_at DESC, b.id DESC
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
        'urgent', pg.urgent AND pg.status <> 'solved',
        'unopened', pg.status IN ('new', 'open') AND NOT EXISTS (
          SELECT 1 FROM public.staff_audit_log l
           WHERE l.action = 'user.view' AND l.target_user_id = pg.user_id AND l.at >= pg.created_at)
      ) ORDER BY pg.rn) FILTER (WHERE pg.rn <= page_size), '[]'::jsonb),
    coalesce(bool_or(pg.rn > page_size), false),
    (array_agg(pg.updated_at ORDER BY pg.rn) FILTER (WHERE pg.rn = page_size))[1],
    (array_agg(pg.id ORDER BY pg.rn) FILTER (WHERE pg.rn = page_size))[1],
    (array_agg(pg.grp ORDER BY pg.rn) FILTER (WHERE pg.rn = page_size))[1]
  INTO page_rows, has_more, last_at, last_id, last_group
  FROM page pg;

  WITH base AS (
    SELECT c.status, c.assigned_to, c.urgent,
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
    'urgent', count(*) FILTER (WHERE b.urgent AND b.status <> 'solved'),
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
    'next', CASE WHEN has_more
                 THEN jsonb_build_object('at', last_at, 'id', last_id, 'urgent', last_group = 1)
                 ELSE NULL END);
END;
$$;
REVOKE ALL ON FUNCTION public.staff_support_inbox(uuid, text, text, timestamptz, uuid, integer, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staff_support_inbox(uuid, text, text, timestamptz, uuid, integer, boolean) TO service_role;
