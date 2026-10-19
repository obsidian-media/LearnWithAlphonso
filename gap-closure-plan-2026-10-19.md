# Learn With Alphonso — Gap Closure Plan

**Based on:** launch audit dated 2026-10-19  
**Outcome sought:** evidence-backed readiness for web public launch and iOS App Store/TestFlight launch.

## Phase 0 — Establish a reproducible verification baseline

**Priority:** P1
**Owner:** engineering/release  
**Status (2026-10-19):** Main's supported Bun CI passed all jobs in run 39183037153, including tests, E2E, Deno, iOS builds/tests, content/type checks, and deployment. Bun remains blocked locally; this branch has not run CI because it has no PR.
**Exit criteria:** clean, reproducible CI run with published artifacts and no unexplained failure.

1. Main baseline verified by GitHub Actions run 39183037153 (`6749f18`); record Bun version 1.3.10 and the Ubuntu 24.04 runner from its job log. The local Bun binary is blocked by Windows ACL (`Access is denied`). Run the same suite on this branch once a PR/owner-authorized CI path exists.
2. Fix the local tooling traversal failures: install the declared missing test dependency and skip ignored hidden metadata in source scanners; both are now fixed on this branch.
3. Run and record the web unit suite, lint, typecheck, and learner/admin builds; completed locally with 3,668 passing tests, 8 skipped tests, lint at zero errors, successful typecheck, and both builds successful.
4. Playwright, signed-in E2E, Deno, migration/content checks, and deploy passed on main in run 39183037153. Branch-specific result remains to verify.
5. Keep CI artifacts with test summaries and failure logs so release decisions are evidence-based.

## Phase 1 — Finish low-risk security/privacy hardening

**Priority:** P1  
**Owner:** web/backend  
**Exit criteria:** stable public error contracts and deletion regression coverage pass; deployed headers are verified.

1. Add tests proving the three Edge Functions never expose Zod `details` for malformed input.
2. Add an account-deletion test where one owned-table delete returns an error; assert auth deletion is not attempted and the client receives a safe stable error.
3. Normalize account-delete/account-export API error responses to public messages and correct statuses while logging underlying errors server-side; implemented and covered by route tests.
4. Add the same baseline headers to any separately served admin boundary and verify learner/admin staging responses.
5. Design a nonce/hash-based CSP for the inline theme bootstrap instead of enabling a broad `unsafe-inline` policy.
6. Decide and document HSTS ownership: Vercel/platform configuration or application response, with HTTPS-only behavior.

## Phase 2 — Verify atomic completion deployment

**Priority:** P1 release verification
**Owner:** backend/database  
**Exit criteria:** two simultaneous completions cannot lose or duplicate state, and retries are idempotent.

1. Production deploy job 39183037153 reports “Remote database is up to date,” confirming migration `20261014100300_atomic_lesson_completion.sql` was present by that run. Add/retain an explicit database concurrency test and assert the service-role-only RPC grants.
2. Preserve the existing concurrency design: the RPC locks the auth/progress rows and rejects stale row-version snapshots; the web retries fresh snapshots and iOS queues transient 5xx results with backoff.
3. Keep the current web/iOS retry tests; add a live database concurrent-call integration test if the Supabase test harness supports deterministic transaction contention.
4. Record production migration version and the result of the concurrency check in the release evidence.

## Phase 3 — Production observability and support

**Priority:** P1  
**Owner:** operations/product  
**Exit criteria:** on-call can detect, diagnose, and communicate every critical failure mode.

1. Choose/configure centralized exception and client-crash reporting for web and iOS.
2. Add dashboards/alerts for auth, 4xx/5xx, AI consent/quota, NVIDIA/Deepgram latency/error rate, lesson completion, review grading, push delivery, RevenueCat entitlement/webhook drift, and account deletion failures.
3. Add request correlation IDs across web/API/Edge Function logs without logging tokens, answers, transcripts, or unnecessary personal data.
4. Define severity, owner, alert threshold, and runbook for each service.
5. Perform a controlled failure drill: provider outage, Supabase timeout, RevenueCat mismatch, push failure, and account deletion partial failure.

