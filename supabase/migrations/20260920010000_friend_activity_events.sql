-- Friends activity feed (V2 kickoff doc's "Deepened feature 1" for
-- friends): a lightweight event log so iOS/web can show "Maria completed
-- a lesson," "Jake hit a 7-day streak," etc. Written by complete-lesson
-- (the only place XP/streak/league state actually changes) using its
-- existing service-role admin client -- no new trust concern, that
-- function is already the authority on all of these facts. Read directly
-- by clients via RLS, same direct-PostgREST pattern as review_items.
--
-- RLS here is genuinely different from every other per-user table in this
-- schema (review_items, user_progress, etc. are all strictly
-- auth.uid()-scoped, readable only by their own owner): a user's accepted
-- friends need read access too, joined through friendships.
CREATE TABLE public.friend_activity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('lesson_completed', 'streak_milestone', 'league_promotion')),
  payload jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX friend_activity_events_user_id_created_at_idx
  ON public.friend_activity_events (user_id, created_at DESC);

ALTER TABLE public.friend_activity_events ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.friend_activity_events TO authenticated;
GRANT ALL ON public.friend_activity_events TO service_role;
REVOKE ALL ON public.friend_activity_events FROM PUBLIC, anon;

-- (select auth.uid()) rather than bare auth.uid(), matching this
-- project's own perf-audit finding (see
-- 20260918150000_optimize_rls_auth_uid.sql) from the start.
CREATE POLICY "friend_activity_readable_by_friends" ON public.friend_activity_events
  FOR SELECT TO authenticated
  USING (
    (select auth.uid()) = user_id
    OR EXISTS (
      SELECT 1 FROM public.friendships f
      WHERE f.user_id = (select auth.uid())
        AND f.friend_id = friend_activity_events.user_id
        AND f.status = 'accepted'
    )
  );
