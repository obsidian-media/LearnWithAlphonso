# Learn With Alphonso — Launch and Pre-Launch Audit

**Audit date:** 2026-10-19  
**Scope:** web application, Supabase Edge Functions/database boundary, native iOS app, CI/CD and release controls, accessibility, privacy, security, content, operations, and launch readiness  
**Decision:** **NO-GO for a broad public launch today. Conditional GO for controlled beta/TestFlight only after the owner-gated checks are completed.**

## Executive conclusion

The product has a stronger foundation than the current launch status suggests. Authentication, server-side lesson grading, Supabase/RLS boundaries, AI consent/quota controls, iOS signing automation, privacy manifests, and test coverage are all meaningful positives. Several issues found in older audit material are already fixed in the current tree, including important web accessibility and middleware behavior.

It is not yet possible to call the app ready for real users because the release evidence is incomplete and the current local verification attempt is not reproducibly green. The most material product risks are:

1. The web test suite produced deterministic-looking failures in generated-content tests, multiple timeouts, and a V8 out-of-memory failure under the available runner. Bun itself could not start in this environment, so the repository's authoritative Bun-based commands were not independently verified.
2. iOS release readiness still depends on owner/device evidence: real-device microphone, push, VoiceOver, Dynamic Type, offline/retry, purchase/RevenueCat, account deletion, and production TestFlight checks. Static code and CI cannot substitute for this.
3. Lesson completion still has a documented concurrent-write race. Two tabs/devices can read and then overwrite XP, streak, activity, hearts, or related state unless the database transaction serializes the operation. This should be fixed in the atomic RPC path before public launch.
4. App Store Connect, paid-apps agreement, subscription/RevenueCat offering, support/privacy/reporting email, review demo account cleanup, screenshots, and the exact submitted build state remain human/platform gates in the repository's own release notes. They need live confirmation rather than assumption.
5. Operational visibility is not at the standard expected for a public AI/mobile product: the code has error capture and an uptime workflow, but no clearly configured centralized exception, AI-provider, payment, push-delivery, or conversion alerting path was found.

The first remediation work has started in the working tree: raw Zod validation internals are no longer exposed by `grade-review`, `start-lesson-session`, and `complete-lesson`; account deletion now fails loudly before auth deletion if an owned-table delete fails; and the learner SSR boundary adds baseline security headers.

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

| Area | Assessment | Readiness | Main reason |
|---|---|---:|---|
| Authentication/session boundaries | Strong with conditions | 8.5/10 | Supabase JWT validation uses claims/user verification; protected web routes and native functions are present. |
| Authorization/RLS/IDOR resistance | Strong with conditions | 8/10 | User-scoped queries and server-side lesson/review ownership checks were found; live policy tests still need to remain green. |
| Lesson/data integrity | Not ready | 6.5/10 | Server regrading is good, but concurrent completion writes remain a known race. |
| AI safety, consent, and quotas | Strong with conditions | 8/10 | Fixed system prompts, consent enforcement, quotas, request limits, timeout/error sanitization; provider reliability needs monitoring. |
| Web security headers | Improved, needs deployment verification | 7/10 | Baseline headers were added in this audit; admin/platform boundary and deployed headers still need verification. |
| Dependency/supply-chain verification | Unverified | 6/10 | Bun lock is authoritative, but Bun could not execute locally and `npm audit` cannot run without a package-lock. |
| Web automated verification | Red until explained | 5/10 | Test timeouts, generated-content failures, and V8 OOM were observed; full Bun CI is not independently reproduced. |
| iOS build/signing/release pipeline | Good automation, not launch proof | 8/10 | Manual signing, IPA validation, privacy/bundle checks, and TestFlight workflow exist. |
| iOS real-device QA | Incomplete | 5/10 | Mic, push, VoiceOver, Dynamic Type, offline, purchases, deletion, and production configuration require physical-device evidence. |
| Accessibility | Web foundation good; iOS unverified | 7/10 | Skip link, dialogs, tabs, labels, reduced motion, and state semantics are present; device VoiceOver/Dynamic Type remain open. |
| Privacy/data deletion/export | Good design, needs regression proof | 7.5/10 | Export and deletion paths exist; this audit fixed silent owned-row deletion failure handling. |
| Content quality | Product-complete, review incomplete | 7/10 | English structure is mature; French/Spanish native-speaker review remains an explicit release gap. |
| Observability/support | Not launch-grade yet | 5.5/10 | Error capture and uptime checks exist, but centralized alerts and provider/payment/push dashboards were not established in-repo. |

## Findings by priority

### P0 — release blockers

#### F-01 — Verification is not reproducibly green

