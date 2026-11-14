-- In-app Help chat, milestone 1: the data and the learner-side functions.
--
--   support_conversations  one open conversation per learner (a partial unique index), with its status and hand-off.
--   support_messages       append-only transcript: learner, ai, staff and system rows.
--   support_notes          internal staff notes, in their own table so no learner-facing query can return one.
--
-- Deviation from the design wording "learners read via RLS": there is NO client access at all. RLS is on with zero
-- policies and anon/authenticated hold no privileges, so a client cannot read or write a row directly. Learners read
-- through our own API (the service role), because the AI summary, the hand-off reason and the facts snapshot must not
-- be visible to the learner and column-level policies are easy to get wrong. The learner's view is built by
-- support_learner_view(), which returns only id, kind, body and time.
--
-- Every write is a SECURITY DEFINER function (search_path = '', EXECUTE for service_role only). service_role itself
-- can only SELECT the two conversation tables, so it cannot forge a row, edit a message or skip a cap.
--
-- support_messages is append-only (a trigger raises on UPDATE and TRUNCATE, and on DELETE unless the retention
-- function set lwa.support_retention = 'on' or the parent conversation or account is already gone, which is the
-- ON DELETE CASCADE path that account deletion takes).
--
-- Also: app_switches gets a 'support_ai' key, inserted OFF, so AI answers are off from day one. To turn them on:
--   UPDATE public.app_switches SET enabled = true, updated_at = now() WHERE key = 'support_ai';
--
-- Rollback: DROP the three tables and the support_* functions; restore the app_switches check
-- (key IN ('ai', 'tutor')) after deleting the 'support_ai' row.

-- ---- the AI switch ----
ALTER TABLE public.app_switches DROP CONSTRAINT app_switches_key_check;
ALTER TABLE public.app_switches
  ADD CONSTRAINT app_switches_key_check CHECK (key IN ('ai', 'tutor', 'support_ai'));
INSERT INTO public.app_switches (key, enabled, note) VALUES
  ('support_ai', false, 'AI answers in the Help chat. Off at launch: every message goes to a person.')
ON CONFLICT (key) DO NOTHING;

-- ---- tables ----
-- client-grants: none public.support_conversations
CREATE TABLE public.support_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'ai' CHECK (status IN ('ai', 'new', 'open', 'waiting_learner', 'solved')),
  -- Set by the server from the X-Client header, else 'web'. Display only.
  channel text NOT NULL DEFAULT 'web' CHECK (channel IN ('web', 'ios', 'android')),
  -- A plain id, no foreign key, like the action record: it outlives the staff member.
  assigned_to uuid,
  handoff_reason text CHECK (handoff_reason IN
    ('learner_asked', 'ai_unsure', 'sensitive_topic', 'ai_unavailable', 'quota', 'ai_error')),
  -- An enum, never free text, so a learner cannot write text the AI later reads back.
  topic text CHECK (topic IN
    ('billing', 'pro', 'restore', 'streak', 'league', 'account', 'privacy', 'bug', 'other')),
  ai_summary text CHECK (char_length(ai_summary) <= 600),
  learner_last_read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  solved_at timestamptz
);
-- One live conversation per learner; any number of solved ones.
CREATE UNIQUE INDEX support_conversations_one_open
  ON public.support_conversations (user_id) WHERE status <> 'solved';
CREATE INDEX support_conversations_inbox ON public.support_conversations (status, updated_at);
CREATE INDEX support_conversations_user ON public.support_conversations (user_id, created_at DESC);

-- client-grants: none public.support_messages
CREATE TABLE public.support_messages (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES public.support_conversations(id) ON DELETE CASCADE,
  -- The learner. Copied so export and retention need no join.
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  author_kind text NOT NULL CHECK (author_kind IN ('learner', 'ai', 'staff', 'system')),
  -- The staff member for 'staff' rows; null otherwise. Never shown to the learner.
  author_id uuid,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
  -- Only on 'ai' rows: the exact facts snapshot the AI saw for that turn.
  ai_facts jsonb,
  -- A retried POST does not double-post.
  client_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ai_facts IS NULL OR author_kind = 'ai'),
  CHECK (author_id IS NULL OR author_kind = 'staff')
);
CREATE UNIQUE INDEX support_messages_client_id
  ON public.support_messages (conversation_id, client_id) WHERE client_id IS NOT NULL;
CREATE INDEX support_messages_conversation ON public.support_messages (conversation_id, id);
CREATE INDEX support_messages_user_day ON public.support_messages (user_id, created_at) WHERE author_kind = 'learner';

-- client-grants: none public.support_notes
CREATE TABLE public.support_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.support_conversations(id) ON DELETE CASCADE,
  author_id uuid NOT NULL,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX support_notes_conversation ON public.support_notes (conversation_id, created_at);

ALTER TABLE public.support_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_notes ENABLE ROW LEVEL SECURITY;
-- service_role is revoked too: Supabase's default privileges hand it ALL on every new table, which would let it
-- insert or edit rows directly and skip every cap. Found by executing this against the real project (rolled back).
REVOKE ALL ON public.support_conversations, public.support_messages, public.support_notes
  FROM PUBLIC, anon, authenticated, service_role;
