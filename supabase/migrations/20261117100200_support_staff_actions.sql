-- Help chat, milestone 3: what staff do in the support inbox.
--
--   staff_support_inbox       the ticket list (filters, counts, paging). Shows NO learner name or email.
--   staff_support_reply       a staff message in the learner's chat; the ticket moves to waiting on the learner.
--   staff_support_assign      assign a ticket to a staff member, or take it back.
--   staff_support_set_status  open, waiting on the learner, solved (sets and clears solved_at), reopen.
--   staff_support_add_note    an internal note (support_notes; no learner-facing function can return one).
--
-- Every write changes the data AND writes its row in staff_audit_log (support.reply, support.assign, support.status,
-- support.note) in the same transaction, so a change and its record commit together or not at all. The record holds
-- ids and the status change only: never message text, never note text (a note's length is recorded, like staff_add_note).
-- The ticket is the reason, so the reason is a fixed word ("ticket reply" and so on) rather than free text.
--
-- All five are SECURITY DEFINER with search_path = '' and EXECUTE for service_role only. The console checks the scope
-- (support.read, support.reply, support.assign) before calling; these functions refuse what the data forbids: a
-- conversation that is still with the AI is not a ticket (staff cannot read, reply to, assign or annotate it), staff
-- cannot act on their own account's conversation, and an assignee must be active staff who may read support.
--
-- Status words written for the learner's chat: "This chat was marked solved." when a ticket is solved and
-- "This chat was reopened. A person will reply here." when it is reopened (system messages, milestone 2 draws them).
--
-- unopened (the blue dot): a new or open ticket for which no user.view row exists in staff_audit_log for that learner
-- since the conversation began. Opening a ticket in the console records exactly such a row (recordUserView).
--
-- Rollback: DROP FUNCTION public.staff_support_inbox(uuid,text,text,timestamptz,uuid,integer),
--   public.staff_support_reply(uuid,text,uuid,text), public.staff_support_assign(uuid,text,uuid,uuid),
--   public.staff_support_set_status(uuid,text,uuid,text), public.staff_support_add_note(uuid,text,uuid,text);

-- ---- the list ----
-- p_filter: open (new and open), waiting, solved, all. p_assigned: any, me, unassigned. Newest activity first; the
-- cursor is the (updated_at, id) of the last row of the previous page. At most 50 a page (25 by default). Conversations
-- still with the AI are never listed or counted. The snippet is the first thing the learner wrote.
CREATE FUNCTION public.staff_support_inbox(
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
  page_rows jsonb;
  has_more boolean;
  last_at timestamptz;
  last_id uuid;
  matching integer;
  counts jsonb;
BEGIN
  IF want_filter NOT IN ('open', 'waiting', 'solved', 'all') THEN
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

  SELECT count(*) INTO matching
    FROM public.support_conversations c
   WHERE c.status <> 'ai'
     AND CASE want_filter
           WHEN 'open' THEN c.status IN ('new', 'open')
           WHEN 'waiting' THEN c.status = 'waiting_learner'
           WHEN 'solved' THEN c.status = 'solved'
           ELSE true END
     AND CASE want_assigned
           WHEN 'me' THEN c.assigned_to = p_actor
           WHEN 'unassigned' THEN c.assigned_to IS NULL
           ELSE true END;

  WITH page AS (
    SELECT c.*, row_number() OVER (ORDER BY c.updated_at DESC, c.id DESC) AS rn
      FROM (
        SELECT c0.* FROM public.support_conversations c0
         WHERE c0.status <> 'ai'
           AND CASE want_filter
                 WHEN 'open' THEN c0.status IN ('new', 'open')
                 WHEN 'waiting' THEN c0.status = 'waiting_learner'
                 WHEN 'solved' THEN c0.status = 'solved'
                 ELSE true END
           AND CASE want_assigned
                 WHEN 'me' THEN c0.assigned_to = p_actor
                 WHEN 'unassigned' THEN c0.assigned_to IS NULL
                 ELSE true END
           AND (p_cursor_at IS NULL OR (c0.updated_at, c0.id) < (p_cursor_at, p_cursor_id))
         ORDER BY c0.updated_at DESC, c0.id DESC
         LIMIT page_size + 1
      ) c
  )
  SELECT
    coalesce(jsonb_agg(
      jsonb_build_object(
        'id', pg.id,
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
        'unopened', pg.status IN ('new', 'open') AND NOT EXISTS (
          SELECT 1 FROM public.staff_audit_log l
           WHERE l.action = 'user.view' AND l.target_user_id = pg.user_id AND l.at >= pg.created_at)
      ) ORDER BY pg.rn) FILTER (WHERE pg.rn <= page_size), '[]'::jsonb),
    coalesce(bool_or(pg.rn > page_size), false),
    (array_agg(pg.updated_at ORDER BY pg.rn) FILTER (WHERE pg.rn = page_size))[1],
    (array_agg(pg.id ORDER BY pg.rn) FILTER (WHERE pg.rn = page_size))[1]
  INTO page_rows, has_more, last_at, last_id
  FROM page pg;

  SELECT jsonb_build_object(
    'open', count(*) FILTER (WHERE c.status IN ('new', 'open')),
    'waiting', count(*) FILTER (WHERE c.status = 'waiting_learner'),
    'solved', count(*) FILTER (WHERE c.status = 'solved'),
    'all', count(*),
    'unassigned', count(*) FILTER (WHERE c.status <> 'solved' AND c.assigned_to IS NULL))
    INTO counts
    FROM public.support_conversations c
   WHERE c.status <> 'ai';

  RETURN jsonb_build_object(
    'tickets', page_rows,
    'total', matching,
    'counts', counts,
    'next', CASE WHEN has_more THEN jsonb_build_object('at', last_at, 'id', last_id) ELSE NULL END);
END;
$$;
REVOKE ALL ON FUNCTION public.staff_support_inbox(uuid, text, text, timestamptz, uuid, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staff_support_inbox(uuid, text, text, timestamptz, uuid, integer) TO service_role;

-- ---- reply ----
-- The staff message, the move to "waiting on the learner" and the record row, in one transaction. Refused for a
-- conversation still with the AI, a solved one (reopen it first) and the actor's own account.
CREATE FUNCTION public.staff_support_reply(p_actor uuid, p_role text, p_conversation uuid, p_body text)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  conv public.support_conversations%ROWTYPE;
  clean text := btrim(coalesce(p_body, ''));
  new_id bigint;
BEGIN
  IF p_actor IS NULL THEN
    RAISE EXCEPTION 'staff_support_reply: an actor is required' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO conv FROM public.support_conversations WHERE id = p_conversation FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'support: no such ticket' USING ERRCODE = 'P0002';
  END IF;
  IF conv.user_id = p_actor THEN
    RAISE EXCEPTION 'staff_support_reply: staff cannot act on their own account' USING ERRCODE = '42501';
  END IF;
  IF conv.status = 'ai' THEN
    RAISE EXCEPTION 'support: the conversation is still with the AI' USING ERRCODE = '55000';
  END IF;
  IF conv.status = 'solved' THEN
    RAISE EXCEPTION 'support: the ticket is solved; reopen it first' USING ERRCODE = '55000';
  END IF;
  IF char_length(clean) NOT BETWEEN 1 AND 4000 THEN
    RAISE EXCEPTION 'support: a reply must be 1 to 4000 characters' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.support_messages (conversation_id, user_id, author_kind, author_id, body)
  VALUES (conv.id, conv.user_id, 'staff', p_actor, clean)
  RETURNING id INTO new_id;
  UPDATE public.support_conversations
     SET status = 'waiting_learner', updated_at = now()
   WHERE id = conv.id;
  PERFORM public.staff_record(
    p_actor, p_role, 'support.reply', conv.user_id, 'ticket reply',
    jsonb_build_object('status', conv.status),
    jsonb_build_object('status', 'waiting_learner', 'message_id', new_id, 'conversation_id', conv.id), NULL);
  RETURN new_id;
END;
$$;
REVOKE ALL ON FUNCTION public.staff_support_reply(uuid, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staff_support_reply(uuid, text, uuid, text) TO service_role;

-- ---- assign ----
-- A NULL assignee takes the ticket back. Taking a new ticket moves it to open. TRUE when something changed, FALSE when
-- the ticket already had that assignee (nothing written, nothing recorded). The assignee must be active staff who may
-- read support (an owner, or a support member holding support.read); a member of admin_users with no staff_roles row
-- is the implicit owner.
CREATE FUNCTION public.staff_support_assign(p_actor uuid, p_role text, p_conversation uuid, p_assignee uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  conv public.support_conversations%ROWTYPE;
  member public.staff_roles%ROWTYPE;
  new_status text;
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
  new_status := CASE WHEN p_assignee IS NOT NULL AND conv.status = 'new' THEN 'open' ELSE conv.status END;
  UPDATE public.support_conversations
     SET assigned_to = p_assignee, status = new_status, updated_at = now()
   WHERE id = conv.id;
  PERFORM public.staff_record(
    p_actor, p_role, 'support.assign', conv.user_id, 'ticket assignment',
    jsonb_build_object('assigned_to', conv.assigned_to, 'status', conv.status),
    jsonb_build_object('assigned_to', p_assignee, 'status', new_status, 'conversation_id', conv.id), NULL);
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.staff_support_assign(uuid, text, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staff_support_assign(uuid, text, uuid, uuid) TO service_role;

-- ---- status ----
-- open, waiting_learner or solved. Solving sets solved_at and tells the learner; reopening (solved to open, the only
-- way out of solved) clears solved_at and tells the learner. If the learner has meanwhile started a new conversation,
-- the one-live-conversation index refuses the reopen (23505). TRUE when the status changed, FALSE when it already was
-- that status (nothing written, nothing recorded). 'new' and 'ai' cannot be set by staff.
CREATE FUNCTION public.staff_support_set_status(p_actor uuid, p_role text, p_conversation uuid, p_status text)
RETURNS boolean
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
  IF p_status = 'solved' THEN
    UPDATE public.support_conversations
       SET status = 'solved', solved_at = now(), updated_at = now()
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
    p_actor, p_role, 'support.status', conv.user_id, 'ticket status',
    jsonb_build_object('status', conv.status),
    jsonb_build_object('status', p_status, 'conversation_id', conv.id), NULL);
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.staff_support_set_status(uuid, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staff_support_set_status(uuid, text, uuid, text) TO service_role;

-- ---- note ----
-- An internal note. The text stays in support_notes; the record gets the note id and its length.
CREATE FUNCTION public.staff_support_add_note(p_actor uuid, p_role text, p_conversation uuid, p_body text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  conv public.support_conversations%ROWTYPE;
  clean text := btrim(coalesce(p_body, ''));
  new_id uuid;
BEGIN
  IF p_actor IS NULL THEN
    RAISE EXCEPTION 'staff_support_add_note: an actor is required' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO conv FROM public.support_conversations WHERE id = p_conversation FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'support: no such ticket' USING ERRCODE = 'P0002';
  END IF;
  IF conv.user_id = p_actor THEN
    RAISE EXCEPTION 'staff_support_add_note: staff cannot act on their own account' USING ERRCODE = '42501';
  END IF;
  IF conv.status = 'ai' THEN
    RAISE EXCEPTION 'support: the conversation is still with the AI' USING ERRCODE = '55000';
  END IF;
  IF char_length(clean) NOT BETWEEN 1 AND 2000 THEN
    RAISE EXCEPTION 'support: a note must be 1 to 2000 characters' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.support_notes (conversation_id, author_id, body)
  VALUES (conv.id, p_actor, clean)
  RETURNING id INTO new_id;
  PERFORM public.staff_record(
    p_actor, p_role, 'support.note', conv.user_id, 'ticket note', NULL,
    jsonb_build_object('note_id', new_id, 'length', char_length(clean), 'conversation_id', conv.id), NULL);
  RETURN new_id;
END;
$$;
REVOKE ALL ON FUNCTION public.staff_support_add_note(uuid, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staff_support_add_note(uuid, text, uuid, text) TO service_role;
