-- A Hector call is saved once: the claim /api/hector-call-end takes before it spends quota or asks the model.
--
-- The route used to check tutor_memory.call_id and then call remember_call_recap. Two concurrent requests for the
-- same call both passed the check (both charged quota, both ran the model, both inserted weakness_events), and a
-- retry of an OLDER call passed too, because tutor_memory.call_id is overwritten by later calls on the same topic.
-- This table is the atomic claim: one row per (learner, call), inserted before any spend; a primary key conflict
-- means the call was already taken. The route releases the claim (deletes the row) only when it failed before the
-- write and a retry is safe; otherwise the row stays.
--
--   hector_call_ends   service role only (the route uses supabaseAdmin). Goes with the account (ON DELETE CASCADE)
--                      and is part of the GDPR export, read with the service role.
--
-- Depends on 20261128150000 (the newest migration when this was written; nothing here reads it).
--
-- Rollback: DROP TABLE public.hector_call_ends;

-- client-grants: none public.hector_call_ends
CREATE TABLE public.hector_call_ends (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  call_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, call_id)
);
ALTER TABLE public.hector_call_ends ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hector_call_ends FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.hector_call_ends TO service_role;
