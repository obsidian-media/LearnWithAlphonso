# Learn With Alphonso — Launch and Pre-Launch Audit

**Audit date:** 2026-10-19  
**Scope:** web application, Supabase Edge Functions/database boundary, native iOS app, CI/CD and release controls, accessibility, privacy, security, content, operations, and launch readiness  
**Decision:** **NO-GO for a broad public launch today. Conditional GO for controlled beta/TestFlight only after the owner-gated checks are completed.**

## Executive conclusion

The product has a stronger foundation than the current launch status suggests. Authentication, server-side lesson grading, Supabase/RLS boundaries, AI consent/quota controls, iOS signing automation, privacy manifests, and test coverage are all meaningful positives. Several issues found in older audit material are already fixed in the current tree, including important web accessibility and middleware behavior.

It is not yet possible to call the app ready for a broad public launch because platform metadata and physical-device sign-off are incomplete. Local web verification is green through the available npm/Node fallback. The latest supported Bun CI on `main` passed, but changes on `Codex-pre-Launch` have not run through branch CI. The most material launch risks are:

1. CI run [39183037153](https://github.com/obsidian-media/LearnWithAlphonso/actions/runs/39183037153) on main commit `6749f18` passed all jobs: Bun install, lint/typecheck/tests, web/admin builds, E2E and signed-in E2E, Deno tests, iOS Kit/app build, schema/content checks, and Supabase deploy. The deploy step reported “Remote database is up to date.” Local Bun still fails to start (“Access is denied”); use the main CI result as baseline, not proof for this branch.
2. iOS release readiness still depends on owner/device evidence: real-device microphone, push, VoiceOver, Dynamic Type, offline/retry, purchase/RevenueCat, account deletion, and production TestFlight checks. Static code and CI cannot substitute for this.
3. Lesson completion uses a service-role-only atomic RPC that locks the account and progress rows and rejects stale snapshots. The web caller recomputes conflicts; the iOS app queues transient server failures and retries with backoff. The successful production deploy job on 2026-10-19 reported the database was up to date, so the migration-deployed check is closed for that run; deterministic concurrent-call integration coverage is still desirable.
4. App Store Connect release-ops run [39186960541](https://github.com/obsidian-media/LearnWithAlphonso/actions/runs/39186960541) failed its age-rating check on 2026-10-19: contests is live as `INFREQUENT`, while the repository's expected value is `INFREQUENT_OR_MILD`, and Apple's computed rating is `FOUR_PLUS`, below the owner-decided 13+. This is a release blocker pending owner review/update; no platform metadata was changed. Agreement, subscription/RevenueCat offering, support/privacy/reporting email, demo-account cleanup, screenshots, and exact submitted-build state also require fresh owner/platform confirmation.
5. Operational visibility is not at the standard expected for a public AI/mobile product: the code has error capture and an uptime workflow, but no clearly configured centralized exception, AI-provider, payment, push-delivery, or conversion alerting path was found.

Remediation has started on branch `Codex-pre-Launch`: raw Zod validation internals are no longer exposed by `grade-review`, `start-lesson-session`, and `complete-lesson`; account deletion now fails before auth deletion if owned-row cleanup reports an error; learner SSR responses receive baseline security headers; and local source scanners/lint skip ignored tooling metadata.

## Evidence and method

The audit used:

- the repository's codebase-memory knowledge graph, which was indexed and reported approximately 22,465 nodes and 66,017 edges;
- graph architecture, call-path, complexity, and hotspot queries;
- focused source review of authentication, AI routes, lesson/review completion, account export/deletion, iOS lesson/conversation/revenue flows, Supabase functions, migrations, CI, signing, privacy, and release files;
- repository history and the current `HEAD` (`6749f18`, 2026-10-18);
- static searches for secrets, service-role exposure, unsafe HTML, SSRF-like fetches, security headers, dependency manifests, and operational tooling;
- attempted lint, test, build, and dependency-audit commands;
- accessibility review of the current web UI patterns and the iOS implementation surface;
- the repository's current backlog and architecture documentation, treating historical audit text as context rather than current truth.

This is a deep engineering launch audit, not a penetration test, App Store review, legal opinion, or a substitute for production observability and device testing.

## Readiness scorecard

| Area                                 | Assessment                                  | Readiness | Main reason                                                                                                                               |
| ------------------------------------ | ------------------------------------------- | --------: | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Authentication/session boundaries    | Strong with conditions                      |    8.5/10 | Supabase JWT validation uses claims/user verification; protected web routes and native functions are present.                             |
| Authorization/RLS/IDOR resistance    | Strong with conditions                      |      8/10 | User-scoped queries and server-side lesson/review ownership checks were found; live policy tests still need to remain green.              |
| Lesson/data integrity                | Strong with deployment confirmation pending |    8.5/10 | Server regrading and atomic completion RPC are present; web and iOS retry paths are covered, with production migration status to confirm. |
| AI safety, consent, and quotas       | Strong with conditions                      |      8/10 | Fixed system prompts, consent enforcement, quotas, request limits, timeout/error sanitization; provider reliability needs monitoring.     |
| Web security headers                 | Improved, needs deployment verification     |      7/10 | Baseline headers were added in this audit; admin/platform boundary and deployed headers still need verification.                          |
| Dependency/supply-chain verification | Partially verified                          |    6.5/10 | `bun.lock` is authoritative; Bun could not execute locally and `npm audit` has no npm lockfile to consume.                                |
| Web automated verification           | Green locally, CI confirmation pending      |    8.5/10 | 3,668 tests pass, lint/typecheck pass, and learner/admin builds succeed; Bun/Playwright/Supabase CI has not been reproduced here.         |
| iOS build/signing/release pipeline   | Good automation, not launch proof           |      8/10 | Manual signing, IPA validation, privacy/bundle checks, and TestFlight workflow exist.                                                     |
| iOS real-device QA                   | Incomplete                                  |      5/10 | Mic, push, VoiceOver, Dynamic Type, offline, purchases, deletion, and production configuration require physical-device evidence.          |
| Accessibility                        | Web foundation good; iOS unverified         |      7/10 | Skip link, dialogs, tabs, labels, reduced motion, and state semantics are present; device VoiceOver/Dynamic Type remain open.             |
| Privacy/data deletion/export         | Good design, needs regression proof         |    7.5/10 | Export and deletion paths exist; this audit fixed silent owned-row deletion failure handling.                                             |
| Content quality                      | Product-complete, review incomplete         |      7/10 | English structure is mature; French/Spanish native-speaker review remains an explicit release gap.                                        |
| Observability/support                | Not launch-grade yet                        |    5.5/10 | Error capture and uptime checks exist, but centralized alerts and provider/payment/push dashboards were not established in-repo.          |

## Findings by priority

### P0 — release blockers

#### F-02 — Platform/commercial release gates; age-rating check currently fails

**Evidence:** `docs/BACKLOG.md`, `.github/workflows/ios-release.yml`, `ios/LearnWithAlphonso/project.yml`, RevenueCat integration.

App Store Connect release-ops run [39186960541](https://github.com/obsidian-media/LearnWithAlphonso/actions/runs/39186960541) failed on 2026-10-19: live contests frequency is `INFREQUENT`, the code expects `INFREQUENT_OR_MILD`, and Apple's computed rating is `FOUR_PLUS`, below the owner-decided 13+. Earlier backlog notes conflict about the Paid Applications Agreement and refer to builds 50/51; those details are stale until re-queried. Subscription/offering, review/demo-account cleanup, support/privacy/reporting addresses, screenshots, and submitted-build state also require fresh owner/platform evidence. Do not patch the declaration automatically: the owner must confirm the classification before a write.

These facts must be checked live in App Store Connect, RevenueCat, Supabase/Vercel production, and TestFlight. A static repository audit cannot certify them.

**Exit criteria:** owner records the exact build number, TestFlight processing state, production RevenueCat offering/product IDs, paid-app agreement state, review notes/demo account state, screenshots, URLs/emails, and rollback owner.

#### F-03 — Real-device iOS release validation is incomplete

**Evidence:** `ios/LearnWithAlphonso/Sources/LessonPlayerView.swift`, `ConversationView.swift`, `ReviewQueueView.swift`, `HectorView.swift`, `EntitlementStore.swift`, iOS release workflow, and `docs/BACKLOG.md`.

The app has substantial native implementation and CI signing checks, but production readiness still depends on physical-device evidence for microphone permission and recording, STT/TTS playback, push delivery, background/interrupt handling, offline queue/retry, hearts and purchase flows, RevenueCat entitlement refresh, Sign in with Apple, account deletion, VoiceOver, Dynamic Type, and poor-network behavior.

**Exit criteria:** a dated device matrix with OS/device, build number, tester, result, and evidence for every critical path; all P0/P1 failures resolved or explicitly accepted by the product owner.

### P1 — must close before broad public launch

#### F-01 — Supported Bun CI passes on main; branch-specific evidence remains pending

**Evidence:** `package.json`, `bun.lock`, `vitest.config.ts`, `playwright.config.ts`, `.github/workflows/ci.yml`.

The complete web suite passed locally with `npm test -- --maxWorkers=1` (305 test files passed, 1 skipped; 3,668 tests passed, 8 skipped). `npm run lint` passed with zero errors and six existing warnings; `npx tsc --noEmit`, `npm run build`, and `npm run build:admin` all succeeded. The changed Edge completion handler passed 17/17 Deno tests. Local Node was v25.9.0, outside the engine ranges printed by Vitest/jsdom, and the repository's Bun executable fails to start with “Access is denied.” CI run [39183037153](https://github.com/obsidian-media/LearnWithAlphonso/actions/runs/39183037153) on `main` (`6749f18`) passed every job, including Bun install, lint/typecheck/tests, learner/admin builds, Playwright, signed-in E2E, Deno, iOS Kit/app build, type freshness and production deploy. This is a clean main baseline; the current branch has no PR and has not run this pipeline.

The first test run exposed an incomplete local install (`french-verbs-lefff` was pinned in `package.json`/`bun.lock` but absent under `node_modules`) and source scanners traversing ignored `.gstack` metadata. The package was installed locally without changing manifests/lockfiles; scanners now skip hidden metadata, and ESLint explicitly ignores Git-ignored audit/build/tooling directories. These changes made the local suite green. npm reported zero vulnerabilities for its transient resolution, but that is not an authoritative audit of the Bun lockfile.

**Exit criteria:** main baseline passed in run 39183037153. Remaining: run the same checks on this branch through CI (requires PR/owner authorization) and, where possible, reproduce locally with the supported runtime.

#### F-04 — Atomic completion is deployed; deterministic concurrency proof remains

**Evidence:** `supabase/migrations/20261014100300_atomic_lesson_completion.sql`, `src/lib/sync.functions.ts`, `supabase/functions/complete-lesson/handler.ts`, and iOS completion client flows.

The previous audit note in `docs/BACKLOG.md` is stale: the October 14 migration serializes completions by locking the user's auth row and affected progress rows, then compares expected row versions before writing. The web handler recomputes from fresh reads up to three times. On iOS, 5xx responses are classified as transient, queued by the lesson player, and retried by the sync engine with backoff; tests `testA5xxLessonCompletionIsRescheduledWithBackoff` and `testALessonCompletionFailingTransientlyTwentyTimesIsStillQueued` cover this behavior. **No code-level lost-update gap was found.** CI deploy run 39183037153 reports the production database was up to date, confirming this migration had already been applied by that run. The graph identifies `complete-lesson.handleRequest` as a high-complexity path (cyclomatic 23, cognitive 34, transitive loop depth 6); deterministic concurrent-call integration coverage is still desirable.

**Release check:** verify the migration version and RPC grants in the production Supabase database. A database-level concurrent-call integration test would improve assurance, but current static code and client retry tests do not indicate a P1 implementation defect.

#### F-05 — Public Edge Functions exposed raw validation internals

**Evidence:** previous response bodies in `supabase/functions/grade-review/index.ts:99`, `supabase/functions/start-lesson-session/index.ts:129`, and `supabase/functions/complete-lesson/handler.ts:186`.

The handlers returned `${err}` in a public `details` property. That can disclose schema names, expected values, or implementation details. **Status: fixed in this branch.** All three now return only `{ error: "Invalid request body" }` while retaining server-side debugging capability through normal logs. The completion handler test pins the response shape; deploy and malformed-body-check the two remaining functions.

**Exit criteria:** Deno tests assert the stable public shape, and deployed functions are verified not to return `details` for malformed input.

#### F-06 — Account deletion previously ignored owned-row delete errors

**Evidence:** `src/lib/account.functions.ts` in `deleteMyAccount`.

The caller-owned tables were deleted in `Promise.all` without inspecting individual Supabase errors, after which auth deletion could proceed. A permission, schema, transient, or policy failure could therefore leave data behind while reporting a successful account deletion. **Status: fixed in this branch.** The function now collects all deletion results and throws before auth deletion if any owned-table delete fails; a regression test verifies auth deletion is not attempted after an owned-row failure.

**Remaining work:** add a regression test for partial failure, decide whether deletion should retry or mark a durable erasure job, and verify the production database's cascade/retention behavior for every table in the export/delete inventories.

#### F-07 — Baseline browser security headers were absent in the learner SSR boundary

**Evidence:** `src/server.ts` before this audit had no `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, or `Permissions-Policy` handling.

**Status: baseline headers implemented in this branch.** `src/server.ts` now adds `nosniff`, `DENY`, `strict-origin-when-cross-origin`, and a restrictive permissions policy to normal and error responses. The server unit tests pin these values. A CSP was not added because the root document currently uses an inline theme script and CSP needs a tested nonce/hash strategy.

**Remaining work:** apply equivalent policy at the admin boundary/platform if it is separately served, verify headers on deployed HTTPS responses, decide HSTS ownership at the platform, and design a CSP with nonce/hash coverage.

#### F-08 — Type/schema freshness is advisory in CI

**Evidence:** `.github/workflows/ci.yml` comments and the types-fresh step.

The repository explicitly treats generated Supabase type freshness as advisory/non-gating because migrations can be present in a PR without regenerated types. That is understandable, but it creates a drift window at exactly the boundary where authorization and data integrity depend on schema assumptions.

**Recommendation:** retain the PR-friendly advisory behavior only if a protected-branch or scheduled job is hard-gating freshness against the deployed schema, with an explicit exception workflow and owner.

#### F-09 — Centralized production observability is not established

**Evidence:** `src/lib/error-capture.ts`, console/error logging, uptime workflow, and absence of a clearly configured centralized exception/AI/payment/push alerting path in the repository.

For a product combining AI providers, speech, subscriptions, push, and native/web clients, logs alone are insufficient. Establish owner-visible alerts for 5xx rate, auth failures, AI consent/quota denials, provider latency/error rate, TTS/STT failure, lesson completion failure, push failure, RevenueCat webhook/entitlement drift, account deletion failure, and elevated client crash rate.

### P2 — close during launch hardening

#### F-10 — Dependency audit is not portable outside Bun CI

**Evidence:** `bun.lock`, no `package-lock.json`, and the failed `npm audit` attempt.

The lockfile choice is valid, but the standard `npm audit` command cannot audit this tree. CI should run the authoritative Bun audit or an equivalent lockfile-aware scanner and publish the result, with a policy for dev-only vulnerabilities. Historical `AUDIT.md` information was not treated as current evidence.

#### F-11 — French and Spanish content need native-speaker review

**Evidence:** project documentation and backlog content-review notes.

The course engine has six-question-type parity, but native-speaker review remains an explicit quality gate. Before marketing these courses broadly, sample every level/question type for correctness, naturalness, answer acceptance, audio, and cultural appropriateness.

#### F-12 — iOS application-target test depth is lower than Kit test depth

**Evidence:** the Swift package has a substantial test suite; the application target has fewer direct unit/UI tests, and real-device flows remain owner-gated.

Keep the strong Kit tests, but add smoke coverage around the app's navigation/state orchestration: lesson finish, review grading, conversation recording/playback, entitlement transitions, account deletion, and offline retry. Continue to treat device testing as required.

#### F-13 — Account API error responses exposed internal exceptions

**Evidence:** `src/routes/api/account-delete.ts` and `src/routes/api/account-export.ts` catch paths.

Some caught server errors were returned to clients as message text, and the delete route mapped most failures to HTTP 400. **Status: fixed in this branch.** Account export/deletion now return stable `Unauthorized`, `Export failed`, `Deletion failed`, or `Invalid confirmation` messages, correct 401/400/500 status codes, and log internal errors server-side. Route tests assert that messages and table/policy details stay private.

## OWASP-aligned review

| Category                             | Result                           | Audit conclusion                                                                                                                                                                         |
| ------------------------------------ | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A01 Broken Access Control            | Conditional pass                 | Auth and user scoping are consistently present in reviewed paths; lesson/review ownership and RLS are good. Keep live RLS tests and test cross-user IDs.                                 |
| A02 Cryptographic Failures           | Pass with operational conditions | No committed service-role/API secrets or private keys were found; session/HMAC and TLS assumptions need production secret rotation/runbook evidence.                                     |
| A03 Injection                        | Pass with fixes applied          | Parameterized Supabase calls, fixed vendor URLs, allowlisted prompts, and schema validation were found. Raw validation details were removed. Continue testing prompt/content boundaries. |
| A04 Insecure Design                  | Conditional pass                 | Atomic completion RPC serializes and rejects stale snapshots; web recomputes conflicts and iOS queues transient failures. Verify deployed migration state.                               |
| A05 Security Misconfiguration        | Gap being remediated             | Baseline headers were absent and are now added for learner SSR; verify admin/platform headers, CSP strategy, HSTS, CORS, and production env configuration.                               |
| A06 Vulnerable/Outdated Components   | Unverified                       | Bun could not run locally; no npm lock exists for npm audit. Use clean CI and a lockfile-aware scanner.                                                                                  |
| A07 Identification/Auth Failures     | Conditional pass                 | JWT claims/user validation, refresh behavior, protected routes, and rate controls are present. Verify abuse limits and session revocation in production.                                 |
| A08 Software/Data Integrity Failures | Conditional pass                 | CI has migration/version/signing/content checks and manual iOS signing. Make schema freshness and release artifact provenance protected-branch gates.                                    |
| A09 Logging/Monitoring Failures      | Gap                              | Error capture and uptime exist, but centralized alerting and AI/payment/push observability are not clearly established.                                                                  |
| A10 SSRF                             | Pass in reviewed scope           | No user-controlled arbitrary upstream URL fetch was found in the reviewed web/Supabase paths; vendor URLs are fixed/allowlisted.                                                         |

## Accessibility and inclusive-use review

Positive current-tree evidence includes a root skip link and main landmark, reduced-motion handling, labeled auth fields, an accessible `HeartsModal` with focus return/trapping and Escape handling, a semantic `SegmentedControl` with roving tab index, and course selection/locked-state semantics.

Remaining evidence gaps:

- run axe/keyboard checks against every authenticated route at desktop and mobile widths;
- verify lesson answer controls, audio controls, modal focus, and error announcements with keyboard only;
- resolve or explicitly accept any word-save controls that are not keyboard reachable;
- test iOS VoiceOver, Dynamic Type at large sizes, reduced motion, color contrast, and hit targets on a physical device;
- verify microphone, speech playback, and network errors are announced accessibly.

## Launch checklist

### Web

- [ ] Clean CI run is green in the supported Bun environment.
- [ ] Production build and admin build are deployed to a staging/preview environment.
- [ ] Deployed headers verified for learner and admin surfaces.
- [ ] Supabase migrations, generated types, RLS tests, auth redirects, email/Apple auth, and production env are verified.
- [ ] AI consent, quota, abuse limits, timeout behavior, and provider fallbacks are tested.
- [ ] Account export/deletion tested with partial-failure and retry scenarios.
- [ ] Centralized error/performance/provider alerts are active.
- [ ] Accessibility smoke suite passes on all primary authenticated routes.

### iOS

- [ ] Exact release build is processed in TestFlight with production RevenueCat key and correct entitlements.
- [ ] Subscription product/offering, restore purchases, entitlement refresh, and cancellation/expiry behavior verified.
- [ ] Sign in with Apple, account deletion, data export/support path, and logout/account switching verified.
- [ ] Lesson, review, hearts, offline retry, conversation, Hector, push, and notification-tap flows verified on physical devices.
- [ ] VoiceOver, Dynamic Type, reduced motion, orientation/hit-target behavior, permissions, and poor-network behavior verified.
- [ ] App Store screenshots, review notes, demo credentials, Paid Apps Agreement, privacy/support/reporting URLs, and release owner are final.
- [ ] Crash/analytics/push/RevenueCat monitoring and rollback communication are ready.

## Recommended closure plan

The detailed plan is in [gap-closure-plan-2026-10-19.md](gap-closure-plan-2026-10-19.md). The order matters:

1. Keep the local verification fixes and reproduce the passing suite in the supported Bun/CI environment, including Playwright and signed-in E2E.
2. Finish the low-risk hardening already started and add regression tests for sanitized errors and account deletion failure handling.
3. Verify the atomic completion migration is deployed in production and retain the existing web/iOS conflict retry tests.
4. Establish production observability and execute the full physical-device/TestFlight matrix.
5. Complete commercial/platform gates, content review, accessibility sign-off, and launch rehearsal.

## Audit execution log

Completed during this audit:

- codebase-memory architecture and call-path review;
- security, authorization, AI, privacy, CI, iOS signing, accessibility, and release review;
- completed local verification and captured reproducibility evidence;
- removed raw Zod error details from three public Edge Functions;
- made account deletion fail before auth deletion when owned-row cleanup reports errors;
- added baseline security headers to learner SSR responses;
- added regression coverage for malformed completion requests, owned-row deletion failure, and SSR security headers;
- verified the account API changes with 47/47 Vitest tests and the completion handler with 17/17 Deno tests;
- ran the full web suite: 305 test files passed, 1 skipped; 3,668 tests passed, 8 skipped;
- ran lint (0 errors, 6 existing warnings), TypeScript (`tsc --noEmit`), learner build, and admin build successfully;
- after account API normalization, reran the focused account tests (47/47), lint, TypeScript, and learner production build successfully;
- fixed ESLint and source scanners to ignore Git-ignored `.audit`, build-output, and `.gstack` metadata;
- authored this report and the prioritized gap-closure plan.

Not completed because they require external state or platform access:

- live Vercel/App Store Connect/RevenueCat/Supabase production verification;
- macOS/Xcode archive and physical-device testing;
- a clean supported Bun/CI run and Playwright/Supabase E2E run from this Windows environment;
- production migration status and concurrency testing against the live database;
- native-speaker content sign-off.

The local web verification gate is green. The remaining verification risk is that this machine cannot execute Bun (Access is denied) and local Node v25 is outside Vitest/jsdom's supported engine ranges; the same suite and CI integration checks should pass on the repository's supported Bun/Node environment before release.

## Final decision

**Do not announce a broad public launch yet.** The app is suitable for continued controlled beta work and has a credible release foundation. Public launch should wait for the P0 platform/device gates, supported CI confirmation, production migration/header verification, and operational alerting. Then perform a dated release rehearsal against the exact production artifacts and record owner sign-off in the repository.
