# Learn With Alphonso — Gap Closure Plan

**Based on:** launch audit dated 2026-10-19  
**Outcome sought:** evidence-backed readiness for web public launch and iOS App Store/TestFlight launch.

## Phase 0 — Restore a trustworthy verification signal

**Priority:** P0  
**Owner:** engineering/release  
**Exit criteria:** a clean, reproducible CI run with published artifacts and no unexplained failure.

1. Run the repository's supported Bun version in CI or a clean machine with enough memory. Record Bun, Node, OS, Supabase, Xcode, and browser versions.
2. Triage the generated lexicon/romance tests. Determine whether the source/bundle expectation is stale, the generated asset is missing, or the test has an environment-sensitive path.
3. Triage the V8 OOM and the AI safety/consent/account-deletion timeouts separately. Do not hide them with larger timeouts until the underlying resource or mock issue is understood.
4. Run lint, typecheck, unit tests, coverage, web/admin builds, Playwright, signed-in E2E, Deno tests, migration checks, and content checks as separate recorded jobs.
5. Add a CI artifact with test summaries and failure logs so a future release decision is evidence-based.

## Phase 1 — Finish low-risk security/privacy hardening

**Priority:** P1  
**Owner:** web/backend  
**Exit criteria:** stable public error contracts, deletion regression coverage, and deployed headers verified.

1. Add tests proving the three Edge Functions never expose Zod `details` for malformed input.
2. Add an account-deletion test where one owned-table delete returns an error; assert auth deletion is not attempted and the client receives a safe stable error.
3. Normalize account-delete/account-export API error responses to a public code/message while logging the underlying error server-side.
4. Add the same baseline headers to any separately served admin boundary and verify learner/admin staging responses.
5. Design a nonce/hash-based CSP for the inline theme bootstrap instead of enabling a broad `unsafe-inline` policy.
6. Decide and document HSTS ownership: Vercel/platform configuration or application response, with HTTPS-only behavior.

## Phase 2 — Eliminate completion integrity races

**Priority:** P1 / release blocker  
**Owner:** backend/database  
**Exit criteria:** two simultaneous completions cannot lose or duplicate state, and retries are idempotent.

1. Map every state mutated by web and iOS lesson completion: completion rows, XP, streak, activity, hearts, unlocks, SRS/review state, and idempotency/session records.
2. Move all dependent reads and writes into one SQL transaction/RPC.
3. Lock the user state row (or use a carefully scoped advisory lock) and enforce a unique idempotency key for a completion attempt.
4. Keep server-side answer regrading and lesson-session validation inside the same transaction boundary where possible.
5. Add database/integration tests for same attempt retry, two different attempts in parallel, two devices, and failure/retry after a partial upstream response.
6. Exercise the native iOS client against the new RPC before deploying it to production.

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

- Sanitized malformed-body responses in `supabase/functions/grade-review/index.ts`, `supabase/functions/start-lesson-session/index.ts`, and `supabase/functions/complete-lesson/handler.ts`.
- Added owned-table deletion error inspection in `src/lib/account.functions.ts`.
- Added baseline browser security headers in `src/server.ts`.
- Added regression coverage for the sanitized completion response, partial account-deletion failure, and baseline SSR headers.

Phase 1 is partially complete. The implementation and regression tests are committed. Focused verification passes: 49/49 Vitest tests for server/account behavior and 17/17 Deno completion-handler tests. The clean supported full-suite run remains a release gate because the earlier repository-wide attempt could not complete.

## Do not do yet

- Do not ship a partial concurrency fix that moves only one write under a lock while leaving related XP/streak/hearts writes outside the transaction.
- Do not mark iOS ready based solely on an archive succeeding; device, TestFlight, RevenueCat, push, accessibility, and account-deletion evidence are required.
- Do not suppress the failing tests or increase timeouts without recording the root cause.