-- Reads only: every write is a function below (or, for staff notes, a milestone 3 function).
GRANT SELECT ON public.support_conversations, public.support_messages, public.support_notes TO service_role;

-- ---- messages are append-only ----
CREATE FUNCTION public.support_messages_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- The retention function, or the cascade from a deleted conversation or account (the parent row is already gone).
    IF current_setting('lwa.support_retention', true) = 'on'
       OR NOT EXISTS (SELECT 1 FROM public.support_conversations c WHERE c.id = OLD.conversation_id)
       OR NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = OLD.user_id) THEN
      RETURN OLD;
    END IF;
  END IF;
  RAISE EXCEPTION 'support_messages is append-only' USING ERRCODE = '42501';
END;
$$;
REVOKE ALL ON FUNCTION public.support_messages_append_only() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER support_messages_no_change
  BEFORE UPDATE OR DELETE ON public.support_messages
  FOR EACH ROW EXECUTE FUNCTION public.support_messages_append_only();
CREATE TRIGGER support_messages_no_truncate
  BEFORE TRUNCATE ON public.support_messages
  FOR EACH STATEMENT EXECUTE FUNCTION public.support_messages_append_only();

-- ---- learner-side functions ----

-- The learner's live conversation; reopens one solved less than 7 days ago; else starts a new one. Safe under two
-- parallel calls: the partial unique index decides, the loser re-reads.
CREATE FUNCTION public.support_open_conversation(p_user uuid, p_channel text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  found_id uuid;
  chan text := coalesce(p_channel, 'web');
BEGIN
  IF p_user IS NULL THEN
    RAISE EXCEPTION 'support_open_conversation: a learner is required' USING ERRCODE = '22023';
  END IF;
  IF chan NOT IN ('web', 'ios', 'android') THEN
    chan := 'web';
  END IF;
  FOR attempt IN 1..3 LOOP
    SELECT c.id INTO found_id FROM public.support_conversations c
     WHERE c.user_id = p_user AND c.status <> 'solved';
    IF found_id IS NOT NULL THEN
      RETURN found_id;
    END IF;
    BEGIN
      SELECT c.id INTO found_id FROM public.support_conversations c
       WHERE c.user_id = p_user AND c.status = 'solved' AND c.solved_at > now() - interval '7 days'
       ORDER BY c.solved_at DESC LIMIT 1
       FOR UPDATE;
      IF found_id IS NOT NULL THEN
        UPDATE public.support_conversations
           SET status = 'open', solved_at = NULL, updated_at = now()
         WHERE id = found_id;
        RETURN found_id;
      END IF;
      INSERT INTO public.support_conversations (user_id, channel) VALUES (p_user, chan)
      RETURNING id INTO found_id;
      RETURN found_id;
    EXCEPTION WHEN unique_violation THEN
      -- A parallel call created or reopened one first: read it on the next pass.
      found_id := NULL;
    END;
  END LOOP;
  RAISE EXCEPTION 'support_open_conversation: could not settle on one conversation' USING ERRCODE = '40001';
END;
$$;

-- Adds the learner's message. Checks the conversation is theirs, retries are free, then the daily cap (50 learner
-- messages across all their conversations, UTC day) and the per-conversation cap (100). A learner writing while a
-- person waits on them moves the conversation back to 'open'.
CREATE FUNCTION public.support_add_learner_message(
  p_user uuid, p_conversation uuid, p_body text, p_client_id uuid
) RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  conv public.support_conversations%ROWTYPE;
  existing bigint;
  new_id bigint;
  today_count integer;
  conv_count integer;
  clean text := btrim(coalesce(p_body, ''));
BEGIN
  SELECT * INTO conv FROM public.support_conversations
   WHERE id = p_conversation AND user_id = p_user
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'support: not your conversation' USING ERRCODE = '42501';
  END IF;
  IF conv.status = 'solved' THEN
    RAISE EXCEPTION 'support: conversation is solved' USING ERRCODE = '55000';
  END IF;
  IF char_length(clean) NOT BETWEEN 1 AND 2000 THEN
    RAISE EXCEPTION 'support: message must be 1 to 2000 characters' USING ERRCODE = '22023';
  END IF;

  IF p_client_id IS NOT NULL THEN
    SELECT m.id INTO existing FROM public.support_messages m
     WHERE m.conversation_id = p_conversation AND m.client_id = p_client_id;
    IF existing IS NOT NULL THEN
      RETURN existing;
    END IF;
  END IF;

  SELECT count(*) INTO today_count FROM public.support_messages m
   WHERE m.user_id = p_user AND m.author_kind = 'learner'
     AND m.created_at >= (date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC');
  IF today_count >= 50 THEN
    RAISE EXCEPTION 'support_daily_cap' USING ERRCODE = '54000';
  END IF;
  SELECT count(*) INTO conv_count FROM public.support_messages m
   WHERE m.conversation_id = p_conversation AND m.author_kind = 'learner';
  IF conv_count >= 100 THEN
    RAISE EXCEPTION 'support_conversation_cap' USING ERRCODE = '54000';
  END IF;

  INSERT INTO public.support_messages (conversation_id, user_id, author_kind, body, client_id)
  VALUES (p_conversation, p_user, 'learner', clean, p_client_id)
  RETURNING id INTO new_id;
  UPDATE public.support_conversations
     SET updated_at = now(),
         status = CASE WHEN status = 'waiting_learner' THEN 'open' ELSE status END
   WHERE id = p_conversation;
  RETURN new_id;
END;
$$;

-- The AI's reply. Only while the conversation is still with the AI (a person may have taken it meanwhile: NULL, and
-- nothing is written). With p_handoff {reason, topic, summary}, moves 'ai' to 'new' and records why.
CREATE FUNCTION public.support_add_ai_message(
  p_conversation uuid, p_body text, p_facts jsonb, p_handoff jsonb
) RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  conv public.support_conversations%ROWTYPE;
  new_id bigint;
