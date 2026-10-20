# Learn With Alphonso — Gap Closure Plan

**Based on:** launch audit dated 2026-10-19  
**Outcome sought:** evidence-backed readiness for web public launch and iOS App Store/TestFlight launch.

## Follow-on backlog work — status 2026-10-20

This work is in progress on `Codex-pre-Launch` after the original five hardening items passed CI. Reconciliation confirmed Android save-any-word was already implemented in PR #325; its outstanding portion is real-device verification, not duplicate code. French/Spanish native-speaker review likewise remains a human content-approval gate. The still-open repository tasks are offline review conflict handling and streak continuity, the iOS podcast scrubber, and vocab-image quality-review automation. The iOS scrubber now has a seek command and accessible Slider in the mini-player; local Swift execution is unavailable in this Windows environment, so the iOS app-build CI must verify compilation. Remaining work and verification status will be appended here as each task closes.

### Phase 3 — Cross-device review concurrency and offline streak continuity (2026-10-20)

**Implementation status:** Added expected `due_on`/`last_reviewed_at` snapshots to web-compatible review grade requests from iOS and Android. The edge function rejects superseded snapshots before computing a grade, while the database compare-and-swap still handles a race between the read and write. Pending review grades persist their snapshot across offline retries (SwiftData optional fields; Android Room migration 3→4). Lesson completion now accepts an optional completion timestamp only when it is bounded by the signed lesson-session issue time and server receive time; the original UTC activity day is preserved across midnight, without allowing a client to backdate before the session or overwrite a later recorded day. Expired-session reminting drops the client timestamp.

**Verification:** `deno test --no-lock supabase/functions/grade-review/` — 18/18 passed. `deno test --no-lock --no-check supabase/functions/complete-lesson/` — 26/26 passed; the normal checked run stalled during Deno checking, so this result does not claim type-check coverage. Android `./gradlew :core:test` — passed. Android app tests require a configured SDK; iOS/macOS tests and migration/runtime behavior require branch CI and devices. The signed-session date helper has focused tests for midnight crossing and before-issue/after-receive rejection.

**Remaining:** Finish UI/reporting behavior for a superseded grade, run full PR CI (including Android app and iOS), and device-check queued retries across sign-in/session refresh. Keep launch blocked on those checks until evidence exists.

### Phase 4 — Vocab-image quality triage (2026-10-20)

Added a deterministic 0–100 metadata triage score and `bun scripts/vocab-image-review.ts quality` in pushed commit `6edb9e8`. It ranks candidates using minimum pixel dimension, extreme aspect ratio, absent provider description, duplicate content hash, and missing visual-review record. These signals prioritize a human's review queue; they cannot verify semantic relevance, cultural appropriateness, or safety. Focused tests pass 2/2 and the full vocab-image suite passes 133/133 after rerun. CI lint passed; the first typecheck caught a test-fixture source literal outside the Pexels/Pixabay union, corrected in a follow-up commit. Follow-up branch CI is required for compile evidence. No candidate was auto-approved or altered.

### Phase 5 — Close-out verification and owner gates

After implementation, rerun the complete relevant CI matrix on the branch and record exact commit/run IDs here and in `docs/BACKLOG.md`. Resolve any failures, then check the PR state. The remaining non-code gates are Android save-any-word and offline sync on supported devices, iOS podcast seek/offline/review behavior on devices, native-speaker French and Spanish review, App Store/RevenueCat and production account state, deployed headers, and owner sign-off. The launch decision stays NO-GO until the evidence is supplied.

**Scrubber checkpoint:** commit `3730d07` is pushed. PR #337 CI run 39352246488 passed lint/typecheck, web/admin builds, both E2E jobs, Deno, Swift tests, and the iOS app build; CodeQL (including Swift) and the vocab-image link check also passed. This validates compilation/tests, not physical-device seek ergonomics.

## Phase 0 — Establish a reproducible verification baseline

