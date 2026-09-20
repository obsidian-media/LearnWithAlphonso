-- V3 package 3b: durable log of weakness detect/resolve events, so a
-- trend dashboard can show improvement over time -- review_items rows
-- themselves get DELETED on retirement (see grade-review's retire path),
-- so they can't serve as history once a weakness is actually mastered.
--
-- Unlike the gamification-value tables (user_progress/language_progress/
-- etc.), this is a plain append-only personal log with no currency or
-- reward attached -- there's no cheat value in a user fabricating their
-- own weakness-event history (worst case: their own trend view looks
-- better than reality, which affects nobody else and grants nothing).
-- Direct INSERT under RLS is the right call here, same precedent as
-- friend_activity_events, not the RPC-only pattern the reward-bearing
-- tables need.
CREATE TABLE public.weakness_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category text NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('detected', 'resolved')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.weakness_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY weakness_events_select_own ON public.weakness_events FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY weakness_events_insert_own ON public.weakness_events FOR INSERT
  WITH CHECK (auth.uid() = user_id);
GRANT SELECT, INSERT ON public.weakness_events TO authenticated;

CREATE INDEX weakness_events_user_category_idx ON public.weakness_events (user_id, category, created_at);