## Phase 4 — iOS/TestFlight/device sign-off

**Priority:** P0/P1  
**Owner:** iOS/release/product  
**Exit criteria:** exact production candidate passes the dated device matrix and is ready for review.

1. Archive/export the exact candidate through `ios-release.yml`; record build number, IPA validation, signing profile, entitlements, privacy manifest, and RevenueCat key check.
2. Test on at least one current and one older supported physical iPhone and a poor-network condition.
3. Cover auth/account switching, lesson finish, review, hearts, offline/retry, conversation STT/chat/TTS, Hector entitlement, purchase/restore/expiry, push, notification tap, logout, and deletion.
4. Run VoiceOver, Dynamic Type, reduced-motion, contrast, and hit-target checks.
5. Verify App Store Connect agreement, subscription products/offering, review notes, demo account, screenshots, privacy/support/report URLs, and phased release/rollback owner.

## Phase 5 — Content and launch rehearsal

**Priority:** P1/P2  
**Owner:** content/product/marketing  
**Exit criteria:** launch content and operational ownership are signed off.

1. Have native speakers review French and Spanish across every CEFR level and question type, including audio and accepted answers.
2. Run a fresh accessibility smoke pass on all primary web routes and the iOS candidate.
3. Execute a launch rehearsal using production-like data: signup, first lesson, review, AI consent, quota exhaustion, purchase, deletion, support request, and recovery.
4. Confirm analytics events and privacy boundaries for conversion, completion, retention, AI, purchase, and error states.
5. Publish a one-page go/no-go record with exact artifact versions, evidence links, known risks, owners, and rollback steps.

## Work started in this turn

### Phase 1 — CI baseline and rate-limit resilience (2026-10-19)

- Verified all jobs in CI run 39183037153 passed on `main` (`6749f18`); the Supabase deployment step reports the remote database is up to date. This is baseline evidence, not a result for this branch.
- The local Bun executable remains unavailable (`Access is denied`). No PR was opened, so branch CI has not been triggered.
- Current Vocab image links workflow run 39259158886 failed because many Supabase Storage HEAD requests received HTTP 429. `link-check.ts` now retries bounded 429/5xx responses with backoff and the scheduled checker uses concurrency 2. Focused tests pass 10/10; a future scheduled/dispatch run must verify the live rate-limit behavior.
- App Store release-ops run 39186960541 failed its age-rating check: live contests=`INFREQUENT`, expected=`INFREQUENT_OR_MILD`, computed rating=`FOUR_PLUS` vs the owner's 13+ decision. This requires owner confirmation before any metadata write.

- Sanitized malformed-body responses in `supabase/functions/grade-review/index.ts`, `supabase/functions/start-lesson-session/index.ts`, and `supabase/functions/complete-lesson/handler.ts`.
- Added owned-table deletion error inspection in `src/lib/account.functions.ts`.
- Normalized account export/deletion HTTP errors to stable public messages/statuses and kept exception details in server logs.
- Added baseline browser security headers in `src/server.ts`.
- Added regression coverage for the sanitized completion response, partial account-deletion failure, and baseline SSR headers.
- Added route tests for safe account export/deletion error contracts.

Phase 1 code hardening is implemented and covered by focused tests. The full local web suite passed before the final account-route update; after that update, the focused account tests (47/47), lint, typecheck, and learner build passed. Deployed header verification remains open; the full supported Bun/CI run is tracked in Phase 0.

## Do not do yet

- The core completion transaction and native retry behavior already exist. Verify production migration state before proposing changes to this path.
- Do not mark iOS ready based solely on an archive succeeding; device, TestFlight, RevenueCat, push, accessibility, and account-deletion evidence are required.
- Do not suppress the failing tests or increase timeouts without recording the root cause.
