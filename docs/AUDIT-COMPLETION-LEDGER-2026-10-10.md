# iOS/App Store audit completion ledger

**Baseline:** 2026-10-10, `e417fee841e04afcd6bb250ae6fcc08b3425d77f`.

**Plan:** [Audit verification and closure](AUDIT-VERIFICATION-AND-CLOSURE-2026-10-10.md).

**Execution report:** [Audit remediation completion, 2026-10-10](AUDIT-REMEDIATION-COMPLETION-2026-10-10.md).

**Work and PR report:** [Audit remediation work and PR report](AUDIT-REMEDIATION-WORK-AND-PR-REPORT-2026-10-10.md).
**Status convention:** `OPEN` means closure evidence is missing; `IN PROGRESS` requires a named owner/change; `COMPLETE` requires an artifact and a passing acceptance check; `NOT APPLICABLE` requires a documented reason. A green generic CI run alone does not close a behavioral item.

## Work completed during this verification

| Verification task | Result | Evidence |
|---|---|---|
| Read original 2026-10-10 audit and map all findings | Complete | F01–F15 and S01–S10 captured in the plan |
| Confirm current repository baseline | Complete | `main` at `e417fee`; clean before report creation; only six ASC/listing/TestFlight files since `749abaf6` |
| Reproduce four negative paths | Complete as verification; defects remain open | `.audit/readiness-2026-10-10/vitest.config.ts`: 4 expected assertions failed in 3 files on this checkout |
| Validate CI/signed release/TestFlight claims | Complete as readback | CI [38036121838](https://github.com/obsidian-media/LearnWithAlphonso/actions/runs/38036121838), signed build [38001678521](https://github.com/obsidian-media/LearnWithAlphonso/actions/runs/38001678521), beta readback [38037862823](https://github.com/obsidian-media/LearnWithAlphonso/actions/runs/38037862823) |
| Check branch controls and vulnerable resolution | Complete | GitHub protection 404/empty rulesets; `bun.lock` versions recorded in plan |
| Confirm source paths for F01–F06/F09/F10 | Complete within stated static scope | Source links and exact behavior in plan; no production incident claimed |

## Finding closure register

The table below records the post-remediation worktree. No F01–F15 item is evidenced as end-to-end **COMPLETE** on a deployed, signed release candidate. `IN PROGRESS` means a local implementation or closure artifact exists but at least one acceptance criterion remains.

| ID | Current closure status | Responsible role | Required closure artifact |
|---|---|---|---|
| F01 | IN PROGRESS — local atomic grade/retire/event RPC, native attempt identity and real-Postgres rollback/replay tests; deployment/device recovery missing | Backend/web/iOS engineering | Migration-first deployment + PostgREST/queue-retention/lost-response recovery run |
| F02 | IN PROGRESS — local atomic core-completion RPC and real-Postgres rollback/stale-read tests; deployed concurrency and post-commit effects missing | Database/backend engineering | Migration-first deployment + two-device/replay/forced-failure DB results + post-commit recovery decision |
| F03 | IN PROGRESS — token/identity failures classified; no durable retry | Auth/privacy engineering | Revocation recovery design/PR + disposable Apple account record |
| F04 | IN PROGRESS — email/profile failure/paging; no consistent snapshot | Backend/native engineering | Export schema/PR + native/web large-account and failure tests |
| F05 | IN PROGRESS — local due-time wakeup; macOS/device unverified | iOS engineering | Due-time scheduler PR + reconnect/device timing matrix |
| F06 | IN PROGRESS — tri-state/deadlines/bounds; deployment/device unverified | Paid AI/backend engineering | Tri-state/deadline PR + outage matrix |
| F07 | IN PROGRESS — CI build dependencies; main remains unprotected | Release owner | Main ruleset and deploy-gate readback + release manifest/rehearsal |
| F08 | IN PROGRESS — patched lockfile/audit/build; fresh CI/macOS pending | Dependency/tooling owner | Scoped upgrade PR + fresh audit/image/build checks |
| F09 | OPEN — source confirmed | Moderation/operations owner | Durable notification/sweep evidence + end-to-end escalation drill |
| F10 | IN PROGRESS — consent bypass removed locally; Vercel names attested; ASC unknown | Privacy/account owner | Signed data inventory + exact ASC/config/manifest readbacks |
| F11 | IN PROGRESS — maintained regressions and CI build checks; signed-device/database proof missing | Test/release owner | Required behavioral suites + signed-device records |
| F12 | OPEN — documented review gap | Editorial owner | Teacher/native-speaker coverage and correction scorecard |
| F13 | OPEN — device state unknown | iOS QA/accessibility owner | Exact-build device/accessibility matrix and closed blockers |
| F14 | OPEN — rights evidence gap | Content/rights owner | Signed shipped-asset provenance and notices |
| F15 | OPEN — operations evidence gap | Operations owner | Restore/soak/alert/incident/spend-control records |

## Submission closure register (agreement excluded from the audit's blocker count)

| Gate | Status | Required proof |
|---|---|---|
| S01 Paywall and trial display | OPEN | Exact-build physical-device checklist/video |
| S02 Purchase and Hector unlock | OPEN | Sandbox purchase and state-transition record |
| S03 Restore and account isolation | OPEN | Reinstall/sign-out/second-account record |
| S04 Subscription screenshot | OPEN | Approved current image and saved ASC readback |
| S05 Apple's app-specific recording/answers | OPEN | Publicly playable no-login recording and saved review notes |
| S06 Marketing screenshots | OPEN | Approved current set and ASC slot/order readback |
| S07 Reviewer access | OPEN | Fresh-session demo walkthrough; credentials held in approved secret channel |
| S08 Published App Privacy | OPEN | ASC readback reconciled to F10 inventory |
| S09 First subscription attachment | OPEN | Same-submission app version/group/subscription readback |
| S10 Account deletion/Apple grant | OPEN | F03 proof plus disposable-account deletion |

**External dependency:** The source audit intentionally excluded the Paid Apps Agreement from its readiness verdict. The owner checklist reports it was not active at its last update; Apple states paid IAP cannot function in review until it is active. Recheck its status before S01–S04. Only the Account Holder can complete the agreement, bank and tax steps. No agreement was accepted here.

## Update protocol for future completion reports

For each item, add: owner, code/config/content change identifier, environment, native build/SHA, backend SHA, migration watermark, test or ASC/device artifact, pass/fail, reviewer, date and residual risk. A fix merged to `main` is `IN PROGRESS` until deployed or included in the selected signed build and its acceptance evidence passes. Separate beta evidence from production submission evidence. Reopen affected items when the candidate changes.

**Current release decision:** `NO-GO` for production submission and unrestricted paid launch; controlled TestFlight can continue under the audit's stated conditions. The next decision point is after F01–F04 and the submission gates have documented closure, followed by exact-candidate sign-off.