**Evidence:** `package.json`, `vitest.config.ts`, `playwright.config.ts`, `.github/workflows/ci.yml`.

The repository is Bun-first (`bun install --frozen-lockfile`, Bun scripts), but Bun could not start in the audit environment because the installed executable returned “Access is denied.” Fallback `npm` attempts were started but did not complete cleanly. Observed evidence included:

- generated lexicon/romance isolation test failures;
- a V8 “process out of memory” failure;
- timeouts in AI safety prompt-path tests, AI consent enforcement, and account deletion tests;
- targeted runs did not complete promptly under the available machine load;
- `npm audit --omit=dev --json` failed because there is no `package-lock.json`.

This does not prove each observed test is a product defect; it proves the audit cannot certify a green release from this environment. The CI Bun run, dependency install, and the individual failing tests must be re-run in a clean, appropriately sized environment and either fixed or documented as an intentional test-harness issue.

**Exit criteria:** clean CI run for lint, typecheck, unit tests, web build, admin build, E2E, Deno tests, migration checks, and the release-specific checks; no untriaged failure or OOM.

#### F-02 — Platform/commercial release gates are not confirmed

**Evidence:** `docs/BACKLOG.md`, `.github/workflows/ios-release.yml`, `ios/LearnWithAlphonso/project.yml`, RevenueCat integration.

Repository release notes describe owner-only gates around the App Store Connect Paid Apps Agreement, subscription/revenue configuration, offerings, review/demo-account cleanup, support/privacy/reporting addresses, screenshots, and the submitted build state. The documentation snapshot also distinguishes a prior approved external beta build from a newer build that was not yet attached/submitted at the time of the snapshot.

These facts must be checked live in App Store Connect, RevenueCat, Supabase/Vercel production, and TestFlight. A static repository audit cannot certify them.

**Exit criteria:** owner records the exact build number, TestFlight processing state, production RevenueCat offering/product IDs, paid-app agreement state, review notes/demo account state, screenshots, URLs/emails, and rollback owner.

#### F-03 — Real-device iOS release validation is incomplete

**Evidence:** `ios/LearnWithAlphonso/Sources/LessonPlayerView.swift`, `ConversationView.swift`, `ReviewQueueView.swift`, `HectorView.swift`, `EntitlementStore.swift`, iOS release workflow, and `docs/BACKLOG.md`.

The app has substantial native implementation and CI signing checks, but production readiness still depends on physical-device evidence for microphone permission and recording, STT/TTS playback, push delivery, background/interrupt handling, offline queue/retry, hearts and purchase flows, RevenueCat entitlement refresh, Sign in with Apple, account deletion, VoiceOver, Dynamic Type, and poor-network behavior.

**Exit criteria:** a dated device matrix with OS/device, build number, tester, result, and evidence for every critical path; all P0/P1 failures resolved or explicitly accepted by the product owner.

### P1 — must close before broad public launch

#### F-04 — Lesson completion has a concurrent-write race

**Evidence:** `src/lib/sync.functions.ts`, `supabase/functions/complete-lesson/handler.ts`, the completion RPC migration, and `docs/BACKLOG.md`.

The completion path correctly authenticates, checks a lesson session, re-derives correctness server-side, and applies the result through a database RPC. However, the surrounding state model still has read-then-write behavior for activity/streak/XP/hearts-related state. Two devices or tabs completing at the same time can observe the same old state and overwrite each other's gains. The graph identifies `complete-lesson.handleRequest` as a high-complexity, high-change path (cyclomatic 23, cognitive 34, transitive loop depth 6).

**Required fix:** make the whole completion state transition atomic in one SQL transaction, with row locking or an equivalent idempotent/advisory-lock design. Preserve request/session idempotency and add a concurrent two-client test that proves XP, streak, hearts, activity, and completion records are not lost or duplicated.

#### F-05 — Public Edge Functions exposed raw validation internals

**Evidence:** previous response bodies in `supabase/functions/grade-review/index.ts:99`, `supabase/functions/start-lesson-session/index.ts:129`, and `supabase/functions/complete-lesson/handler.ts:186`.

The handlers returned `${err}` in a public `details` property. That can disclose schema names, expected values, or implementation details. **Remediation started:** all three now return only `{ error: "Invalid request body" }` while retaining server-side debugging capability through normal logs.

**Exit criteria:** Deno tests assert the stable public shape, and deployed functions are verified not to return `details` for malformed input.

#### F-06 — Account deletion previously ignored owned-row delete errors

**Evidence:** `src/lib/account.functions.ts` in `deleteMyAccount`.

