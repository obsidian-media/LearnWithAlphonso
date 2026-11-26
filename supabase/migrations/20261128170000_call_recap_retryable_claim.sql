-- Call recap: a failed attempt no longer consumes the call.
--
-- Before: claim_call_recap set practice_calls.recap_at at CLAIM time, so a model failure or a memory-write error left the
-- call marked "recapped" for good (the learner got nothing and could never retry; in prod only 2 of 13 finished practice
-- calls ever produced a recap). Now there are two markers:
--   recap_claimed_at : an expiring in-progress claim (a 2 minute lease). Set by claim_call_recap, cleared by
--                      release_call_recap when an attempt fails, and ignored once the lease has run out, so a crashed
--                      request cannot lock the call either.
--   recap_at         : the COMPLETED marker. Set only by finish_call_recap, in the same transaction as the memory write.
-- finish_call_recap is idempotent: it writes the weakness events and memory lines through remember_call_recap and sets
-- recap_at in ONE transaction, and does nothing (returns -1) when the call is already completed, so a retry or a second
-- device can never double-count. A failure rolls the whole thing back and the call stays retryable.
--
-- Calls whose recap_at was set by the old claim stay as they are (they cannot be told apart from a completed recap).
--
-- Depends on practice_calls (20261107032021) and 20261119100000_call_recap_memory.sql (remember_call_recap). Version
-- 20261128170000 is after the trial_reminders migration (20261128150000) and the planned Hector one (about 20261128160000).
--
-- Rollback: re-create claim_call_recap as in 20261119100000, then
--   DROP FUNCTION public.finish_call_recap(uuid, text, uuid, text[], jsonb, boolean), public.release_call_recap(uuid, uuid);
--   ALTER TABLE public.practice_calls DROP COLUMN recap_claimed_at;

ALTER TABLE public.practice_calls ADD COLUMN recap_claimed_at timestamptz;

CREATE OR REPLACE FUNCTION public.claim_call_recap(_user_id uuid, _call_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  n integer;
BEGIN
  UPDATE public.practice_calls
    SET recap_claimed_at = now()
    WHERE id = _call_id AND user_id = _user_id AND finished_at IS NOT NULL AND recap_at IS NULL
      AND (recap_claimed_at IS NULL OR recap_claimed_at < now() - interval '2 minutes');
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n = 1;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_call_recap(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_call_recap(uuid, uuid) TO service_role;

-- Gives the claim back after a failed attempt so the client can try again straight away.
CREATE FUNCTION public.release_call_recap(_user_id uuid, _call_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  n integer;
BEGIN
  UPDATE public.practice_calls
    SET recap_claimed_at = NULL
    WHERE id = _call_id AND user_id = _user_id AND recap_at IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n = 1;
END;
$$;
REVOKE ALL ON FUNCTION public.release_call_recap(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_call_recap(uuid, uuid) TO service_role;

-- Writes the recap's weakness events and memory lines and marks the call completed, atomically. Returns the number of
-- memory lines written, or -1 when the call was already completed (nothing written). Empty arrays complete the call
-- without writing anything (a recap whose every line was filtered out).
CREATE FUNCTION public.finish_call_recap(
  _user_id uuid,
  _course text,
  _call_id uuid,
  _topics text[],
  _mistakes jsonb,
  _save boolean
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  saved integer;
BEGIN
  PERFORM 1 FROM public.practice_calls
    WHERE id = _call_id AND user_id = _user_id AND finished_at IS NOT NULL AND recap_at IS NULL
    FOR UPDATE;
  IF NOT FOUND THEN
    RETURN -1;
  END IF;
  saved := public.remember_call_recap(_user_id, _course, _call_id, _topics, _mistakes, _save);
  UPDATE public.practice_calls SET recap_at = now(), recap_claimed_at = NULL WHERE id = _call_id AND user_id = _user_id;
  RETURN saved;
END;
$$;
REVOKE ALL ON FUNCTION public.finish_call_recap(uuid, text, uuid, text[], jsonb, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_call_recap(uuid, text, uuid, text[], jsonb, boolean) TO service_role;
