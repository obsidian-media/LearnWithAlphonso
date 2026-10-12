-- Subscriber records still to be erased at RevenueCat after an account was deleted.
--
-- Deleting an account erases its subscriber record at RevenueCat. When that call fails the account is already
-- gone, and the only trace used to be a log line carrying the account id. The id now waits here instead, and the
-- scheduled maintenance pass (run_maintenance_sweep, 20261015100000_maintenance_sweep.sql) retries the erase. A
-- row is removed on success, or after 30 days with an email to the owner so it can be erased by hand.
--
-- app_user_id is the deleted account's id, which is the identifier RevenueCat knows the subscriber by. It has no
-- foreign key: the account row no longer exists. Service role only.
--
-- Rollback: DROP TABLE public.revenuecat_erasure_pending;

-- client-grants: none public.revenuecat_erasure_pending
CREATE TABLE public.revenuecat_erasure_pending (
  app_user_id uuid PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_attempt_at timestamptz
);
ALTER TABLE public.revenuecat_erasure_pending ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.revenuecat_erasure_pending FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.revenuecat_erasure_pending TO service_role;
