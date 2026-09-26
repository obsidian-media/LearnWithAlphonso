# CI guard audit — 2026-09-26

## Assignment

Enumerate every CI job, every test, and every script that claims to protect a
property. For each: if the exact property it claims to guard is broken, does
it actually go red — not "does something go red," the named property. Find
the guards that report success while structurally incapable of failing (or
whose failure has no effect on anything), the way three were already found by
accident in the last eight days:

1. The `admin_users` RLS test was documented as running in CI and ran
   nowhere — `bun run test` executed in a job that set no Supabase env, so
   it skipped silently for weeks.
2. The types-staleness guard generates from production, not from the
   migrations in the PR, so a PR that adds a table gets flagged for its own
   new table. Wrong reference, confidently red.
3. `ios-app-build` compiles for the simulator with `CODE_SIGNING_ALLOWED=NO`,
   so signing was never exercised until a real release run — how build 23
   died on a missing entitlement nobody could have caught earlier.

## The real count

**Six distinct findings**, beyond re-confirming the three above. Two are
fixed in this PR. Two were already known and remain open (fixing them
properly is not cheap — see each entry for why). One is a new, not-yet-cheap
structural risk. One is an observation, not a repo defect.

Ordered by how much confidence I'd currently place in each dud — most
dangerous first:

