-- content_reports: stop clients choosing `id` and `created_at`.
--
-- The table-level INSERT grant to `authenticated` (20261006130000 kept it because the policy's WITH CHECK reads
-- `reporter`) let a client set created_at freely. notify_content_report() throttles per reporter on
-- `created_at > now() - interval '1 hour'`, so a back-dated row was never counted and the owner's inbox could be
-- flooded. Clients (iOS reportUser / reportTeamName, Android AiResponseReportClient) send only
-- reported, reason, kind and context; `reporter` stays grantable because the RLS policy requires it to equal
-- auth.uid() and it defaults to that.
--
-- Rollback: REVOKE INSERT (reporter, reported, reason, kind, context) ON public.content_reports FROM authenticated;
--           GRANT INSERT ON public.content_reports TO authenticated;
REVOKE INSERT ON public.content_reports FROM authenticated;
GRANT INSERT (reporter, reported, reason, kind, context) ON public.content_reports TO authenticated;