**Priority:** P1
**Owner:** engineering/release  
**Status (2026-10-19):** Main's supported Bun CI passed all jobs in run 39183037153, including tests, E2E, Deno, iOS builds/tests, content/type checks, and deployment. Bun remains blocked locally; this branch has not run CI because it has no PR.
**Exit criteria:** clean, reproducible CI run with published artifacts and no unexplained failure.

1. Main baseline verified by GitHub Actions run 39183037153 (`6749f18`); record Bun version 1.3.10 and the Ubuntu 24.04 runner from its job log. The local Bun binary is blocked by Windows ACL (`Access is denied`). GitHub has no run for this branch because CI is configured for pull requests and pushes to main; branch CI still requires the approved PR path.
2. Fix the local tooling traversal failures: install the declared missing test dependency and skip ignored hidden metadata in source scanners; both are now fixed on this branch.
3. Run and record the web unit suite, lint, typecheck, and learner/admin builds; the earlier full suite passed 3,668 tests (8 skipped). Current focused suites, typecheck, targeted ESLint, and both production builds also pass after the changes below.
4. Playwright, signed-in E2E, Deno, migration/content checks, and deploy passed on main in run 39183037153. Branch-specific result remains to verify.
5. Keep CI artifacts with test summaries and failure logs so release decisions are evidence-based.

## Phase 1 — Finish low-risk security/privacy hardening

**Priority:** P1  
**Owner:** web/backend  
**Exit criteria:** stable public error contracts and deletion regression coverage pass; deployed headers are verified.

1. Add tests proving the three Edge Functions never expose Zod `details` for malformed input.
2. Add an account-deletion test where one owned-table delete returns an error; assert auth deletion is not attempted and the client receives a safe stable error.
3. Normalize account-delete/account-export API error responses to public messages and correct statuses while logging underlying errors server-side; implemented and covered by route tests.
4. Add the same baseline headers to the separately served admin boundary; implemented through `admin/server.ts` and the admin server entry. Verify deployed learner/admin responses after deployment.
5. Add nonce-based CSP for learner and admin SSR. Learner inline theme bootstrap receives the request nonce; TanStack-generated scripts/head assets use router `ssr.nonce`. `script-src` is nonce-only plus `strict-dynamic`; existing inline styles remain explicitly allowed under `style-src` pending a style-attribute cleanup. Focused policy/wrapper tests and both production builds pass.
6. HSTS ownership is application response headers: one-year max-age on HTTPS requests only, with no `includeSubDomains` until sibling-host HTTPS is confirmed. Staging/production response verification remains open.

## Phase 2 — Verify atomic completion deployment

**Priority:** P1 release verification
**Owner:** backend/database  
**Exit criteria:** two simultaneous completions cannot lose or duplicate state, and retries are idempotent.

1. Production deploy job 39183037153 reports “Remote database is up to date,” confirming migration `20261014100300_atomic_lesson_completion.sql` was present by that run. Add/retain an explicit database concurrency test and assert the service-role-only RPC grants.
2. Preserve the existing concurrency design: the RPC locks the auth/progress rows and rejects stale row-version snapshots; the web retries fresh snapshots and iOS queues transient 5xx results with backoff.
3. Added a real-Postgres contention check to `e2e/signed-in.spec.ts`, which runs against the temporary Supabase stack already started by `e2e-signed-in`: concurrent calls share a version snapshot, expecting one applied and one conflict, one resulting completion, plus anon execution denial. The PR CI run must verify the assertion.
4. Production migration was present in deploy run 39183037153. Record branch CI’s migration and concurrency results in release evidence when available.

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
- Vocab link-check runs 39343410188 and 39344259073 showed residual Supabase Storage 429s (728/730, then 729/730) despite serial probes and bounded retry. The checker honors numeric/date `Retry-After` (capped at 30 seconds), retries once more, reports the final retry hint, and falls back from persistently throttled HEAD to a one-byte ranged GET. Focused tests pass 12/12; a fresh live workflow result is pending.
- Validation on `f9e9d9f`: core CI run 39344690192 passed all jobs, and standalone link-check run 39344690227 verified 730/730 image URLs. The HEAD-429 ranged-GET fallback resolved the final inconclusive probe.
- App Store release-ops run 39186960541 failed its age-rating check: live contests=`INFREQUENT`, expected=`INFREQUENT_OR_MILD`, computed rating=`FOUR_PLUS` vs the owner's 13+ decision. This requires owner confirmation before any metadata write.