| # | Finding | Status | Class |
|---|---|---|---|
| 1 | `main` has no branch protection and no rulesets | **Not fixed — policy call** | Every check below is advisory only |
| 2 | `deploy-supabase` didn't depend on `deno-tests` | **Fixed** | Red guard, zero effect on the deploy |
| 3 | Types-staleness guard references production, not the PR's migrations | Not fixed (known, #2 above) | Confidently red on a correct change |
| 4 | `ios-app-build` never exercises real code signing | Not fixed (known, #3 above) | Blind spot by design |
| 5 | `admin_users` RLS test | **Confirmed fixed**, re-verified | Was #1 above |
| 6 | TS/Deno/Swift grading logic: mirrored test vectors, no live parity check | Not fixed (new) | Same shape as #2, unproven so far |
| — | Local `bun run test` prints a misleading-looking summary under load | Not a CI defect | Observational |

Everything I mutation-tested and found **working correctly** is listed at the
bottom, so the map is complete rather than just the bad news.

---

## 1. `main` has no branch protection, and no rulesets — not fixed

```
$ gh api repos/obsidian-media/LearnWithAlphonso/branches/main/protection
{"message":"Branch not protected","documentation_url":"...","status":404}
$ gh api repos/obsidian-media/LearnWithAlphonso/rulesets
[]
```

The repo is also public (`gh repo view ... --json isPrivate` → `false`).

This is the top of the list because it is the precondition for every other
finding mattering at all: **nothing requires any of these checks to pass
before a merge, or before a direct push to `main`.** Every guard this report
covers — the well-defended ones and the broken ones alike — is currently
advisory. A red `lint-and-typecheck`, a red `deno-tests`, a red
`ios-app-build`, even the `admin_users` regression alarm once it fires: none
of them can currently stop a change from landing. The only thing that has
been preventing a bad merge is a human choosing to look at the checks tab.

I have **not** turned on branch protection or a ruleset. That's a real
behavior change (it can block your own future pushes, not just
hypothetical ones), and it's exactly the kind of judgment call this
assignment said to surface rather than silently act on. If you want it, the
minimal version is:

```
gh api repos/obsidian-media/LearnWithAlphonso/branches/main/protection \
  --method PUT \
  -f required_status_checks[strict]=true \
  -f 'required_status_checks[contexts][]=lint-and-typecheck' \
  -f 'required_status_checks[contexts][]=deno-tests' \
  -f 'required_status_checks[contexts][]=e2e' \
  -f enforce_admins=false \
  -f required_pull_request_reviews=null \
  -f restrictions=null
```

(`enforce_admins=false` so it doesn't lock out the account owner; add
`ios-app-build`/`ios-swift-tests`/`admin-build` to the contexts list if you
want those required too — they're slower, which is presumably why they
weren't already.)

## 2. `deploy-supabase` didn't depend on `deno-tests` — fixed

`deno-tests` is the **only** CI job that ever runs or type-checks anything
under `supabase/functions/` — `tsc`'s own `include` is scoped to `src/**`,
and vitest's is scoped to `src/**/*.test.ts`. That job validates the exact
Deno files `deploy-supabase` ships with `supabase functions deploy
complete-lesson`/`grade-review`/etc. But `deploy-supabase`'s `needs:` was
`[lint-and-typecheck, e2e]` — `deno-tests` wasn't in it. GitHub Actions only
blocks a job on what's listed in its own `needs`; a red `deno-tests` (a
broken hand-synced port, a missing `deno.json`, a duplicate migration
version) had **zero effect** on whether the deploy proceeded.

Confirmed with real run history, not just the YAML's semantics:

```
$ gh run view 36219669275 --json jobs -q '.jobs[] | {name, startedAt, completedAt}'
deno-tests            05:03:41 → 05:03:53   (12s)
lint-and-typecheck     05:03:41 → 05:05:15
e2e                    05:03:41 → 05:04:27
Deploy Supabase ...    05:05:17 → 05:06:06   (started after lint-and-typecheck/e2e, not after deno-tests)
```

`deno-tests` happens to be fast enough that it always finishes first today —
that's why this hasn't caused a visible incident yet. That's luck, not
protection: nothing stops the race the moment `deno-tests` is the one that's
slow, or the one that fails.

**Fixed**: `needs: [lint-and-typecheck, e2e, deno-tests]` in
`.github/workflows/ci.yml`.

## 3. Types-staleness guard references production, not the PR's migrations — not fixed (known)

Confirmed still present exactly as described. The guard runs
`supabase gen types typescript --project-id qhcjpfbxfcltjbiuknyt` — against
the **live, deployed** schema. Migrations only apply post-merge, in
`deploy-supabase`. So a PR that adds a migration **and** updates
`src/integrations/supabase/types.ts` in the same PR to use the new table
(the normal way to avoid an `as any` cast, per PR #153/#158's own pattern)
will regenerate the **pre-migration** shape and diff it against the
forward-looking committed file — a guaranteed, confident failure on a
correct change. Re-running the suggested fix (`gh workflow run
regenerate-supabase-types.yml`) doesn't help either, since that also hits
production.

This is the opposite failure direction from "cannot fail" — it's "fails when
it's right" — but it buys exactly as little real confidence: a maintainer
who sees this red enough times learns to distrust or route around the check,
which is its own kind of guard-that-doesn't-work.

**Why not fixed here**: a real fix needs generating types against a database
that has *this PR's* migrations applied — a local/ephemeral Postgres in CI.
This repo has no containerized Postgres anywhere in CI today (see
`podcast-schema.test.ts`'s own comment: text assertions against migration SQL
exist specifically *because* there's no live database to query against in
CI). Building that is a real, moderate infrastructure project, not a
one-line change. I added a comment on the step (and a clause to its error
message) naming the false-positive mode precisely and the actual workaround
(land the migration alone, merge, let it deploy, regenerate in a follow-up),
so the next person who hits it isn't debugging from zero — but the
underlying limitation is unchanged.

## 4. `ios-app-build` never exercises real code signing — not fixed (known)

Confirmed unchanged: `CODE_SIGNING_ALLOWED=NO` against the simulator. This
is a disclosed, deliberate scope limit (the job's own comment says so), and
it's the literal cause of build 23's entitlement failure. I looked for a
cheap partial mitigation and didn't find one I'm confident in:

- A static check that the Debug/Release `.entitlements` files declare the
  capabilities the app uses would **not** have caught build 23 — that
  failure was a mismatch between the App ID's capabilities and the
  **downloaded provisioning profile**, which is external state the
  entitlements files can't see.
- The one check that plausibly *would* catch it: decode the current
  provisioning profile (`security cms -D -i`, the same call
  `regenerate-ios-profile.yml` already makes) and diff its embedded
  capabilities against what `project.yml` expects, on every PR. That's a
  real, concrete idea, but it needs `macos-latest`, the provisioning-profile
  secret exposed to PR-triggered runs (same-repo PRs already get secrets
  here, so that's not a new exposure), and — critically — I have no way to
  test it myself: no macOS, no way to run `security cms` locally, and I'm
  not willing to push an untested signing-adjacent check and call it done.

Leaving this open. If you want it, dispatching it as its own workflow (like
`regenerate-ios-profile.yml`) and watching a real run, the same way I
verified the Supabase CLI/types work earlier this week, is the way to build
confidence in it before it goes anywhere near gating a real job.

## 5. `admin_users` RLS test — confirmed fixed, re-verified directly

Already fixed (moved into `deploy-supabase`, `ADMIN_RLS_TEST_REQUIRED=1`,
fails rather than skips). I didn't take the comment's word for it — I ran
the actual mutation:

```
$ ADMIN_RLS_TEST_REQUIRED=1 bunx vitest run src/lib/admin-auth.test.ts
 FAIL  ... > refuses to be silently skipped where it is required
 AssertionError: expected false to be true
 Tests  1 failed | 8 passed | 1 skipped (10)
 EXIT:1
```

Required-but-unconfigured fails closed, exactly as claimed. This is the one
finding from the original three I can say is genuinely closed, not just
documented as closed.

## 6. TS / Deno / Swift grading logic: mirrored vectors, no live parity check — not fixed (new)

`SpokenAnswer.swift`'s own comment: *"A hand-kept port of
src/lib/spoken-answer.ts, which also has a Deno copy in
supabase/functions/grade-review... The vectors in SpokenAnswerTests are the
same vectors as the TypeScript and Deno tests, and that is what keeps the
three honest."* The same three-way duplication (plus `srs.ts`/`hearts.ts`)
is why `deno-tests` exists at all — its own header comment: *"nothing
enforces that automatically... **until this job**."*

Neither claim is quite true. "Same vectors" means the same test *inputs and
expected outputs*, copied by hand into three independent test runners
(vitest, `deno test`, XCTest). That proves the three implementations agreed
**at the moment someone last synced them**. It does not detect one person
changing the TypeScript behavior (and its own TS test) without touching the
Deno and Swift copies — each suite just keeps passing against its own,
now-stale, frozen vectors. I searched for an actual cross-runtime comparison
(something that runs the same inputs through all three implementations and
diffs the outputs) and found nothing — `id-parity.ts` is about content IDs,
not grading logic.

This is a **structural risk, not a confirmed incident** — unlike the other
findings, I don't have a case where this has actually silently drifted. I'm
listing it because it's the same shape as finding #2 (a guard whose
protection is weaker than its own comment claims), and because the
"mirrored vectors" pattern is exactly the kind of thing that looks like
enforcement in review without being enforcement.

**What a real fix costs**: either a single source of truth generated into
all three runtimes (a real refactor — these are three different languages
with three different runtimes, not just three files), or a small
cross-runtime harness that runs the same fixture vectors through the TS
function (via `bun`), the Deno function (via `deno`), and the Swift function
(via a thin CLI wrapper or `swift run`) and asserts equal outputs. The
second is buildable without a rewrite, but it's a new piece of
infrastructure, not a cheap fix — not attempting it in this pass.

## Observational: local `bun run test` can print a misleading-looking summary — not a CI defect

`vitest.config.ts` already documents this precisely (and already calls it
"the 'test that cannot fail' problem in a different hat"): under load, a run
can print `Test Files 145 passed (145)` right next to `Errors 2 errors`
(worker-fork timeouts), and a human skimming just the first line reads it as
green. I hit this exact pattern repeatedly this week on this box.

I checked whether it actually matters: the process **exit code is correctly
non-zero** when this happens (verified directly, several times, this
session) — so CI's own `bun run test` step (a plain `run:` line, no pipe)
does fail the job. This is not a repo-level guard that can't fail. It's a
legibility problem for a human reading the log, and, specifically, a trap
for me: I ran several of my own local re-verification commands this session
piped through `| tail -N`, which — without `pipefail` — reports the tail
command's exit code, not vitest's. Every time that happened I additionally
cross-checked by re-running the flagged files alone, so nothing here was
mis-reported, but the pattern itself is worth naming rather than repeating
quietly. Not something to fix in the repo; worth remembering in how I invoke
these commands.

---

## Confirmed working (mutation-tested or read carefully, no defect found)

Verified by deliberately breaking the exact property and watching for red,
not by reading the comment:

- **Migration-version uniqueness** (`ci.yml` deno-tests step) — duplicated a
  real migration's version prefix; caught.
- **Every Edge Function has a `deno.json`** (same job) — added a function
  dir with no `deno.json`; caught.
- **Bundled iOS content freshness** (`ci.yml` lint-and-typecheck) — mutated
  a scenario title in `src/data/scenarios.ts`, re-ran the export, diffed;
  caught. The diff is directory-wide, so this covers all five bundled JSON
  outputs (curriculum ×3 courses, campaigns, achievements, vocab-images) by
  the same mechanism, not just the one I mutated.
- **e2e / Playwright scope** — the "unauthenticated routes only, placeholder
  creds are enough" claim in `playwright.config.ts` is accurate and
  precisely matches what `smoke.spec.ts`/`accessibility.spec.ts` actually
  exercise. This is a disclosed limitation, not an overclaim.
- **`admin_users` is unreadable by a client token** — re-verified above.

And the broader vitest "meta-guard" layer — tests that read source files or
migrations to assert an invariant, the exact shape the three known bugs
came from — is, with the one exception above, in genuinely good shape.
Several files already document their **own** past mutation-testing history
in their comments (`migration-order.test.ts`, `curriculum-consistency.test.ts`),
meaning this class of audit has already been run against them at least once
recently:

- `admin.functions.test.ts` — every admin server function is gated, counted,
  and confined to one file (source-scan against comment-stripped text).
- `account.functions.test.ts` — GDPR export table coverage, cross-checked
  against every migration's `CREATE TABLE` body.
- `admin-route-isolation.test.ts` — the admin/learner bundle split, checked
  on the key that actually has the effect (`srcDirectory`, not
  `routesDirectory` — the file's own comment notes an earlier version of
  itself checked the wrong one).
- `migration-order.test.ts` — no migration references a table before the
  migration that creates it; its own comment documents a mutation that
  found a real gap (a bare `REFERENCES` clause) and was extended to cover it.
- `podcast-schema.test.ts`, `podcast-play-event-grant.test.ts` — RLS/grant
  assertions against migration SQL text, including "the live write path
  moved with the grant" (checked against `podcast.functions.ts` too, not
  just the migration).
- `ai-quota.server.test.ts` — every `QuotaKind` the TypeScript map declares
  is checked against the *latest* `CREATE OR REPLACE FUNCTION` body in the
  migrations (not just the first), which is what actually runs.
- `admin-auth.test.ts` — the "refusal is indistinguishable from an ordinary
  auth failure" claim, checked by pinning the shared string rather than
  duplicating it, plus the `admin_users` RLS test itself.
- `curriculum-consistency.test.ts`, `id-parity.test.ts` — content-shape and
  ID-drift guards across all three courses, several with recorded
  baselines specifically so silent regressions ratchet rather than hide.

I also swept the whole suite for the cheaper tells of a test that can't
fail — `it.skip`/`it.todo`/conditional skips outside the one already-known
case, vacuous `expect(true).toBe(true)`-style assertions, and silently
swallowed `catch {}` blocks in test files. Found none.

## Scope note

This did not include: the App Store Connect / certificate-management
workflows (`check-app-store-status.yml`, `manage-ios-certificates.yml`,
`create-subscription-product.yml`, `upload-review-screenshot.yml`,
`setup-ios-manual-signing.yml`, `configure-auth-emails.yml`). These are
manual, one-shot operational tools, not guards — they don't claim to catch a
regression, so "does breaking the property make it red" doesn't apply to
them the same way. I read all of them; nothing there is masquerading as a
guard.
