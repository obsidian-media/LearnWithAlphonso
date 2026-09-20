-- Nudge-a-friend (V2 kickoff doc's "Deepened feature 2" for friends).
-- Deliberately the *weaker* V2 approach the doc itself flagged: a
-- polling-based ping (the recipient's app checks for unread nudges on
-- foreground and shows an in-app banner), not real APNs push -- so a
-- nudge only surfaces once the recipient next opens the app, not the
-- instant it's sent. See ARCHITECTURE.md's "Native iOS app" section for
-- what a real V3 push-based version needs (device tokens, an APNs Auth
-- Key, a server-side trigger) before treating this table's shape as
-- final; V3 may want to extend or replace it.
--
-- No per-day rate limit enforced server-side for this V2 slice -- the
-- client applies a soft cooldown (disable the button for a friend
-- recently nudged) rather than a hard database constraint, consistent
-- with this being a stepping-stone feature, not the finished one.
CREATE TABLE public.nudges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  CHECK (sender_id <> recipient_id)
);

CREATE INDEX nudges_recipient_id_read_at_idx ON public.nudges (recipient_id, read_at);

ALTER TABLE public.nudges ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON public.nudges TO authenticated;
GRANT ALL ON public.nudges TO service_role;
REVOKE ALL ON public.nudges FROM PUBLIC, anon;

-- Recipient reads their own nudges (to check for unread ones on
-- foreground). Sender intentionally has no read access here -- the client
-- tracks its own recent-nudge cooldown locally instead of querying this
-- table, so no "did I already nudge them" read path is needed.
CREATE POLICY "nudges_select_recipient" ON public.nudges
  FOR SELECT TO authenticated
  USING ((select auth.uid()) = recipient_id);

-- Sender can only nudge an accepted friend -- the same trust boundary
-- accept_friend_invite/get_friends_progress already establish.
CREATE POLICY "nudges_insert_to_friend" ON public.nudges
  FOR INSERT TO authenticated
  WITH CHECK (
    (select auth.uid()) = sender_id
    AND EXISTS (
      SELECT 1 FROM public.friendships f
      WHERE f.user_id = (select auth.uid())
        AND f.friend_id = nudges.recipient_id
        AND f.status = 'accepted'
    )
  );

-- Recipient marks their own nudges read once shown.
CREATE POLICY "nudges_update_recipient_read" ON public.nudges
  FOR UPDATE TO authenticated
  USING ((select auth.uid()) = recipient_id)
  WITH CHECK ((select auth.uid()) = recipient_id);
