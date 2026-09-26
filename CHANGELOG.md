# Changelog

Versioned history of Learn with Alphonso (repo internal name
`english-buddy-app-33`). Grouped by milestone, not strictly one entry
per PR — see `gh pr list --state merged` or `git log` for the literal
commit-by-commit history. PR numbers are given for traceability; this
file itself won't be kept perfectly current — treat entries as a guide
to _when_ something shipped, and re-check the actual code for _how it
works now_.

## V5 — iOS Canopy theme, English content quality, GDPR export fix, podcast library (2026-09-23 – in progress)

**Accessibility, from nothing to four features** (#179, #180, #181,
#182). App Store Connect's Accessibility section had to be answered
**No** on every count: text locked at fixed sizes across 219 call sites,
VoiceOver labelling in 6 of 49 files, no reduced-motion handling, and a
dark theme that `RootView` overrode with `.preferredColorScheme` so the
system setting did nothing. Dynamic Type now scales at the single
`AlphonsoFont` chokepoint, every theme has a computed dark variant and
follows the system, correct/incorrect state is announced to VoiceOver
(it was previously never exposed at all), and every animation site
honours Reduce Motion. Still unverified by use -- nothing in the build
environment runs a simulator -- so the App Store answers stay No until
someone completes a lesson with VoiceOver on at the largest text size.

**Let people rename themselves and create a team** (#178). Leaderboards
published whatever Google supplied, usually a real name, with no way to
change it on iOS. Teams could be joined and never created. Both closed
-- and building the second surfaced a latent hole: `create_team` is the
first path that can produce a _private_ team, and `teams`' blanket
`SELECT USING (true)` would have let any authenticated user read its
`join_code`. Fixed with column-level grants, since RLS is row-level.

**The iOS app caught up with the web app** (#169, #172/#175, #174).
The Learn tab had lost its CEFR bands and was one endless scroll; the
placement exam existed only on the web, so a new iOS user was assigned a
default level and never asked. Both closed, the placement port verified
against `scorePlacement`'s actual rules rather than self-consistency --
pass at two of three, break at the first failure, place into the band
after the last passed, cap at C1. `/support` was a 404 while every other
legal page resolved, and App Store Connect requires it.

**Screenshot automation, and a test hook that ran nowhere** (#171). The
UI-test pipeline drove a signed-out app for several runs: the CI step's
shell environment never reached the simulator-hosted xctest process, so
the bootstrap never fired and the screenshots went to the simulator's
own sandbox. Fixed with a scheme-level Test-action variable. The hook
itself is `#if DEBUG` and cannot ship in Release.

**A PR with no CI at all** (#172 -> #175). GitHub silently withheld every
Actions run because the stale branch appeared to modify
`.github/workflows/`. No red X, no queued job -- just absence, which
reads as "unchecked" rather than "unverified". Two compile errors rode
in behind it. Worth knowing as a failure mode: with no branch
protection, a PR that has never run is indistinguishable at a glance
from one that passed.

**Hector re-parenting, and the defect the fix introduced** (#157, #159,
#160, #163). Phase 0 linked each account to its separate Cloud Voice
account so deletion can revoke it; Phase 1 added a server-side Pro gate
that fails closed on every "we could not tell". Phase 0 also shipped an
endpoint that accepted a Cloud Voice user id as a client-supplied claim
— anyone who knew a victim's id could plant it and later revoke their
Hector. #163 made the server derive that id from a verified token
instead, mirroring `/api/apple-link`. Phase 2 remains open.

**The Practice tab was broken by a stale base URL, not a stale token**
(#170). `AppConfig.apiBaseURL` still pointed at the old Vercel alias,
which now 308-redirects cross-origin — and URLSession drops
`Authorization` across an origin change, so every authenticated call
arrived anonymous. Session token refresh (#168) landed alongside it and
is a real fix for a real bug; it just wasn't this one.

**Signup email was broken in two ways only an inbox could see** (2026-09-26).
`site_url` was still `http://localhost:3000`, so every signup mail's
fallback link was dead, and the code was eight digits while the app asked
for six. Found by receiving the mail, not by reading the code; fixed and
re-verified the same way.

**CI guards that could not fail** (#161, #162). A sweep found that
`deploy-supabase` didn't depend on the only job validating the Edge
Function code it deploys, and that `main` has no branch protection at all
— every check in this repo is advisory. The GDPR export also silently
omitted the account's own email address.

**App Store compliance: the blockers an external audit found, closed in a
day** (#144–#151). An audit of the public repo flagged ten P0s. Every
claim in it was verified against the code before acting — all held, and
the Hector finding was worse than described.

**Sign in with Apple** (#146), mandatory under Guideline 4.8 once an app
offers Google. Built as a sibling to the Google presenter rather than a
shared abstraction, since Apple's is a native controller and Google's is
a web session. The nonce is the detail that matters: SHA-256 hash to
Apple, **raw** string to GoTrue — reversed, it still authenticates and is
a replay hole. The entitlement went to **three** files, because
`project.yml`'s generated one is not what either build config signs
with; adding it only to the obvious place compiles and fails at runtime.

**Apple token revocation** (#149). Apple requires revoking the grant on
account deletion. Server-side, because the `client_secret` is an ES256
JWT signed with the team's `.p8` and that key cannot ship in a binary.
We store the **refresh token**, not the authorization code, which is
single-use and does not survive app relaunch. **Deletion never fails on
it** — a user's right to delete their account cannot depend on Apple
being reachable.

**Native account deletion and data export** (#147), calling the _same_
server functions the web uses rather than a second implementation.
Apple requires deletion to be initiated in the app; linking out to a web
profile is what gets rejected.

**AI data disclosure** (#144), gating all four AI entry points through
one shared modifier — not four copies, because four copies is how one
gets missed and the missed one ships.

**Block and report** (#150). Apple's UGC rules require both once an app
carries social features. **The table was the easy half:** a block is
enforced at seven paths — friends, activity, leaderboards, duel
matchmaking, duel creation, invites and nudges — because a block that
stores a row and still shows the user on a leaderboard is a guard that
cannot act.

**Paywall pricing** (#148). A hard-coded "$9.99/month" sat next to a
button rendering `localizedPriceString`, so every non-US storefront
disagreed with itself. StoreKit is now the only source of price and
period.

**Legal pages** (#145, #151). Contact addresses were still
`privacy@lingua.app` — pre-rebrand leftovers on pages the product is
legally held to — **and a test was pinning the wrong one**, so the guard
protected the stale branding. The privacy policy now discloses that
**Hector is a second account in a separate Supabase project that
deleting the main account does not remove**, and names Deepgram and
NVIDIA as processors. Four new assertions guard all of it.

**Also fixed: new-user signup was broken.** The app asked for a 6-digit
code Supabase never sends to a first-time address — it sends the
Confirm-signup template, which shipped without `{{ .Token }}`. A 2026-09-21
fix had patched only the magic-link template and was "confirmed working"
by a test run from an account that already existed. Both templates now
render from one shared constant. Found on a clean simulator by signing
up as a genuinely new user — the one thing nobody with the app already
installed can do.

**Podcast admin subsystem, and offline download** (#140, which carried
#136). A second TanStack Start build from the same repo —
`vite.admin.config.ts` sets `srcDirectory: "admin"` — so no admin route
can reach the learner bundle, checked in both directions by a test,
because losing that override silently turns the admin app into a copy of
the learner app and is invisible in review. **Code-complete and
deliberately undeployed**: it needs a second Vercel project and a
hand-inserted first admin row, and episode uploads continue through
`scripts/podcast-tool.ts` until then.

Authorization is `admin_users` — **RLS enabled with zero policies** plus
`REVOKE ALL FROM anon, authenticated`, so only `service_role` can read
it. The first row is inserted by hand because every self-bootstrapping
admin mechanism is an authentication bypass waiting for a
misconfiguration. `requireAdmin` throws a message **identical** to an
ordinary auth failure; the achievable property is "a non-admin cannot be
distinguished from a bad token", not "reveals nothing", since endpoint
existence still leaks through HTTP status.

Review caught a Critical before it shipped. **"Replace audio" signed an
upload URL at the live object** with upsert, so the browser overwrote
published audio _before_ the server sniffed it — and on a sniff failure
the server then deleted it. One mislabelled file would have 404'd every
learner on a published episode, with no bucket versioning and no backup,
leaving the row `published=true` pointing at nothing. Fixed with a
staging key promoted only on success, holding the same invariant the iOS
cache already does: **a file at the final path always means a finished,
verified object.**

It also corrected a claim rather than defending it: the `admin_users`
RLS test was documented as running in CI and **ran nowhere**, because
`bun run test` executes in a job that sets no Supabase env. It now runs
in `deploy-supabase` with `ADMIN_RLS_TEST_REQUIRED=1` so it fails rather
than skips — post-merge on main, not on the PR.

**Spanish reaches question-type parity** (#134, #137, #138, #139),
closing the audit's step 7 and making it the first time all three
courses have carried the same set. Spanish gains `translate`,
`listening` and `speak` — 375 questions, 15 packs — taking it to **583
lessons / 2,915 questions**. `speak` is backed by `spoken-answer-es.ts`
across TypeScript, Deno and Swift with mirrored, mutation-tested
vectors and a CI step, and wiring `es` through every grading call site
exposed a real gap: `grade-review/index.ts`'s schema did not permit
`"es"` at all. Every speak line was round-tripped through the real
normaliser before shipping.

Spanish needed no generator change — `bank-engine.ts` had learned all
five pack kinds during French's phase 2, which was the point of putting
that work in the shared engine rather than a French-only file, and PR 1
verified it against real Spanish content rather than inferring it from
French's passing tests.

The three content PRs all appended to the same five arrays, and
reconciling them is where the interesting failure lived: two locations
had **independently made the identical edit by the same delta from the
same base**, so git saw "same change on both sides" and kept one `+5`
instead of summing. No conflict marker, clean type-check, wrong answer.
Caught by recomputing every count from the merged content rather than
trusting the arithmetic. Resolving those conflicts as text also
destroyed content twice in review — once eating an object boundary so
125 questions vanished while the file still type-checked, once
mojibaking every accented character — so the merges were rebuilt
structurally and verified on four independent axes.

**Spanish content audit — 57 duplicate prompts to 0, and the 95% nobody
had measured** (#122, #127, #130, #132). Spanish had no
`.audit-baseline/spanish-ids.json` at all, so an inserted line would have
silently repointed real learners' review items with nothing to catch it;
that baseline exists now. Of the 57 cross-pack duplicates the newly-gated
check surfaced, **40 were true repeats** and **17 were contradictory** —
the same prompt with different correct answers, which marks a correct
learner wrong: `"nurse"` accepted `enfermero` in one pack and `enfermera`
in another, and `yo ___ (hacer) mi tarea.` wanted `hago` in one and
`he hecho` in another with no tense cue in the prompt to choose between
them. All fixed by 1:1 in-place replacement, so no question id moved.

Two decisions were recorded rather than left implicit. **Variety: Latin
American** — measured, not preferred: `vosotros` and `vos` each appear
**zero** times across the existing 2,540 questions, so anything else
would have introduced the first Spain/Latin-America split into shipped
content. **Short packs: accepted and documented, not filled** — 83 of 130
packs carry fewer than 25 lines, and filling them means authoring ~710
unreviewed lines under audit cover.

And a measurement worth more than a fix: **95.0% of resolvable distractors
in Spanish verb-conjugation drills come from a different verb** (1,611 of
1,695), so `Yo ___ (hablar) español.` is answerable by matching the stem
rather than knowing the conjugation. **This is not a ranking defect** — a
conjugation pack holds one form each of several different verbs, so the
pool contains almost no same-verb alternatives to rank, and porting
`orderDistractorCandidates` would look like a fix and change nothing.
Closing it is structural, and separately scoped.

**Podcast library gets transcripts, search, and three guards** (#114,
#118, #119, #120, #123, #125, #126, #129). Episode 1 ("Ordering Coffee",
English A1, 2:52) is published — the first real audio behind the Listen
tab. **Phase 2a adds transcripts on web and iOS**, an accessibility
obligation rather than a feature: the players carry no captions, so
without text on screen an episode is unavailable to deaf and
hard-of-hearing learners. `--transcript` **rejects markup**, because a
TTS script is not a transcript — episode 1's script carries ElevenLabs
SSML that would otherwise have rendered to exactly those readers. Flat
search escapes both LIKE wildcards and PostgREST `or=()` syntax, each
mutation-tested separately, since both return plausible results for the
wrong query. `podcast-tool` stopped silently dry-running on a mistyped
`--confirm`; `validate` exits non-zero when it reports problems instead
of printing `[ERROR]` lines and returning 0; `music-metadata` is imported
lazily so commands that never read audio no longer die at import; and the
iOS mini bar docks inside each tab rather than on the `TabView`, which
had left it overlapping the tab bar on device.

**The admin app is live** at `admin.alphonsoecosystem.app`, on its own
Vercel project built with `bun run build:admin`. Vercel Auth stays at
`all_except_custom_domains`, which means the `*.vercel.app` URLs answer
with an SSO redirect before the app loads and only the custom domain
reaches it -- so the custom domain is the only place a "non-admin is
refused" check exercises the allowlist rather than Vercel. The
service-role and publishable keys are scoped to production only, so
previews build but cannot reach Supabase; a preview URL of a
service-role-holding app is a liability rather than a convenience.

**Four follow-ups from the branch review.** No admin write reports a
success it did not have: a PostgREST update or delete against a vanished
id succeeds with zero rows touched, and every mutation returned
`{ ok: true }` for it, so deleting an already-deleted folder was reported
as done -- this repo's recurring defect in its plainest form. The folder
move refusal now **names the cycle** (`findCycle` always returned the
path and the caller discarded it), and a **parent picker** finally makes
that move reachable: it was gated, counted and tested but callable from
nowhere, so the cycle guard protected nothing a person could do. Two CI
comments were corrected rather than left to mislead -- `admin-build`
catches a _missing_ route tree, not a stale one, and the allowlist RLS
check runs in `deploy-supabase`, which is `push && ref == main`, so it
fires **post-merge, not on the PR**: a regression alarm, not a merge gate.

**A podcast admin app, separately deployed** (Phase 4). The account
owner can now manage the library from a browser instead of a terminal:
folders, episode metadata, audio upload, publish/unlist and transcripts.
It is a **second TanStack Start build from the same repo** pointed at
`admin/routes`, so no admin code reaches the learner bundle, and a test
checks that in both directions.

Access is an allowlist table with **RLS enabled and zero policies**, plus
a revoked grant, so only the service role can read it — an allowlist the
guarded app can read is one an attacker can enumerate. The first admin is
inserted by hand; there is deliberately no bootstrap endpoint. Every
admin server function lives in one file so a single test can enumerate
them and fail if any lacks the gate, and that test reads the source,
because TanStack does not expose its middleware chain at runtime.

Audio uploads go straight to Storage through a signed URL — a serverless
body is capped near 4.5 MB and base64 inflates by a third, so an ordinary
3 MB episode would have failed at the platform — and the server then
verifies the stored object by **signature rather than extension**,
deleting it when it is not audio. Validation reuses the CLI's tested
functions throughout, so the two publishing paths cannot drift.

Two defects found by mutation rather than by reading: a sniff test that
passed with its guard removed (`bytes(0xff)` returns null either way),
and the plan's assumption that `normalizeTranscript` returns null for
markup when it actually throws — a handler built on that would have saved
an empty transcript and reported success.

**Offline download for podcasts on iOS** (#133, #136). Listening happens
on trains and planes, which is where the Listen tab previously stopped
working. Downloaded episodes live in **Application Support** rather than
Caches (the system purges Caches; a deliberate download should not
evaporate) and are excluded from iCloud backup. Staging name → byte-count
verification → atomic move → _then_ the database row, so a file at the
final path always means a finished download; launch reconciles both
directions, since being killed mid-transfer is ordinary on iOS.

**Nothing is ever deleted automatically** — exceeding the budget names
what could be removed and waits. The first design evicted automatically
while exempting explicit downloads, and with automatic downloading out of
scope every download is explicit, so that policy could never have run.
The budget is injectable at every level for the same reason the old one
was unreachable: at the 500 MB default, a library this small can never
reach the refusal path, and a guard that cannot execute is the defect,
not the test. Republish detection rides on Supabase's `ETag`, probed and
confirmed to be the **MD5 of the object's content** and stable through
Cloudflare — so it needed no migration. Offline browsing is flat and
title-ordered rather than the folder tree, and "offline with nothing
downloaded" is its own state.

Every rule lives in the Kit and none in the app target, because
`ios-swift-tests` covers the Kit and nothing covers the app target;
`ios-app-build` compiles it and runs nothing. **The app-target half is
compile-checked only** and carries seven device checks in #136, plus two
still outstanding from earlier phases.

**`maxWorkers` pinned in `vitest.config.ts`** (#116). A starved run had
been printing `124 passed (124)` beside `Errors 6 errors` — six files
that never executed, next to a line that reads as success. Three sessions
lost time to it in a single day. Suite is now **137 files / 1,189 tests**.
The pin fixed CPU contention and cannot fix memory: a starved run on this
machine can still fake a _named_ test failure.

**French reaches question-type parity with English** (#115). `speak`
joins `listening` and `translate`, backed by `spoken-answer-fr.ts` ported
across TypeScript, Deno and Swift with mirrored vectors and a CI step, and
5 packs authored against the real normaliser. French: 115 packs, 575
lessons, 2,875 questions, six question types. The generator work landed in
`bank-engine.ts` rather than a French-only file, so **Spanish inherits all
five pack kinds for free**.

**Placement exam stops reusing lesson questions** (#128) — the exam decides which
band a learner starts in, and **25 of English's 60 placement questions were also
lesson questions**, so anyone who had met one was scored on recall of that item
rather than on level. The error only ran upward, and a learner placed a band too
high starts on content they cannot do. All ten listening questions were the worst
of it: their sentences were lifted verbatim from the course's own listening packs
when the exam learned that question type. French was clean; Spanish had 2.

No existing check could see this, structurally: one suite compares lesson
questions with each other and never reads the placement pool, the other compares
placement questions with each other and never reads the banks.
`placement-lesson-overlap.test.ts` now covers that pair, gated at zero for all
three courses, plus a repeats-within-one-pool check (the pool is sampled three per
band, so the same content in two bands can be drawn twice in one sitting). All 27
questions were re-authored on the placement side, keeping band and construct —
placement ids are not review keys, so no learner's saved review state was touched.

**English content quality — 8 repeated questions removed, and the check that
found them stops whispering** (#121) — `curriculum-consistency.test.ts` looks for
the same sentence appearing in two packs, which a learner experiences as a
repeat. For English and Spanish it was report-only and printed via `console.log`,
which vitest intercepts: every run showed 46/46 passed and printed nothing while
holding 7 English and 57 Spanish findings. Two sessions independently recorded
that check as "already clean" on the strength of a quiet run.

The reported 7 was itself understated. A hand-written question's id is `q7`, so
the check's pack-id derivation produced `""` and collapsed every hand-written
question into one pseudo-pack, making duplicates _between_ hand-written units
invisible — that hid two more, including an identical question with an identical
answer in two units. A third bug rendered `listening` and `translate` answers as
`(undefined)`, so three real findings looked like reporting artifacts. All three
are fixed, and the check now asserts against a recorded per-course count
(`{ en: 0, fr: 0, es: 57 }`) so a new duplicate fails the run with the findings in
the message. English content: 8 duplicates fixed in place, no question id moved.
The two worst put an identical A1 task in the A2 translation pack.

**English content quality — a1p15's distractors stop crossing word classes**
(#117) — closes the content audit's one deferred defect. Multiple-choice
distractors are drawn from a pack's own answers and ranked by part of speech, but
tags are read from each answer's own cloze sentence and a "pair" pack line has
none. So a1p15 "Shapes & Sizes", which mixes shape nouns with size adjectives,
had no tags and no ranking: **23 of its 25 questions** offered a distractor from
the other class, and "is a perfect cube shape" offered [cube, huge, narrow,
average] — three of four size adjectives, answerable with no geometry. Now **0 of
25**, via 25 hand labels held in a per-pack override map. No pack data changed, so
no question id moved, and a1p15's 25 questions are the only ones in the course
whose choices changed.

The interesting part is what was tried first and withdrawn, because both looked
like the careful option. Reading each pair pack's prompt template as a
declaration of its answers' class ("Which verb goes with …?" cannot be answered
by a noun) is true but **inert** — ranking is relative within a pool, so a class
shared by every candidate expresses no preference — while its side effects were
real: 43 questions degraded across 11 packs, 0 improved. And that damage came
from assuming a dropped tag is a neutral abstention. It is not: `rank()` resolves
an untagged candidate to the answer's own class, so **dropping a tag promotes the
word**. Both were caught by whole-branch review, and the audit log records the
measurements.

**Podcast library Phase 1b — the iOS Listen client** — browse the folder tree, play an
episode, keep playing with the screen locked, and resume across devices. **This lifts the
Phase 0/1b release constraint**: Listen is no longer a placeholder.

`PodcastClient` is the first time the iOS app fetches _content_ from the server rather than
its bundle — `ContentStore` is explicitly "No network calls, no async" because curriculum
ships in the binary, which podcast content cannot do if the library is to grow without an
App Store release. Models, folder-tree logic, resume clamping and URL building are ported
into `LearnWithAlphonsoKit`, where they are actually tested; each port names its TypeScript
original and that file's tests so drift is visible in review.

Three decisions worth knowing:

- **Play events go through `record_podcast_play_event`**, never a direct insert. iOS was
  new code walking toward a hole just closed on web, and it would have failed silently
  inside a fire-and-forget call. Mutation-tested.
- **Resume uses optimistic concurrency on `updated_at`.** Guarding on position magnitude
  would reject a deliberate rewind; guarding on `now()` would accept the stale write it is
  meant to reject, since `now()` is evaluated when the write lands. Only observation
  recency separates them.
- **Interruptions are handled by type.** `.shouldResume` is honoured for a call, an alarm
  or Siri — never resuming would make a podcast silently die after a phone call — and
  suppressed only when one of the app's own mic screens took the session. The four
  recorders now mark `RecordingState`, read at interruption-_began_ because a recorder's
  `stop()` is itself what makes iOS send `.shouldResume`.

`UIBackgroundModes=audio` is new and App Store review-visible. The audio layer has no
automated coverage and cannot have any here, so it is device-verified or not at all.

**Podcast play events are written through a validating function** — `podcast_play_events`
shipped with a direct INSERT grant to `authenticated`, so any signed-in client could write
arbitrary `seconds_listened`, arbitrary `started_at`, and any episode id including
unpublished ones (foreign keys do not consult RLS). It is the one table Phase 2's XP and
SRS wiring is meant to trust, and Phase 1a was already live and accumulating rows, so this
bounds how much data of uncertain provenance exists rather than only protecting future
rows. Same shape as the gamification hardening in `20260920050000`. The web client moved
to the function in the same change — revoking the grant alone would have failed silently
inside a fire-and-forget call, stopping play recording with no error anywhere.

**Podcast library Phase 0 — iOS tab consolidation** — five tabs (**Learn · Listen ·
Practice · Hector · Profile**), down from seven. This fixed a live defect rather than
only making room for Listen: iPhone renders five tabs and collapses the rest into the
system "More" list, so Achievements was already buried, and League and Achievements were
both using `trophy.fill`.

League, Friends and Achievements moved behind a new `ProfileHubView`. They are presented
rather than pushed, because each owns its own `NavigationStack` (and two of them push
Teams/Season/Duels through it) — nesting stacks compiles cleanly and gives two navigation
bars on a real screen.

The review queue needed an entry point built, not moved. The Phase 1 spec had claimed
Learn already carried a due-count badge; that is true on web and was false on iOS, where
`ReviewQueueView` was instantiated in exactly one place — the tab bar. Learn now has a
review row (visible even at zero, so the queue is never unreachable) and a tab badge that
hides at zero. The badge rule lives in `LearnWithAlphonsoKit` so it is unit-tested; the
app target has no test coverage anywhere in this repo, only `xcodebuild` in CI.

**Listen shipped as a placeholder here and was filled by Phase 1b above, so the release constraint this entry originally carried is lifted.**

**Podcast/audio library, Phase 1a (web)** — a Listen tab: a folder tree of
short audio episodes, browsable at any depth through one splat route, with a
mini-player mounted in the app shell so playback survives navigation between
folders, and a per-user resume position that syncs across devices.

Four new tables (`podcast_folders`, `podcast_episodes`, `podcast_playback`,
`podcast_play_events`) plus a public-read `podcast-audio` Storage bucket — the
first binary-media subsystem in the app; everything before this was live
Deepgram TTS and stock-image URLs. Content is published by the account owner
via `scripts/podcast-tool.ts`, which takes either a recorded MP3 or a script it
has Deepgram speak, so the library grows without a deploy or an App Store
release.

Two things this work turned up elsewhere: the GDPR export list had to learn the
two new per-user tables (`account.functions.test.ts` caught it, which is exactly
the drift that test was added for), and mounting a component in `AppShell` that
statically imports server functions pulls the Supabase auth middleware into
every page's import graph — now imported lazily.

Live since the migration applied on merge (`deploy-supabase` ran green); the bucket
and its read-only policy are created by that same migration. iOS landed in Phase 1b
above; transcripts, questions, XP and SRS are Phase 2. Spec:
`docs/superpowers/specs/2026-09-24-podcast-library-phase1-design.md`.

V5 work runs as parallel isolated worktrees, one per feature, kicked off
from `docs/v5-kickoffs/` (gitignored). Three PRs merged 2026-09-24 in
one sitting (#84 → #83 → #85, in that order and for a reason — see
"Merge sequencing" below).

**Canopy theme (#83, iOS)** — a fourth, iOS-only theme (emerald/coral,
mascot-forward), now the default for installs/accounts with no saved
theme preference, rolled out across all ~17 already-styled screens.
Prompted by direct feedback that the original three themes read "too
much like a book and wordish", plus a real usage gap (mascot art was
bundled but barely used). Meadow/Studio Ink/Manuscript are unchanged.
`canopy` is a deliberate exception to the "themes stay in sync with the
web's `THEME_NAMES`" rule — it is in `AlphonsoThemeID` and the
`profiles.theme` CHECK constraint but absent from `THEME_NAMES`, since
web has no CSS for it; `resolveInitialTheme` already falls back to
`meadow` for unknown values, so web is unaffected. A subagent review
caught a Critical bug pre-merge: `profiles.theme`'s `NOT NULL DEFAULT
'meadow'` silently defeated the new default for every signed-in user,
fixed by a follow-up migration making the column nullable.

**English content quality (#84)** — plausible-distractor fix plus an
audit of all 534 English lessons. Adds `src/data/answer-pos.ts`
(part-of-speech data), `src/lib/distractor-affinity.ts`, an audit
baseline (`.audit-baseline/english-ids.json`) and scanning tooling
(`scripts/audit-scan.ts`, `snapshot-english-ids.ts`,
`gen-answer-pos.ts`), with ID-parity and distractor-quality tests.
Lesson _counts_ are unchanged — this changed question quality, not
structure.

**GDPR export fix + lint scope (#85)** — `exportMyData` had been
returning **incomplete** data. It listed 9 tables keyed by `user_id`
while the migrations define 18: the gamification (#64–67) and push
(#59) batches each added user-scoped tables that were never registered,
so every "download my data" file had been missing 9 tables since those
landed. It also missed `nudges`/`duels`, which are user-owned but keyed
by `sender_id`/`challenger_id`. **Account deletion was never affected** —
all of them cascade from `auth.users`. The one list became three
(`USER_ID_EXPORT_TABLES`, `OTHER_OWNED_EXPORT_TABLES`,
`USER_DELETE_TABLES`), because export and deletion genuinely need
different sets: deletion runs as the caller and only `device_tokens`
among the new tables grants DELETE to `authenticated`. Since this list
had now drifted four times, always silently, a test parses
`supabase/migrations/` and fails the build on drift.

Same PR scoped ESLint to the live tree: `.claude/worktrees/**` (full
checkouts of other branches, nested inside the repo) was never ignored,
so `eslint .` linted all 15 of them — 3,632 problems, of which 3,630
were other branches' code and 2 were real.

**Merge sequencing** — worth remembering, because the symptom was
misleading. #83 and #85 both showed `lint-and-typecheck` failing, which
looked like two broken PRs. Neither was: a pre-existing
`prettier/prettier` break in `scripts/upload-review-screenshot.ts`
(landed in `566b71c`) was failing CI on _every_ PR, and #84 happened to
contain the fix. Merging #84 first turned both others green with no
work. #83 and #85 both touched `ARCHITECTURE.md` but in different
sections, so they auto-merged with zero conflicts (verified by
`git merge-tree` dry-run before merging, rather than discovering it
mid-merge). #83/#84's branches were updated via `gh pr update-branch`
rather than a rebase force-push, since live sessions were still working
in those worktrees.

**Placement covers the new question types (#107)** — the exam now assesses
`listening` (10 questions, two per band) and `translate` (5, one per band)
alongside multiple choice. Before this it tested only multiple choice, then
placed learners into a course where roughly one question in eight is listening,
speaking or translation.

`speak` is left out on purpose: asking for microphone permission during
onboarding, where a denial makes the question unanswerable and the typing
fallback would assess writing while claiming to assess speaking, is a worse
trade than not asking. Argued in the plan so it can be overturned knowingly.

The shape change underneath is that `PlacementQuestion` became a union and
grading moved behind one helper that takes the submitted **text** — the exam
previously compared an option index, which only multiple choice can express.
`/api/grade-translation` also learned to resolve placement ids: that pool lives
outside the curriculum's question index, so without it every placement
translation would have 400ed, and since the client reads a 400 as "no verdict",
it would have failed silently and mis-placed people rather than erroring. Same
shape as the `consume_ai_quota` bug in phase 4 — a refusal read as an absent
opinion.

Two testing notes came out of it and are now in AGENTS.md, because two other
sessions write React tests against controlled inputs: `user.type` can leave
only the last character in a controlled field (it read as "grading is broken"
and cost three wrong hypotheses about the scoring rules), and running two
vitest or two build processes at once produces failures that look exactly like
real regressions.

**Free-form translation question type (#107)** — a sixth question type,
`translate`: the learner is shown an idea to express ("Ask someone their name")
and writes it in English themselves. 125 questions across all five CEFR bands
(one pack each), taking English to 609 lessons / 3,096 questions.

Grading is hybrid and local-first. A curated list of acceptable wordings settles
most answers for free and works offline; only what it rejects is put to an AI
grader (NVIDIA NIM), which can upgrade a local miss but never the reverse. The
web paths resolve the model through `resolveNvidiaChatModel`; the Edge Function
cannot import from `src/`, so it mirrors that constant — and is now listed
alongside the other hardcodes in `nvidia-chat-model.server.ts`'s doc comment,
which exists because four of them broke at once when NVIDIA retired a model. The AI verdict is never written back
into the content — what counts as correct stays a content decision rather than a
side effect of someone's answer.

The design decision that shaped everything else: **a translate answer is graded
in three places**, and they have to agree. `/api/grade-translation` serves the
lesson player, `gradeReview` serves web review, and the `grade-review` Edge
Function serves iOS review. Putting the AI half in only one of them would
recreate the bug the speaking type was already bitten by — a wording accepted on
screen and re-derived by string comparison in the scheduler, so the learner
reads "Still got it" on an item that was just lapsed. The review players now
**display the verdict from the call that scheduled the item** instead of
grading a second time, which is what makes that disagreement impossible rather
than merely unlikely. An independent review caught the first attempt getting
this exactly wrong on iOS — displaying `/api/grade-translation`'s answer while
`grade-review` independently decided the schedule.

Two rules the whole feature rests on:

- **`null` is not `false`.** Vendor down, key missing, quota spent, model
  replying in prose — all mean "no opinion", and the local verdict stands. A
  learner is never marked wrong because a vendor was unavailable.
- **Offline still grades.** The acceptable wordings are bundled content, so a
  translation resolves with no network — stricter, but resolvable. The spec had
  said to skip speaking and translation questions when offline; that would break
  `deriveLessonCompletion`'s count check, which is how a learner finishes a
  lesson and silently receives no XP, no streak and no unlock.

Also in this phase: the deploy pipeline was repaired (see above), CI's
never-executed curriculum-seed step was switched from `bunx tsx` to `bun` so its
first real run is not also the first test of its command, and AGENTS.md stopped
claiming three-course parity — English is now 609 lessons to French's 500 and
Spanish's 508, with three English-only question types.

**Deploy pipeline repair (2026-09-24)** — `supabase db push` started failing on
every push to `main` (the `#93` and `#94` merges both show it), with "Remote
migration versions not found in local migrations directory". Cause: the
speaking migration was applied to the live project through the Supabase
management API rather than by the CLI, which recorded it in
`supabase_migrations.schema_migrations` under a generated version
(`20260924081755`) that no local filename matched. The local file has been
renamed to that version, which is what `supabase migration repair` would have
achieved from the other direction.

Worth knowing because of what else that job does: it is the step that deploys
the Edge Functions. While it was red, **no function redeployed** — so a
`grade-review` change merged during that window was live in the repo and not on
the server.

**Speaking practice question type (#107)** — a fifth question type, `speak`:
the learner is shown a phrase, records themselves saying it, and the
speech-to-text transcript is graded. 125 questions across all five CEFR bands
(one pack each), taking English to 584 lessons / 2,971 questions.

Grading a transcript strictly does not work: the same utterance comes back
spelled differently run to run ("She's a doctor", "she is a doctor", "shes a
doctor", "um, she's a doctor"). `src/lib/spoken-answer.ts` normalises
contractions, apostrophe-less spellings, fillers and punctuation and then
compares exactly — deliberately **not** edit distance, since a threshold loose
enough to forgive "she's"/"she is" also accepts "he is a driver" for "she is a
doctor".

The rule lives in `deriveAnswerCorrectness`, not in the players, because
`grade-review` re-derives correctness server-side; a client-only rule would show
"Still got it" and lapse the item anyway. It therefore exists in three
hand-kept copies (TypeScript, the Deno mirror, `SpokenAnswer.swift`) with the
same vectors in all three test suites.

Three things found while building it that tests could not have caught on their
own:

- Deepgram is called with `smart_format=true`, which returns spoken numbers as
  **numerals**. "The bus leaves at nine" transcribes as "…at 9", so a learner
  saying it perfectly was marked wrong — and that phrase was already in the
  authored A1 pack. Number words now collapse onto digits in all three copies.
- Nothing captured must never be graded. A denied microphone, a too-short clip
  and silence all reach the player looking identical to a wrong answer, so the
  capture layer reports **only** a real non-empty transcript and every failure
  path surfaces an error instead. Otherwise the learner loses a heart for a
  microphone problem.
- Where speech cannot be captured, the control degrades to typing the phrase —
  driven by actual failure, not only by feature detection. A denied microphone,
  a dead network, a failing `/api/stt`, silence, and (on iOS) being offline all
  reach it. A question the learner cannot answer is a lesson they cannot
  complete, which means no XP, no streak and no unlock, with nothing on screen
  explaining why.

Also: the capture flow was extracted from the conversation route into
`use-speech-capture.ts` rather than copied, both web players now grade through
`deriveAnswerCorrectness` instead of their own inline copies of the rule, and
`20260924081755_v5_speaking_question_type.sql` adds a **fourth** allowed row
shape to `question_shape_matches_type` (answer text, no choices, no bank, no
answer index) — without it every speaking row would be rejected.

**Listening comprehension question type (#88)** — a fourth question type
(`mc`/`fill`/`reorder`/`listening`), replacing the hidden `audioText`-on-`mc`
format that only 3 questions used. 125 questions across all five CEFR bands
(one pack each), taking English to 559 lessons / 2,846 questions.

Its `answer` is the correct choice's **text**, not an index like `mc`'s. That
was chosen on evidence — a probe of both shapes against `tsc` gave 14 errors
across 6 files for an index versus 8 across 4 for text — and it means **no
grading code changed on either platform**, since `srs.ts` and both web players
already compare `answer.trim()` for non-`mc` types.

Two things it forced that were not obvious up front. A new question type has to
be wired into _both_ players on _both_ platforms plus three Kit switches — six
exhaustive switches on iOS, including `ReviewQueueView.swift`, a second iOS
player; a type handled only in the lesson player renders a blank card in spaced
review (silently on web, as a compile error on iOS). And it needed a migration:
`questions.question_shape_matches_type` allowed exactly two row shapes, and
listening is a third (`choices` like mc, `answer_text` like fill), so every row
would have been rejected — `20260924010000_v5_listening_question_type.sql`,
following the same widening done for `reorder`.

iOS `Question` decoding was made lenient (an unknown `type` decoding to a
filtered `.unsupported` case) and then **reverted to throwing** before the PR
landed — this entry described the wrong end state until 2026-09-24. Skipping an
unknown question leaves the lesson with fewer questions than the server's copy,
and `deriveLessonCompletion` throws on that mismatch, so the learner would have
finished the lesson and silently received no XP, no streak credit and no error.
Content ships inside the same binary and CI fails the build if the exported JSON
drifts from source, so the version skew leniency was protecting against cannot
happen yet.

## V4 — Spanish course, remote push, placement, campaigns, content tooling, widget, deeper gamification (2026-09-21 – in progress)

Batch of independent V4 candidates from `docs/v4-kickoffs/00-INDEX.md`,
each its own worktree/branch/PR with real CI verification before merge
(PR #59 for the first five; V4 #7's four sub-plans below merged
separately, PRs #64-#67).

**Spanish course (#1)** — third course, full parity with English/French:
130 packs, 508 lessons, same CEFR A1-C1 structure via the existing
bank-engine pipeline. `Course` type widened to `"en" | "fr" | "es"`
across all ~22 call sites (web + iOS).

**Real push notifications (#2)** — see `send-push` Edge Function in
`ARCHITECTURE.md`. Upgrades nudge-a-friend and leaderboard-overtake from
polling/in-app-toast to real APNs push. Built end-to-end but gated on a
human-created APNs Auth Key (an interactive Apple Developer portal
action no agent can perform) — no-ops gracefully until that key and its
four secrets are set, same precedent as `REVENUECAT_API_KEY`.

**Placement test / smarter onboarding (#3)**, **multi-turn conversation
campaigns (#4)**, **content authoring tooling (#5)** — done, no
blockers; see `docs/BACKLOG.md` §1 for what each actually shipped.

**iOS widget (#6)** — home-screen streak widget (not a Live Activity —
scoped down from the index's either/or framing), signed and shipped in
TestFlight build 8. Needed a real App Group + second provisioning
profile, extending `ios-release.yml`'s manual-signing pipeline (see
that workflow's own comments) — the same signing-cert saga V4's
handoff doc flagged as "fully resolved" for the main app target turned
out to need a second round for the widget extension target.

**Deeper gamification (#7)** — three systems (a fourth, themed content
events, explicitly deferred — see
`docs/superpowers/specs/2026-09-22-deeper-gamification-design.md`'s
own "Deferred" section for whoever picks it up):

- _Teams_ — persistent groups (invite code, public discovery,
  auto-assign, 7-day switch lock), weekly-XP-sum leaderboard, a lazy-
  resolved weekly win bonus (+100 XP to last week's #1 team, no cron).
- _Challenges_ — fixed weekly solo goals (6 DB-seeded templates, same
  pattern as `achievements`) plus open/stranger duel matchmaking
  (`join_open_duel_queue`, `FOR UPDATE SKIP LOCKED`). Also shipped the
  first duel UI on either platform (web `/duels`, iOS `DuelsView`) —
  the `duels` table and its RPCs existed since V3 but nothing had ever
  surfaced them, an unplanned-but-approved scope addition. Along the
  way, fixed a real bug live since the V4 #1 Spanish launch: `duels`'
  `course` CHECK constraint only allowed `('en','fr')`.
- _Season ladder_ — Duolingo-style weekly promotion/demotion cohorts
  (~30 members, 5 divisions, `floor(size/3)` promote / `floor(size/6)`
  demote), distinct from the permanent `league_tier` badge. The one
  system complex enough to be an Edge Function (`get-season-status`)
  rather than a PL/pgSQL RPC — its ranking/promotion math is pure,
  unit-tested TypeScript.

All four V4 #7 migrations/Edge Function merged to `main` in dependency
order (`weekly_xp` shared helper first, since Teams' and Season
Ladder's migrations both call it) — see `ARCHITECTURE.md`'s database
table for the new schema and `docs/BACKLOG.md` §1 item 7 for the merge
history, including which PRs needed a real rebase (not just a
fast-forward) against an already-merged sibling.

**iOS design system** — not one of the original V4 kickoff candidates;
prompted directly by the user opening the TestFlight build and finding
it had essentially no visual design (stock SwiftUI throughout, zero
design-system files, `Assets.xcassets` with only the app icon). Ports
the web app's default Meadow theme (`src/styles.css`) to a real SwiftUI
design system (`ios/LearnWithAlphonso/Sources/DesignSystem/` — color/
spacing/radius tokens computed from the CSS's oklch values, Fraunces/
Geist bundled as variable fonts and resolved via CoreText, the
`.hard-shadow` pressed-button effect) and applies it to every screen,
including Season/Teams/Duels once that work merged (see `ARCHITECTURE.md`'s
"Native iOS app" section for the full breakdown). Meadow only — no
in-app theme switcher, dark mode, or the CSS grain-texture effect, all
deliberately deferred. Built in its own worktree/branch off `main`
throughout to stay clear of V4 #7's concurrent work; `ios-app-build` CI
green on every commit, including a real bug it caught (see
`ARCHITECTURE.md`'s "Known rough edges" for the `Section`/`header:`
brace-nesting gotcha that caused it).

**iOS theme system + real-device bug fixes** — direct follow-up once
the user actually tested the design-system build on their phone via
TestFlight. Found two things: (1) almost every screen was near-illegible
— white text on a light background — because the device was in system
Dark Mode and the app's fixed-light palette didn't account for that;
(2) the sign-in screen had a real layout bug (a `Divider()` in an
`HStack` stretching to fill the screen) and looked sparse. Root-cause
fix for (1): the design system became a real _theme system_ (Meadow +
the web's other two themes, Studio Ink and Manuscript, all three now on
iOS) with `.preferredColorScheme` pinned to whichever theme is active,
so system-styled chrome resolves colors against the theme's own
light-or-dark-ness instead of the device's setting — this is also what
makes Studio Ink (legitimately dark by design) render correctly, not
just a Dark Mode workaround. New in-app theme picker (`SettingsView.swift`,
the app's first settings screen) syncs the choice to `profiles.theme`
in the background, round-tripping with the web app's own theme picker
on the same account. Sign-in screen got a real visual pass, not just
the bug fix. See `ARCHITECTURE.md`'s "Native iOS app" and "Known rough
edges" sections for the full breakdown.

**iOS liveliness pass + mascots** — two more rounds of direct real-device
feedback. First: the course-language picker showed only a single
truncated letter per option ("E/F/E" — English and Español
indistinguishable), and the app "didn't feel alive" — fixed with a
compact flag-based `CoursePicker`, a new `StatusHeaderView` (streak/
hearts/XP/league tier, with a continuously pulsing flame) on the Learn
tab, a gradient primary button instead of flat fill, and staggered
spring-entrance on lesson/leaderboard rows as they scroll into view.
Second: the user pointed out the app has two named personas — Alphonso
(its own namesake/host) and Hector (the Pro AI tutor) — with zero visual
form anywhere, and generated real character portraits for both
(user-provided, not AI-generated by this session — Higgsfield was out of
credits). Alphonso now shows up for wrong-answer help in the Lesson
Player and Review Queue (a portrait + explanation card sliding in on a
wrong answer) and greets the user on the sign-in screen; Hector has his
own portrait on his sign-in step and a small avatar beside his chat
bubbles. Alphonso does wrong-answer help rather than Hector deliberately
— Hector is Pro-gated ($9.99/mo), and giving him away for free in the
ordinary lesson flow would undercut the subscription. See
`ARCHITECTURE.md`'s "Native iOS app" section for the full breakdown.

**`AlphonsoTipCard` speech-bubble redesign** — same-day follow-up: the
user sent a mockup wanting Alphonso bigger and speaking through a real
speech bubble rather than the small circular-avatar card, explicitly
asking for one version, not both. New `SpeechBubbleShape`, a larger
88×112pt portrait, kept deliberately in-flow (not an overlay) so it
can never cover the Check/Continue button the way the user's own
reference mockup did. Merged PR #72 — real CI caught a genuine bug
before merge: `SpeechBubbleShape` needed `InsettableShape` conformance
(not just `Shape`) for `.strokeBorder` to compile.

**Course picker still unreadable — root-cause fix** — real device
screenshot on build 12 showed item 13's flag+2-letter-code fix wasn't
enough: `.pickerStyle(.segmented)` itself is too narrow a control for a
`.topBarLeading` slot competing with a large `navigationTitle`, so
segments still clipped to unreadable slivers. Switched to
`.pickerStyle(.menu)` — a menu picker only ever renders one selection +
a chevron, so it always has room regardless of screen size. Merged
PR #73, no conflict with PR #72 despite both touching
`AlphonsoComponents.swift`/`ARCHITECTURE.md`. This is the third
consecutive iOS UI PR where CI-green and looks-right-on-device
diverged at least once (see `docs/BACKLOG.md` items 11/13/15).

**SM-2 audit + lapse-interval fix** — a read-only audit of
`src/lib/srs.ts` (prompted by "can these deferred items be tackled?")
found the post-lapse interval formula's third branch was dead code:
`RETIRE_AFTER_REPETITIONS=4` caps live repetitions at 3, so
`floor(repetitions * 0.5)` can only ever be 0 or 1, meaning every lapse
collapsed to the same fixed 1-or-3-day interval regardless of how much
progress the item had earned — defeating the "halving, not zeroing"
softening the code's own comments already described. Fixed: interval
now scales proportionally off the item's real prior interval (a
40-day item and a 3-day item both halve to the same repetitions
bucket, but now land on 20 days vs. 2 days, not the same fixed step).
No telemetry exists to check lapse/retention rates against real usage
— flagged as a gap, not fixed. Merged PR #74.

**Content-generator case-bug fix + automated consistency scan** — a
new `src/data/curriculum-consistency.test.ts` (CI-enforced going
forward) scans all 3 course content banks for structural bugs
(duplicate ids, out-of-range answers, duplicate MC choices, fill
answers missing from their own bank, orphaned vocab-image keys). On
its first run it found 5 real questions across all 3 languages with
duplicate-looking answer choices (e.g. English "may"/"May", French
"est"/"Est") — traced to `pickDistractors` (duplicated in both
`lesson-bank.ts` and `bank-engine.ts`) deduping candidates
case-_sensitively_, so a cloze pack reusing the same word as the
correct answer for two differently-capitalized lines could surface
both casings as separate choices. One logic fix in both duplicated
copies, not 5 content edits, since content regenerates from packs on
every load. Merged PR #75.

**Generative sentence-template content (pilot, English-only)** — new
`generate` subcommand on `scripts/pack-tool.ts`: an LLM proposes
candidate vocabulary for a topic, a real morphological library
(`compromise`) — queried via a verified derivation strategy that works
around two confirmed bugs in the library's own subject-agreement
detection — is the sole authority that conjugates verbs and compiles
final sentences. Grammar templates are hand-authored, never
LLM-proposed. Output feeds the _existing_, unmodified
`validate`/`preview`/`apply --confirm` pipeline. Built via
brainstorming → spec → 11-task TDD implementation plan → a fresh
whole-branch review (dispatched on a separate model, not
self-reviewed) → a fix pass on 3 Critical + 6 Important findings the
review caught (sampler skew that silently omitted 3rd-person subjects
from generated packs; ambiguous/duplicate-answer questions; missing
capitalization and articles). One suggested review fix was
investigated and _declined_ after verification showed it would be a
regression. Full detail: `docs/superpowers/specs/
2026-09-22-generative-sentence-content-design.md`'s "Final-review
fixes" section. English-only; French/Spanish, and the residual
cross-verb-distractor and unverified-new-verb risks, are explicitly
open follow-ups, not silently solved. Merged PR #76.

## V3 — Feature depth expansion (2026-09-20 – in progress)

Six-package initiative adding depth to existing features rather than new
surface area, sequenced by risk (self-contained/algorithmic first, the
largest product initiative in the middle, the most exploratory pieces
last): SRS scheduling, gamification engagement mechanics, conversation
experience, tutor/weakness system, curriculum formats, generative/adaptive
content.

**Smarter SRS scheduling** — two targeted, low-risk improvements to the
existing SM-2-style algorithm (not a full replacement — see
`src/lib/srs.ts`'s doc comments for why a novel stability-based model was
considered and deliberately not chosen): a lapse now halves repetitions
instead of resetting to zero, and a successful review well past its due
date grows the interval further (capped 1.5x), rewarding the real
spacing-effect finding from memory research. No schema change. Ported to
`supabase/functions/grade-review/srs.ts` (Deno) and
`ios/LearnWithAlphonsoKit/.../SRSEngine.swift` (Swift) with matching
parity tests in all three.

**Engagement mechanics** — four independent additions, all RPC-first from
day one (no direct-write debt like the original gamification tables had):
expanded achievement catalog (6 new diamond/gold tiers on existing
categories); `buy_streak_freeze_with_xp` RPC, mirroring the existing
hearts-purchase RPC, no cap unlike hearts; friend duels (`duels` table +
`create_duel`/`respond_to_duel`/`get_my_duels` RPCs, head-to-head XP
competition over a friend-accepted window, lazily resolved on read rather
than needing cron infrastructure this project doesn't have yet); weekly
quests (`weekly_quests` catalog + `user_weekly_quest_claims` +
`claim_weekly_quest` RPC, progress computed from already-durable
activity_days/lesson_completions data rather than a new counter). Caught
and fixed a real trust-boundary bug in review during this package's own
build: an early draft of `claim_weekly_quest` took metric/target/xp_reward
as caller-supplied RPC parameters, which would have let any caller invoke
it directly via PostgREST with an arbitrary reward -- fixed before it
shipped by moving the catalog server-side. Web server functions + Kit
client methods shipped and tested on both platforms; new UI surfacing
(making these reachable in the actual app, not just callable) is the
immediate next fast-follow, same "backend/client-method complete, UI
wiring follows" precedent this codebase already established for
`acceptFriendInvite`.

**Conversation experience** — three additions to the free-conversation
roleplay feature (web `/converse` and iOS's free mode; Hector/Pro is
untouched except a compile fix for a shared client method's changed
signature): 6 new scenarios (12 total, added a couple of Advanced-level
ones -- salary negotiation, friendly debate -- since all 6 originals were
Beginner/Intermediate); adaptive difficulty (`/api/chat` now takes an
optional `cefrLevel` and appends a vocabulary/complexity hint to the
scenario's system prompt -- a prompt-shaping hint, not a trust boundary,
so client-supplied without validation); pronunciation feedback via a
heuristic, not real phoneme scoring (Deepgram's own utterance-level STT
confidence, already present in the `/api/stt` response, surfaced as a
clear/okay/unclear badge -- zero new vendor, zero new cost). iOS had no
way to read a user's own current CEFR level at all before this --
`ProgressSyncClient.fetchCefrLevel` (a plain RLS-scoped read) is a small
new addition specifically to unlock adaptive difficulty there too.

**Tutor & weakness system (in progress)** — a weakness trend log
(`weakness_events`: 'detected'/'resolved' rows, plain RLS insert/select-own
since it's a non-value-bearing signal, not RPC-gated) now records every
time `/api/analyze-weaknesses` classifies a gap and every time a
weakness-sourced review item retires (mirrored in both
`review.functions.ts`'s `gradeReview` and the `grade-review` Edge
Function). The NVIDIA classification + parsing logic used by
`analyze-weaknesses` was extracted into a shared
`src/lib/weakness-detection.server.ts` module so a second call site could
reuse it without duplicating the taxonomy/prompt/Zod-parsing; that second
call site is new: `completeLessonRemote` now also runs weakness detection
directly against a lesson's own missed questions (previously this only
ran from free-conversation transcripts), so a learner gets weakness
tracking from graded lesson mistakes even if they never use `/converse`.
Best-effort and fully isolated behind a try/catch — a classification
failure never fails the lesson-completion response. Caught and fixed a
real, pre-existing production bug while exploring this area:
`analyze-weaknesses.ts`'s insert into `review_items` never included
`user_id` (a NOT NULL column with no default), meaning the route had
likely never successfully written a row in production; it also had zero
test coverage, which is how that went unnoticed. Fixed with proper
`user_id` resolution + `supabaseAdmin`, and given 7 new tests. A
weakness-trend read now surfaces that log: `getWeaknessTrend` aggregates
`weakness_events` into per-category detected/resolved counts, shown as a
"Weakness trend" section on web's `/profile` (still-working-on-it vs.
mastered) and iOS's Achievements screen (`ProgressSyncClient.
fetchWeaknessTrend`), with matching test coverage on both platforms. No
`course` param anywhere in this pipeline: weakness detection itself is
English-only today (`analyze-weaknesses.ts` hardcodes `language: "en"`),
so there's nothing to filter by yet. Tutor persona memory (Hector) is
also live: `TutorMemoryContext.buildPrimingMessage` (Kit, pure/tested)
turns a learner's current CEFR level + open weakness categories into one
priming history entry, prepended to every `TutorConversationClient.
respond()` call in `HectorView.swift` but never appended to the visible
`turns` transcript itself. This is _not_ Hector recalling actual past
conversation -- that transcript lives entirely on AlphonsoEcosystem's
Cloud Voice backend, which this repo can't read (see the Hector
weakness-detection design doc's "what this does NOT change" section);
it's durable facts this repo already tracks, replayed as continuity each
new session. Proactive tutor nudges close out the package: a new
`weakness-practice-nudge` local notification kind (`NotificationLogic.
swift`'s `weaknessPracticeNudgeCopy`/`nextWeaknessPracticeNudgeDate`,
same pure-logic-in-the-Kit split as the existing streak/due-review/
weekly-recap nudges), scheduled from `AchievementsView.load()` reusing
its existing weakness-trend fetch -- no second network round trip, same
precedent as the due-review nudge reusing `ReviewQueueView`'s fetch.
Fires at a fixed 10am (distinct from the streak reminder's 8pm and the
due-review nudge's fixed hours-out, so the three kinds don't compete for
the same moment), named for the single most-open category to stay
concrete rather than a generic nag, and cancelled automatically once no
category is open. This closes out package 3b (tutor & weakness system);
curriculum formats and generative/adaptive content (packages 4a/4b)
remain.

**Curriculum formats** — two new question formats layered
onto the existing `mc` type rather than new discriminated cases (`imageKey`
shows a stock photo above the prompt for "image matching"; `audioText`
speaks via on-device TTS -- `src/lib/speech.ts` on web, `AVSpeechSynthesizer`
on iOS -- for "listening comprehension"; zero new grading/regrade logic
either way, since both are still plain `mc` questions underneath), plus a
genuinely new `reorder` type (tap a shuffled word pool into the correct
sentence order) with its own grading branch mirrored across
`srs.ts`/`bank-engine.ts`/`review.tsx`/`lesson.$id.tsx` and their iOS Kit
equivalents (`CurriculumModels.Question.Reorder`, `QuestionGrading.swift`,
`LessonPlayerView`/`ReviewQueueView`'s tap-to-assemble UI). A new migration
widens the curriculum-data tables' `question_shape_matches_type` CHECK to
accept `reorder` (same row shape as `fill`: `bank` holds the token pool,
`answer_text` the correct sentence) -- `grade-review`'s Deno function
needed no code change, since it already treats any non-`mc` row as a plain
text comparison. Three example questions (one of each new format) added to
the real `u1l2` lesson to exercise this live, both in tests and in prod.
Also added a `deploy-supabase` CI step that runs `scripts/
seed-curriculum-db.ts` automatically (no-ops until `SUPABASE_URL`/
`SUPABASE_SERVICE_ROLE_KEY` repo secrets are added -- see that job's
comment), closing the same class of "manual script, easy to forget" gap
that already motivated the job's migration/function auto-deploy. Caught a
real instance of exactly that gap while regenerating `scripts/
export-ios-content.ts`'s bundled JSON for this work: package 2's
18->24 achievement catalog expansion, _and_ package 3a's 6 new
conversation scenarios, had never been re-exported -- iOS had silently
been stuck on 18 achievements and the original 6 scenarios (missing
hotel/directions/apartment/returns/negotiation/debate entirely) since
those packages shipped. Fixed, and documented in ARCHITECTURE.md's "Known
rough edges" since `export-ios-content.ts` still has no equivalent
automated step (its output is committed JSON, not a DB write, so it can't
be a silent CI step the same way). Closes with the French course's
lesson-count gap: 75 new content packs (15 per CEFR level, A1-C1) added to
`lesson-bank-fr.ts` in the same compact pair/cloze format as the existing
25, taking French from 125 to exactly 500 lessons -- matching English's
534-lesson depth for the first time. New topics per level: A1 gets
everyday-life vocabulary (body parts, house, jobs, food service, tech,
transport, etc); A2 moves into applied grammar in context (reflexive
verbs, near future, negation, question formation) alongside more
vocabulary; B1-B2 add intermediate/upper-intermediate grammar (relative
pronouns, object pronouns, y/en, passive voice, plus-que-parfait,
conditionnel passé, the causative, double object pronouns) and register-
specific vocabulary (politics, law, economy, arts); C1 adds literary and
formal register (passé simple recognition, subjunctive past, false
friends, register shifts, academic writing phrases, nuanced modal
expressions). No new question types were needed -- all 75 packs reuse the
existing pair/cloze pack engine, which already auto-generates mc/fill
questions with distractors and shuffling. This closes out package 4a.

**Adaptive difficulty** — in-lesson reinforcement: missing a
question now queues one extra practice question testing the same concept
(pulled from a sibling lesson in the same unit/pack) right there in the
lesson, not just later in spaced review. Shown as its own "Quick practice"
interstitial _after_ the missed question's own feedback (never replacing
it), and never affects correct/missed/hearts/XP regardless of its own
outcome -- purely supplementary. No difficulty metadata exists on
individual questions, so "skew toward easier or harder based on how
you're doing this session" is implemented as a _pool_ skew instead:
`pickReinforcementQuestion` (mirrored in `bank-engine.ts` and a new
`LessonReinforcement.swift` in the Kit) draws from the tightly-scaffolded
same-unit pool by default, or the wider same-CEFR-level pool once recent
accuracy this attempt is high, falling back to the other pool if the
preferred one is empty. Ships on both web (`lesson.$id.tsx`) and iOS
(`LessonPlayerView`), reusing 100% existing curriculum data.

**Generative sentence content** — a "Generate more practice" option on the
lesson finish screen: NVIDIA NIM (same integration as weakness detection
and free conversation) writes 3-5 fresh multiple-choice questions on that
specific lesson's topic, using the lesson's own questions as grounding
examples so the model stays on-topic and doesn't just repeat them
verbatim. New `src/lib/practice-generation.server.ts` (same defensive-
parse-never-throw design as `weakness-detection.server.ts`) backs a new
raw HTTP route, `api/generate-practice.ts` (reuses the existing `chat`
quota bucket, same precedent as `analyze-weaknesses.ts`). Entirely
ephemeral on both platforms -- generated questions live only in
component-local state (web) / view-local `@State` (iOS,
`AIConversationClient.generatePractice`), never persisted, never counted
toward XP/hearts/review scheduling, same posture as in-lesson
reinforcement above. This closes out package 4b, and with it, all six V3
packages.

## V2 — Native iOS feature expansion (2026-09-19 – 2026-09-20)

Built as a batch of independent, parallel-safe feature slices against
the already-shipped V1 iOS app, following kickoff docs in
`docs/v2-kickoffs/` (gitignored, local-only — the pattern is
preserved for `docs/v3-kickoffs/`, see below).

**Design docs** (#47) — `docs/superpowers/specs/2026-09-17-native-ios-app-design.md`
follow-ups scoped as five parallel-safe V2 slices, plus two decision
docs (offline-first, Hector weakness-detection) needing more thought
before implementation.

**Base features batch** (#48–#52, one PR each): local notification
scheduling infrastructure; leaderboards screen (global/friends/country,
weekly/all-time via the existing `get_leaderboard` RPC); friends screen
(invite-link based, via `get_friends_progress`); achievements/leagues
browse screen with unlock celebrations; vocab stock-photo images in the
lesson overview.

**Offline-first** (#53) — lesson completion and review grading both
queue locally (SwiftData: `PendingLessonCompletionRecord`,
`PendingReviewGradeRecord`, `CachedDueReviewRecord`) and sync when
connectivity returns (`NetworkMonitor`). The drain logic itself
(`SyncEngine.swift`) lives in the Kit, not the app target, specifically
to stay Windows-testable. Two known, deliberately-unsolved edge cases
(concurrent-device grading, offline streak-continuity) — see
`ARCHITECTURE.md`.

**Leaderboards + friends, deepened** (#54) — overtake detection (in-app
toast) and a weekly recap sheet for leaderboards; an activity feed
(`friend_activity_events`, written by `complete-lesson`) and
nudge-a-friend (`nudges` table, deliberately the weaker polling-based
V2 version, not real push) for friends. Extracted a shared `ToastBanner`
after noticing the overtake toast and nudge banner were near-duplicates.

**Hector/free-conversation weakness detection** (#55) — after either
AI-conversation mode ends (4+ turns), NVIDIA NIM identifies up to 3
weaknesses from a fixed taxonomy and inserts them as gradable
multiple-choice `review_items` rows (`source` column discriminates
lesson-derived vs. synthetic weakness items). New `/api/analyze-weaknesses`
TanStack Start route (deliberately not a fourth Edge Function).
`grade-review` and its web mirror (`review.functions.ts`) both branch
on `source`; the web `/review` page renders weakness items too (a gap
found and fixed mid-implementation — without it, a weakness item would
have been an invisible-but-still-due phantom on web).

**Test coverage** (#46) — from near-zero to 502 tests across 72 files
(data layer, lib utilities, components, hooks, Supabase integration,
route components), 90.55% statement / 91.56% line coverage. Added
`vitest.setup.ts` (React Testing Library + jsdom).

**Infrastructure fixes made along the way:**

- Repo transferred from a personal GitHub account to the `obsidian-media`
  org (fixed a GitHub Actions billing block) — broke Vercel's GitHub
  integration in the process; still needs manual reconnection (see
  `ARCHITECTURE.md`'s "Known rough edges").
- Manual Vercel production deploy (2026-09-20) to catch production up
  on everything merged since PR #49, which had gone undeployed. Added
  `.vercelignore`.
- `review_items` schema extended with `source`/`weakness_label`/
  `weakness_display`/`prompt`/`choices`/`answer_index`/`explanation`
  columns (migration `20260920040000`).

## V2 kickoff (2026-09-17 – 2026-09-19)

**Native iOS app, ground-up build** (#24, #27–#45): design spec, curriculum
DB schema + seed script, `complete-lesson`/`start-lesson-session`/
`grade-review` Edge Functions, app scaffold, lesson player (overview →
vocab → quiz → finish), SM-2 review queue, two AI-conversation modes
(free via this repo's own `/api/chat`/`/api/tts`/`/api/stt`, and Pro
"Hector" via AlphonsoCompanion's Cloud Voice + RevenueCat gating), app
icon, CI (`ios-app-build`, `ios-swift-tests`), signed release pipeline
with an optional TestFlight upload step, App Store orientation-
validation fix, `SupabaseSession.userID`.

## V1 — Web app (through 2026-09-18)

- **Lovable decoupling** (#1): moved off Lovable-hosted AI gateway/tooling
  — AI calls go straight to NVIDIA NIM/Deepgram, deploy targets Vercel
  directly.
- **Content buildout** (#3–#9, #14, #18, #21, #23): full 5-CEFR-level
  English curriculum (534 lessons), vocab-card images for 1,161+ terms
  (English + French), lesson-bank generator packs.
- **Rebrand** (#8, #10, #13, #20): Lingua → Alphonso across all
  user-facing text and the app icon.
- **French course** (#11, #12, #14, #16): full second course (125
  lessons across 5 levels), course switcher, course-aware SRS.
- **Placement test** (#15): randomized adaptive placement with seeded
  lesson-replay variation.
- **Friends v1** (#17): invite-link based friends feature.
- **Voice** (#19): TTS/STT swapped from OpenAI to Deepgram.
- **Themes** (#30, #33): 3 user-selectable themes (Meadow, Studio Ink,
  Manuscript).
- **Hardening** (#22, #29, #31, #34): security/a11y/testing-infra audit
  follow-up, hearts-economy fixes, gamification-table CHECK constraints,
  XP/hearts farming exploits closed.
- **Curriculum DB + iOS groundwork** (#24–#28): design spec and schema
  work that V2's native iOS app was built on top of.

## Phase 0 — Origins

Started as a Lovable-generated TanStack Start scaffold; Phase 1 (#1)
decoupled it from Lovable's hosted infrastructure while keeping the
generated code as the foundation. Everything above is original work on
top of that foundation.