BEGIN
  SELECT * INTO conv FROM public.support_conversations WHERE id = p_conversation FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'support: no such conversation' USING ERRCODE = '42704';
  END IF;
  IF conv.status <> 'ai' THEN
    RETURN NULL;
  END IF;
  INSERT INTO public.support_messages (conversation_id, user_id, author_kind, body, ai_facts)
  VALUES (p_conversation, conv.user_id, 'ai', p_body, p_facts)
  RETURNING id INTO new_id;
  IF p_handoff IS NOT NULL THEN
    UPDATE public.support_conversations
       SET status = 'new',
           handoff_reason = p_handoff->>'reason',
           topic = p_handoff->>'topic',
           ai_summary = nullif(p_handoff->>'summary', ''),
           updated_at = now()
     WHERE id = p_conversation;
    INSERT INTO public.support_messages (conversation_id, user_id, author_kind, body)
    VALUES (p_conversation, conv.user_id, 'system', 'A person will reply here.');
  ELSE
    UPDATE public.support_conversations SET updated_at = now() WHERE id = p_conversation;
  END IF;
  RETURN new_id;
END;
$$;

-- The "Talk to a person" button and every server-forced hand-off. TRUE when it moved the conversation, FALSE when a
-- person already has it (nothing changes).
CREATE FUNCTION public.support_handoff(
  p_user uuid, p_conversation uuid, p_reason text, p_topic text, p_summary text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  conv public.support_conversations%ROWTYPE;
BEGIN
  SELECT * INTO conv FROM public.support_conversations
   WHERE id = p_conversation AND user_id = p_user
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'support: not your conversation' USING ERRCODE = '42501';
  END IF;
  IF conv.status = 'solved' THEN
    RAISE EXCEPTION 'support: conversation is solved' USING ERRCODE = '55000';
  END IF;
  IF conv.status <> 'ai' THEN
    RETURN false;
  END IF;
  UPDATE public.support_conversations
     SET status = 'new', handoff_reason = p_reason, topic = p_topic,
         ai_summary = nullif(btrim(coalesce(p_summary, '')), ''), updated_at = now()
   WHERE id = p_conversation;
  INSERT INTO public.support_messages (conversation_id, user_id, author_kind, body)
  VALUES (p_conversation, p_user, 'system', 'A person will reply here.');
  RETURN true;
END;
$$;

-- The learner's whole view of their latest conversation, and nothing else: id, kind, body, time. No author ids, no
-- summary, no facts, no notes. Marks it read. NULL when they never wrote.
CREATE FUNCTION public.support_learner_view(p_user uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  conv public.support_conversations%ROWTYPE;
  unread integer;
  msgs jsonb;
BEGIN
  SELECT * INTO conv FROM public.support_conversations
   WHERE user_id = p_user ORDER BY created_at DESC LIMIT 1;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  SELECT count(*) INTO unread FROM public.support_messages m
   WHERE m.conversation_id = conv.id AND m.author_kind = 'staff'
     AND (conv.learner_last_read_at IS NULL OR m.created_at > conv.learner_last_read_at);
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', t.id,
           'kind', CASE t.author_kind WHEN 'learner' THEN 'you' WHEN 'staff' THEN 'support' ELSE t.author_kind END,
           'body', t.body,
           'at', t.created_at) ORDER BY t.id), '[]'::jsonb)
    INTO msgs
    FROM (SELECT m.id, m.author_kind, m.body, m.created_at FROM public.support_messages m
           WHERE m.conversation_id = conv.id ORDER BY m.id DESC LIMIT 200) t;
  UPDATE public.support_conversations SET learner_last_read_at = now() WHERE id = conv.id;
  RETURN jsonb_build_object('status', conv.status, 'unread', unread, 'messages', msgs);
END;
$$;

REVOKE ALL ON FUNCTION public.support_open_conversation(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.support_open_conversation(uuid, text) TO service_role;
REVOKE ALL ON FUNCTION public.support_add_learner_message(uuid, uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.support_add_learner_message(uuid, uuid, text, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.support_add_ai_message(uuid, text, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.support_add_ai_message(uuid, text, jsonb, jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.support_handoff(uuid, uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.support_handoff(uuid, uuid, text, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.support_learner_view(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.support_learner_view(uuid) TO service_role;