The caller-owned tables were deleted in `Promise.all` without inspecting individual Supabase errors, after which auth deletion could proceed. A permission, schema, transient, or policy failure could therefore leave data behind while reporting a successful account deletion. **Remediation started:** the function now collects all deletion results and throws before auth deletion if any owned-table delete fails.

**Remaining work:** add a regression test for partial failure, decide whether deletion should retry or mark a durable erasure job, and verify the production database's cascade/retention behavior for every table in the export/delete inventories.

#### F-07 — Baseline browser security headers were absent in the learner SSR boundary

**Evidence:** `src/server.ts` before this audit had no `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, or `Permissions-Policy` handling.

**Remediation started:** `src/server.ts` now adds `nosniff`, `DENY`, `strict-origin-when-cross-origin`, and a restrictive permissions policy to normal and error responses. This intentionally does not add a speculative CSP because the root document currently uses an inline theme script and CSP needs a tested nonce/hash strategy.

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

#### F-13 — Client account API error responses should be normalized

**Evidence:** `src/routes/api/account-delete.ts` and `src/routes/api/account-export.ts` catch paths.

Some caught server errors are returned to clients as message text. This is lower risk than the raw validator issue, but stable public error codes would avoid leaking backend details and make the native/web clients more reliable. Normalize to a safe message/code and keep the underlying error server-side.

## OWASP-aligned review

| Category | Result | Audit conclusion |
|---|---|---|
| A01 Broken Access Control | Conditional pass | Auth and user scoping are consistently present in reviewed paths; lesson/review ownership and RLS are good. Keep live RLS tests and test cross-user IDs. |
| A02 Cryptographic Failures | Pass with operational conditions | No committed service-role/API secrets or private keys were found; session/HMAC and TLS assumptions need production secret rotation/runbook evidence. |
| A03 Injection | Pass with fixes applied | Parameterized Supabase calls, fixed vendor URLs, allowlisted prompts, and schema validation were found. Raw validation details were removed. Continue testing prompt/content boundaries. |
| A04 Insecure Design | Gap | Concurrent completion writes are a real integrity/design issue; atomic RPC and concurrency tests are required. |
| A05 Security Misconfiguration | Gap being remediated | Baseline headers were absent and are now added for learner SSR; verify admin/platform headers, CSP strategy, HSTS, CORS, and production env configuration. |
| A06 Vulnerable/Outdated Components | Unverified | Bun could not run locally; no npm lock exists for npm audit. Use clean CI and a lockfile-aware scanner. |
| A07 Identification/Auth Failures | Conditional pass | JWT claims/user validation, refresh behavior, protected routes, and rate controls are present. Verify abuse limits and session revocation in production. |
| A08 Software/Data Integrity Failures | Conditional pass | CI has migration/version/signing/content checks and manual iOS signing. Make schema freshness and release artifact provenance protected-branch gates. |
| A09 Logging/Monitoring Failures | Gap | Error capture and uptime exist, but centralized alerting and AI/payment/push observability are not clearly established. |
| A10 SSRF | Pass in reviewed scope | No user-controlled arbitrary upstream URL fetch was found in the reviewed web/Supabase paths; vendor URLs are fixed/allowlisted. |

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

1. Make verification green and reproducible in CI, including triage of the generated-content failures and OOM/timeouts.
2. Finish the low-risk hardening already started and add regression tests for sanitized errors and account deletion failure handling.
3. Replace completion read-then-write behavior with a single atomic, idempotent database transaction and concurrency tests.
4. Establish production observability and execute the full physical-device/TestFlight matrix.
5. Complete commercial/platform gates, content review, accessibility sign-off, and launch rehearsal.

## Audit execution log

Completed during this audit:

- codebase-memory architecture and call-path review;
- security, authorization, AI, privacy, CI, iOS signing, accessibility, and release review;
- attempted local verification and captured reproducibility evidence;
- removed raw Zod error details from three public Edge Functions;
- made account deletion fail before auth deletion when owned-row cleanup reports errors;
- added baseline security headers to learner SSR responses;
- authored this report and the prioritized gap-closure plan.

Not completed because they require external state or platform access:

- live Vercel/App Store Connect/RevenueCat/Supabase production verification;
- macOS/Xcode archive and physical-device testing;
- a clean Bun/CI run from this Windows environment;
- production concurrency testing against the live database;
- native-speaker content sign-off.

## Final decision

**Do not announce a broad public launch yet.** The app is suitable for continued controlled beta work and has a credible release foundation, but public launch should wait for the P0 gates and the P1 completion-integrity, deletion, headers, and observability work. After those are closed, perform one dated release rehearsal against the exact production artifacts and record the owner sign-off in the repository.
