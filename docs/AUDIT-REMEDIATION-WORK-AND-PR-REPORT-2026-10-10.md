# Audit remediation: work and pull request report

**Report date:** 2026-10-10 (America/Toronto)

**Repository:** `obsidian-media/LearnWithAlphonso`

**Starting point:** `main` at `e417fee841e04afcd6bb250ae6fcc08b3425d77f`

**Branch:** `codex/audit-remediation-2026-10-10`

**Pull request:** [#282 — Audit remediation: atomic persistence, privacy, and release safeguards](https://github.com/obsidian-media/LearnWithAlphonso/pull/282) (draft)

**Audit reviewed:** `Codex-Comprehensive-iOS-AppStore-Production-Audit-2026-10-10.md`, supplied separately.

**Scope exclusion:** The Paid Apps Agreement was expressly excluded. It was not accepted or modified.

## Executive summary

The audit's local code findings were addressed where a safe, verifiable repository change was possible. This includes atomic persistence paths for review grading and lesson completion, account export and Apple revocation error reporting, AI consent enforcement, paid tutor failure handling, native retry wakeups, dependency updates, and CI build dependencies. Tests and documentation were added alongside those changes.

The result is a reviewable remediation candidate, not a release approval. No finding is marked end-to-end complete: local code and test results do not prove production deployment, App Store Connect state, signed-device behavior, content rights, native-speaker approval, or operational readiness. F09 and F12–F15 remain open. All S01–S10 submission gates remain open. The release decision remains **NO-GO** for production submission or unrestricted paid launch.

## Source-control handoff

The remediation work was introduced in two commits:

| Commit | Purpose |
|---|---|
| `233b782` — `Harden iOS audit-critical persistence and release gates` | Main remediation, tests, two additive SQL migrations, and the verification, disposition, and closure documents. |
| `2a2c806` — `Clarify preview versus production deployment evidence` | Clarifies in the remediation report that PR-generated Vercel previews are not production deployments or release evidence. |

This work-and-PR report and its cross-links are being added in a follow-up documentation-only commit on the same branch.

The PR is draft because important audit gates remain open. Its CI workflow only deploys Supabase on a push to `main`; merging this PR would therefore cause the workflow to apply migrations and deploy its configured Edge Functions. The migrations must be reviewed and validated before merge. GitHub automatically created Vercel preview deployments for the PR; they are previews and are not App Store or production verification.

At the last check snapshot recorded for commit `2a2c806`, the CI checks `admin-build`, `deno-tests`, `e2e`, `ios-swift-tests`, `lint-and-typecheck`, `types-fresh`, and `web-build` passed. `ios-app-build` was still pending. Vercel preview checks passed. CodeRabbit skipped review because the PR is draft. The documentation follow-up causes checks to run again; use the PR page for current status.

## Work completed by finding

| Finding | Changes in this branch | Current state and remaining proof |
|---|---|---|
| F01 — review persistence | Added `apply_review_grade` and an attempt-receipt table. Web and Edge handlers now grade, update or retire the review item, write the resolution event, and store the receipt atomically. Native review attempts send the stable queue identity for replay handling. Added SQL rollback, replay, collision, and handler tests. | **In progress.** Apply and validate the migration in a disposable Supabase environment before deploying callers; then verify PostgREST permissions and native queue recovery on a signed build. |
| F02 — lesson-completion atomicity | Added `apply_lesson_completion`. Web and Edge paths check required reads and atomically write core progress, language XP, lesson completion, activity-day XP, missed-question review items, and friend-feed events. A per-user lock serializes completion calculations; stale snapshots return a conflict. Removed the web player's separate fire-and-forget miss write. Added real-Postgres rollback and stale-snapshot tests. | **In progress.** Deploy and test against the full Supabase schema, including two-device races and lost responses. Achievement updates and AI weakness enrichment still run after the core transaction and need explicit replay/reconciliation semantics. |
| F03 — Apple token revocation | Changed token lookup and linked-Apple-without-token cases to report failure rather than incorrectly treating them as not applicable. Added classification regressions. | **In progress.** Durable, access-controlled escrow and retry/alert/disposal handling remain unimplemented; run the disposable Apple-account matrix before closing. |
| F04 — account export | Added verified account email, made profile/table read errors fail the export, and paged user-owned, related, and RLS-scoped tables in 500-row pages with exact-count mismatch detection. Added large-account and failed-read tests. | **In progress.** Offset pagination can shift during concurrent edits. A consistent snapshot, real PostgREST cap test, data-scope review, and populated-account web/native parity test remain. |
| F05 — offline retries | Added a queue revision signal and foreground timer re-arming so due retries and newly queued work wake the native app's drain task. Updated native tests. | **In progress.** Swift syntax parses; macOS build and physical-device timing, background/resume, restart, account-switch, and reconnect tests remain. |
| F06 — paid AI/Hector | RevenueCat entitlement lookup distinguishes active, inactive, and unavailable with a timeout. Hector maps lookup outage to a retryable server error and native copy no longer says to subscribe when access could not be checked. Model/TTS calls have deadlines and bounded response/audio handling. Added outage and bounds tests. | **In progress.** Validate the paywall and provider failure matrix on the signed candidate; observe real latency/cost and deploy before closure. |
| F07 — release controls | CI now builds the learner web app and makes Supabase deployment depend on both learner and admin builds, in addition to existing test jobs. | **In progress.** The default branch still lacks verified protection/ruleset controls. Configure and read back required checks, approval/bypass policy, release manifest, and rollback rehearsal. |
| F08 — dependency advisories | Updated `sharp` to 0.35.5 and pinned `source-map-js` to 1.2.2 in package manifests/lockfiles. | **In progress.** Local audit reports no vulnerabilities and image tests/build pass. Fresh CI install, macOS image generation, and candidate-asset comparison remain. |
| F09 — moderation delivery | Inspected the persisted report plus pg_net fire-and-forget notification and Vercel notification configuration names. No notification receipt or retry sweep was added. | **Open.** Add durable delivery state/retry/alerting, assign primary/backup moderator, and run missing-secret/email-failure/overdue escalation drills. |
| F10 — privacy and AI consent | Removed the `ENFORCE_AI_CONSENT=false` bypass in web and Edge paths; tests prove consent still gates AI. Read-only Vercel production variable-name inspection found no variable with that name; no secret values were pulled. | **In progress.** Reconcile data flows, provider/backup retention, Supabase settings and saved App Store privacy answers, then test allow/deny/revoke on the selected build. |
| F11 — behavioral gates | Added/updated handler, export, entitlement, consent, persistence, and transaction tests; repaired the Windows/WSL environment-export test harness; updated the static lesson-writer guard for the RPC-based writer. | **In progress.** CI passes listed above except the iOS app build was pending at the last snapshot. Deployed database faults, signed-device purchase/deletion tests, and exact-candidate proof remain. |
| F12 — French/Spanish content quality | Documented required sampling and scorecard in the closure plan. | **Open.** Qualified French and Spanish reviewers must review coverage, accents/STT, ambiguous answers, corrections, and public claims. |
| F13 — device UX/accessibility | Parsed edited Swift source files. No device test was performed. | **Open.** Requires a signed build and iPhone/iOS-size, VoiceOver, Dynamic Type, contrast/motion, audio/mic, offline, termination, and storage checks. |
| F14 — rights and provenance | Documented asset-level evidence requirements; made no unsupported rights assumptions. | **Open.** Rights owner must inventory every shipped asset/source, establish license and notices, replace unresolved items, and sign off. |
| F15 — operations | Documented RPO/RTO, backup restore, alert, incident, rollback, load, and spend-control evidence needs. No live operational drill was run. | **Open.** Operations owners must execute and archive those drills. |

## Submission gates and release dependencies

S01–S03 (paywall, sandbox purchase, restore/account isolation), S04–S06 (subscription and marketing media, recording), S07 (reviewer access), S08 (saved App Privacy), S09 (first-subscription association), and S10 (account deletion and Apple grant revocation) remain open. They require exact-build or App Store Connect evidence that a source-code PR cannot provide.

The Paid Apps Agreement remains outside the audit finding count and outside this work. Its status still needs to be checked before paid purchase proof; only the Account Holder can complete any agreement, bank, or tax steps Apple requires.

## Validation evidence

### Local checks

| Check | Result | What it establishes |
|---|---|---|
| Full Vitest suite | 3,329 passed, 1 skipped; 289 test files passed | Web/repository regression suite on this Windows workstation. One existing test skip remains. |
| Original audit reproductions | 4/4 passed | The previously failing handler negative cases now pass in the isolated audit test suite. |
| Completion/UI focused tests | 71/71 passed | Web completion behavior, transaction callers, actual SQL migration behavior, and the UI's atomic review enrollment path. |
| Export tests | 31/31 passed | Includes failed reads and 750-row pagination. |
| AI consent web/API | 41/41 passed | The obsolete environment flag does not bypass consent. |
| Affected Deno tests | 20/20 passed | Review SRS, self-contained grading, and consent behavior. |
| Deno entrypoint check | Passed | Changed completion and review Edge functions type-check. |
| TypeScript | Passed | `tsc --noEmit` on the web TypeScript project. |
| Web production build | Passed | `bun run build`; existing route and bundler warnings remain. |
| Dependency audit | Passed | `bun audit` reported no vulnerabilities for the updated lockfile. |
| ESLint | Passed in tracked project; six warnings | `eslint . --ignore-pattern '.audit/**'`. The normal local lint command also reads ignored `.audit` scratch files and reports their existing lint errors; CI lint/typecheck passed on the PR run noted above. |
| Swift syntax parse | Passed | Syntax only. This does not establish iOS compilation or runtime behavior. |
| SwiftPM test build | Blocked locally | Windows Application Control blocked `lld-link.exe`; the PR's macOS Swift test check passed, while the separate iOS app build was still pending at the recorded snapshot. |
| Patch whitespace check | Passed | `git diff --check` before commit. |

PGlite ran both migration files as SQL against isolated PostgreSQL-compatible schemas. For review grading it tested event uniqueness on lost-response replay, rollback if event insertion fails, and attempt-ID collision. For lesson completion it tested writes across all six core tables, rollback on a forced last-write failure, and stale-snapshot rejection. These are valuable transaction checks; they are not a substitute for full-schema Supabase, PostgREST, RLS, or two-device integration tests.

### GitHub PR checks

The first PR run showed all listed checks passing except `ios-app-build`, which was pending. After the report's preview-deployment correction commit, run `38066807248` showed these passing: `admin-build`, `deno-tests`, `e2e`, `ios-swift-tests`, `lint-and-typecheck`, `types-fresh`, and `web-build`; Vercel learner/admin previews passed. `ios-app-build` was pending. The PR was draft, so CodeRabbit skipped its review. The PR page is the source of truth for checks after the new report commit.

## Deployment and rollback order

1. Validate both migrations in order against a disposable full-schema Supabase project, including permissions, RLS, actual constraints, concurrent calls, forced failure, and lost responses.
2. Deploy migration `20261014100200_atomic_review_grade.sql`, then `20261014100300_atomic_lesson_completion.sql` before deploying any changed callers. Both RPCs grant execution only to `service_role`.
3. Deploy updated web and Edge callers and verify existing signed native clients continue to work. Record backend, web, migration, and native build identifiers together.
4. If rollback is needed, revert callers first. Keep additive database objects until no deployed caller invokes them; do not remove functions under active callers.
5. Keep the release at NO-GO until remaining audit findings and submission gates have their required named-owner evidence on one selected candidate.

No production migration, production application deployment, App Store Connect edit, account deletion, or production data write was performed during this work. The Vercel preview deployments were generated automatically by the PR. The work is on the branch and draft PR identified above and remains subject to review.

## Related documents

- [Finding-by-finding remediation report](AUDIT-REMEDIATION-COMPLETION-2026-10-10.md)
- [Audit verification and closure plan](AUDIT-VERIFICATION-AND-CLOSURE-2026-10-10.md)
- [Audit completion ledger](AUDIT-COMPLETION-LEDGER-2026-10-10.md)