### Phase 2 — Account deletion recovery, iOS download deduplication, security policy, and database contention coverage (2026-10-19)

- Account deletion now returns a stable, user-safe retry message when owned-row cleanup, incoming-friendship cleanup, or auth deletion fails; the account remains active until it can be fully deleted. Diagnostic context stays server-side. Added partial-cleanup retry and service-error tests, all passing.
- iOS podcast download requests for the same episode now coalesce through a keyed in-flight task registry. Added tests for one execution across concurrent callers, shared failure, and retry after failure. Swift tests still require the macOS CI runner.
- Learner/admin responses now use a per-response nonce CSP; scripts are nonce-only, while inline styles remain temporarily allowed. HSTS is emitted for HTTPS only. Focused policy/wrapper tests and both production builds passed locally; deployed-header checks await deployment.
- Full web suite now passes: 308 files passed, 1 skipped; 3,677 tests passed, 8 skipped. TypeScript and both production builds pass. Full ESLint exits successfully with six pre-existing warnings and no errors.
- PR #337 CI run 39337613041 passed all jobs after fixing Node `Request` subclass cloning during nonce injection. Both browser E2E jobs passed; signed-in E2E ran the real local-Postgres stale-snapshot race and anonymous RPC denial assertions. iOS Swift tests and app build also passed.

- Sanitized malformed-body responses in `supabase/functions/grade-review/index.ts`, `supabase/functions/start-lesson-session/index.ts`, and `supabase/functions/complete-lesson/handler.ts`.
- Added owned-table deletion error inspection in `src/lib/account.functions.ts`.
- Normalized account export/deletion HTTP errors to stable public messages/statuses and kept exception details in server logs.
- Added baseline browser security headers in `src/server.ts`.
- Added regression coverage for the sanitized completion response, partial account-deletion failure, and baseline SSR headers.
- Added route tests for safe account export/deletion error contracts.

Current verification at this checkpoint: full Vitest suite 3,677 passed / 8 skipped, TypeScript and both production builds passed, and full ESLint passed with six pre-existing warnings. Focused Request/CSP tests pass 6/6. Supported PR CI run 39337613041 passed all jobs, including regular and signed-in E2E, real-Postgres contention/permission assertions, Swift tests, and iOS app build. Deployed-header verification remains pending.

Header probe result: HEAD requests to both Vercel preview URLs served Vercel deployment-protection `/login` pages and generic platform CSP/HSTS, not app responses. Verify actual learner/admin headers once an authorized preview path is available; do not treat the platform headers as app validation.

Production runtime probe: after building and launching the learner and admin Nitro outputs locally, both `/` requests returned 200 with CSP `script-src` restricted to a request nonce and an HTML nonce equal to the CSP nonce. This surfaced and fixed a cross-realm Request reconstruction error. Focused tests (6), TypeScript, and both production builds pass after the fix. Final supported PR run 39342519846 on `3373811` passed every CI job; Bun suite was 309 files, 3,685 passed / 1 skipped, with E2E, real-Postgres contention/privilege assertions, Swift tests, and iOS app build all green. A separate local npm run had one source-inspection test exceed its 5-second timeout while all other 3,677 passed / 8 skipped; the authoritative supported Bun CI suite passes. Local HTTP correctly had no HSTS; HTTPS behavior is covered by the policy test.

## Do not do yet

- The core completion transaction and native retry behavior already exist. Verify production migration state before proposing changes to this path.
- Do not mark iOS ready based solely on an archive succeeding; device, TestFlight, RevenueCat, push, accessibility, and account-deletion evidence are required.
- Do not suppress the failing tests or increase timeouts without recording the root cause.
