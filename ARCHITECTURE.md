# Architecture

Written 2026-09-13, last substantially updated 2026-09-22 — re-verify
against `supabase/migrations/*.sql` and `src/routes/` before trusting a
detail here; this codebase's own audit history shows even a careful
point-in-time doc goes stale within weeks. This doc favors "where to look"
over "what the answer currently is," since the latter goes stale fast.

## Stack

- **Framework:** TanStack Start (SSR) on Vite 8 + Nitro, React 19
- **Routing:** TanStack Router, file-based (`src/routes/`, see
  `src/routes/README.md` for conventions)
- **Styling:** Tailwind CSS v4, hand-written components (no UI kit —
  `src/components/ui/` was removed 2026-09-13, confirmed unused)
- **Client state:** Zustand (`src/lib/progress.ts`)
- **Server state / data fetching:** TanStack Query + TanStack Start server
  functions (`createServerFn`, in `src/lib/*.functions.ts`)
- **Backend:** Supabase (Postgres + Auth + Row-Level Security + RPCs)
- **Package manager:** bun (`bun.lock` is authoritative; there is
  deliberately no `package-lock.json`)

## Request flow

1. A route component calls a server function from `src/lib/*.functions.ts`
   (e.g. `completeLessonRemote`, `fetchDueReviews`).
2. Every server function is wrapped in the `requireSupabaseAuth` middleware
   (`src/integrations/supabase/auth-middleware.ts`), which verifies the
   caller's Supabase JWT and hands the handler a request-scoped Supabase
   client authenticated **as that user** — so normal queries run under RLS,
   not admin privilege.
3. Handlers either query tables directly (RLS-scoped) or call a Postgres
   RPC for anything that needs to write across users (friend invites,
   leaderboard) or that needs a hardcoded server-side limit a client
   shouldn't control (AI quota/rate limit). RPCs are `SECURITY DEFINER`
   for exactly those two reasons — see `supabase/migrations/`.
4. `src/integrations/supabase/client.server.ts` (`supabaseAdmin`) is the
   only place with the service-role key, used sparingly and only from
   server-only code (never from a `*.functions.ts` file directly, since
   those ship to the client bundle — see the comment in that file).

## Database (see `supabase/migrations/*.sql` for the source of truth)

| Table                                                | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `profiles`                                           | Display name, avatar seed, country — one row per `auth.users` row (see `handle_new_user` trigger)                                                                                                                                                                                                                                                                                                                                                           |
| `user_progress`                                      | Account-wide state: streak, longest streak, hearts, hearts refill timestamp, streak freezes                                                                                                                                                                                                                                                                                                                                                                 |
| `language_progress`                                  | Per-course state: xp, cefr_level, placement result, league tier. PK `(user_id, language)`                                                                                                                                                                                                                                                                                                                                                                   |
| `lesson_completions`                                 | Best score per lesson per course                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `activity_days`                                      | XP earned per calendar day, powers the activity heatmap and weekly-XP leaderboard scope                                                                                                                                                                                                                                                                                                                                                                     |
| `achievements` / `user_achievements`                 | Achievement catalogue + unlocks                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `friendships`                                        | `(user_id, friend_id, status)`, written both directions atomically by `accept_friend_invite`                                                                                                                                                                                                                                                                                                                                                                |
| `friend_activity_events`                             | Feed rows (`lesson_completed`/`streak_milestone`/`league_promotion`) written by `complete-lesson`/`completeLessonRemote` when something feed-worthy happens; read scoped to friends via `friendships`                                                                                                                                                                                                                                                     |
| `nudges`                                              | `(sender_id, recipient_id, read_at)` — the weaker, polling-based nudge-a-friend feature (see "Native iOS app" below); recipient's app checks for unread rows on foreground, not real push                                                                                                                                                                                                                                                                 |
| `review_items`                                       | SRS queue: `(user_id, item_key, language)` unique, `ease`/`interval_days`/`repetitions`/`due_on`/`lapses`. `source` (`"lesson"` default / `"weakness"`) discriminates a real lesson-question item from a synthetic weakness-detection item (`weakness_label`/`weakness_display`/`prompt`/`choices`/`answer_index`/`explanation` — embedded gradable content, no `lessons`/`questions` row to point at). See "AI integrations" below.                    |
| `ai_usage`                                           | Daily per-kind (chat/stt/tts) request counter, read by `consume_ai_quota`                                                                                                                                                                                                                                                                                                                                                                                   |
| `ai_rate_limits`                                     | Per-minute per-kind request counter, read by `consume_ai_rate_limit`                                                                                                                                                                                                                                                                                                                                                                                        |
| `levels` / `units` / `lessons` / `questions`         | Curriculum data mirrored from `src/data/curriculum.ts`/etc. into real tables (`scripts/seed-curriculum-db.ts` populates them) — exists so the `complete-lesson` Edge Function can validate a completion claim server-side without bundling curriculum JSON. **The web app itself still reads `curriculum.ts` directly, not these tables** — same precedent as `achievements` below. See `docs/superpowers/specs/2026-09-18-curriculum-db-schema-design.md`. |
| `vocab_images` / `placement_questions` / `scenarios` | Same mirroring, for the rest of the curriculum-adjacent static data (`src/data/vocab-images.ts`, `placement.ts`, `scenarios.ts`) — currently no consumer queries these yet                                                                                                                                                                                                                                                                                  |
| `teams` / `team_members` / `team_weekly_rewards`     | V4 #7 (deeper gamification) — persistent groups: invite code, public/private, `switch_locked_until` (7-day anti-hop lock), `_random_team_name`/`_join_team_impl` shared join logic with `FOR UPDATE` locking. Weekly-XP-sum leaderboard (`get_team_leaderboard`) and a lazy-resolved weekly win bonus (+100 XP to last week's #1 team's members, granted as a side effect of the next `get_my_team` read, no cron). Added `supabase/migrations/20260922040000_teams.sql`.                                                                                                                                                                                                                            |
| `season_cohorts` / `season_cohort_members` / `season_placements` | V4 #7 — Duolingo-style weekly promotion/demotion ladder, ~30-person cohorts ranked by weekly XP, 5 divisions. Resolved by the `get-season-status` Edge Function (below), not raw SQL — the ranking/promotion math (`floor(size/3)` promote, `floor(size/6)` demote) is unit-tested Deno/TS, not PL/pgSQL. No client RLS policy — only the Edge Function (service_role) touches these directly. Added `supabase/migrations/20260922050000_season_ladder.sql`.                                                                                                                                                                                                                                          |
| `challenge_templates` / `challenge_completions`      | V4 #7 — fixed weekly solo goals (6 seeded templates), same DB-seeded pattern as `achievements` rather than hardcoded TS constants (a deliberate deviation from that plan's original framing). `get_weekly_challenges()` RPC computes live progress per caller.                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `duel_queue`                                          | V4 #7 — open/stranger duel matchmaking (as opposed to `duels`' friend-challenge flow): `join_open_duel_queue(_course, _match_by_level)` uses `FOR UPDATE SKIP LOCKED` to safely match two waiting rows concurrently, going straight to an `active` duel with XP baselines captured (mirroring `respond_to_duel`'s logic, since both sides already consented by queueing — no separate accept step). Added `supabase/migrations/20260922030500_weekly_challenges.sql`, which also fixed a real pre-existing bug: `duels.course`'s `CHECK` constraint only allowed `('en','fr')`, silently breaking Spanish duels since the V4 #1 Spanish launch.                                                    |

RPCs worth knowing (all `SECURITY DEFINER`, all in `supabase/migrations/`):
`get_leaderboard`, `get_friends_progress`, `accept_friend_invite`,
`consume_ai_quota`, `consume_ai_rate_limit`, `restore_hearts_if_due`,
`buy_heart_with_xp`, `claim_review_clear_bonus` (the last three: atomic,
row-locked hearts-economy operations — see "Hearts economy" below),
`lose_heart`, `set_cefr_level`, `save_placement_result` (added
2026-09-20 — the iOS client's remaining direct-write replacements, see
"Known rough edges" below), and (V3 package 2, same day)
`buy_streak_freeze_with_xp`, `create_duel`, `respond_to_duel`,
`get_my_duels`, `claim_weekly_quest` — see CHANGELOG.md's V3 entry. V4
#7 (2026-09-22) added `weekly_xp` (extracted out of `get_leaderboard`,
the shared building block the rest of this batch depends on),
`join_team`/`join_public_team`/`auto_join_team`/`leave_team`/
`get_my_team`/`get_team_leaderboard`, `get_weekly_challenges`,
`join_open_duel_queue`/`leave_duel_queue`, and
`get_cohort_weekly_xp` (service_role-only, called by the
`get-season-status` Edge Function below, not client-callable).

`user_progress`, `language_progress`, `lesson_completions`,
`user_achievements`, `activity_days`, and `review_items` all carry `CHECK`
constraints on their numeric/enum columns (added 2026-09-18), **and, as of
2026-09-20 (`supabase/migrations/20260920050000_revoke_direct_gamification_writes.sql`),
no longer grant direct `INSERT`/`UPDATE` to `authenticated` at all** — the
real fix the 2026-09-18 migration's own comment deferred. Every write now
goes through either `supabaseAdmin` (web server functions -- the value was
already server-computed, so this is the same trust boundary the
complete-lesson/grade-review Edge Functions' own writes already use) or one
of three new `SECURITY DEFINER` RPCs (`lose_heart`, `set_cefr_level`,
`save_placement_result`) that the native iOS client (`ProgressSyncClient.swift`)
calls directly, replacing the three direct-write operations it used to
depend on. SELECT and the existing DELETE grants (GDPR export/delete,
`gradeReview`'s retire path) are unchanged. **A currently-shipped TestFlight
build predates this change** and will see permission-denied errors on
heart loss / CEFR level / placement save until a new build ships.

**Applying migrations:** `.github/workflows/ci.yml`'s `deploy-supabase` job
now runs `supabase db push` (and redeploys all three Edge Functions)
automatically on every push to `main`, gated on `lint-and-typecheck`/`e2e`
passing first (see "Known rough edges" below for the incident history that
motivated this, and the job's own comment for the required repo secrets).
Before this existed, every file under `supabase/migrations/` needed a
manual `supabase db push` or hand-applied SQL before the corresponding code
path worked in the real app -- a new RPC or table referenced by app code
but not yet pushed fails at request time (typically a 500), not at build
time. The manual path is still the fallback if the CI job's credentials
ever lapse.

`supabase/migrations/` doesn't fully reconstruct the live schema from
scratch: a 2026-09-20 repair found the remote migration-tracking table
carried 23 entries (`harden_function_search_paths`,
`tighten_rls_and_leaderboard`, `fix_fr_delete_own_predicate_regression`,
etc.) with no corresponding local file at all, applied at some point via
the Supabase MCP `apply_migration` tool directly against the live project
rather than through a committed `.sql` file. Live schema was verified
consistent with every local file's expected end state before repairing the
tracking table (`list_tables`/`pg_proc` against the full local migration
set), so this was safe to resolve as pure bookkeeping -- but it means a
handful of early hardening changes exist in prod with no SQL file to
reproduce them from a fresh project. Not solved here; if a from-scratch
rebuild is ever needed, `supabase db pull` against the live project first.

## Content model

`src/data/courses.ts`'s `getCourse(course)` is the single entry point for
lesson content — returns a `CourseBundle` (curriculum, question index,
placement pool) for `"en"` or `"fr"`. Each course pairs hand-written units
(`curriculum.ts` / `curriculum-fr.ts`) with a generator-produced bank
(`lesson-bank.ts` / `lesson-bank-fr.ts`, via `generatedUnits()`). Actual
counts as of 2026-09-13: English 534 lessons / 2,718 questions, French 125
lessons / 625 questions (see `AGENTS.md`'s Content Structure table — don't
trust a lesson-count claim anywhere without re-running the count script
that produced those numbers).

Server-side score validation (`completeLessonRemote` in
`src/lib/sync.functions.ts`) looks lessons up through this same
`getCourse().findLesson()` path, so the curriculum data doubles as the
server's source of truth for "does this lesson exist and how many
questions does it have."

## Edge Functions (Deno, `supabase/functions/`)

Trust-sensitive write/issue paths that aren't TanStack Start server
functions, because the native iOS client has no server layer of its own
to run them in. Also home to `get-season-status`, which needs genuinely
complex server-side logic (not just a trust boundary) — see below. All
are deployed and live in production (project `qhcjpfbxfcltjbiuknyt`):

- **`complete-lesson`** — 1:1 port of `completeLessonRemote`
  (`src/lib/sync.functions.ts`) to Deno, reading curriculum data from the
  `lessons`/`units`/`questions` tables above instead of the in-process
  `curriculum.ts` the web app uses. Also upserts `review_items` rows for
  any missed questions (folds in `recordMisses`' logic, since this
  function already has the validated lesson/question data recordMisses
  would otherwise need a second session-token round trip to re-verify).
- **`start-lesson-session`** — issues the HMAC session token
  `complete-lesson` requires as proof a lesson was actually opened. On
  the web app this comes from `startLessonSession`, a TanStack Start
  server function reachable only via the web app's own RPC layer — this
  is that same issuance exposed over plain HTTP so iOS can call it too.
- **`grade-review`** — 1:1 port of `gradeReview`
  (`src/lib/review.functions.ts`): re-derives an SRS review answer's
  correctness server-side against the real question (never trusts a
  client-supplied `correct` boolean), rejects grading an item that isn't
  due yet, updates/retires the item. Branches on `review_items.source`:
  a `"weakness"` row derives correctness from its own embedded
  `choices`/`answer_index` instead of looking up a `questions` row.
- **`send-push`** — V4 real-push-notifications work: sends a real APNs
  push (`supabase/functions/_shared/apns.ts`) for nudge-a-friend and
  leaderboard-overtake, upgrading those from the weaker
  polling-on-foreground/in-app-toast approaches described elsewhere in
  this doc. No-ops gracefully when `APNS_KEY_P8`/`APNS_KEY_ID`/
  `APNS_TEAM_ID`/`APNS_BUNDLE_ID` aren't all set (see `ci.yml`'s "Sync
  APNs secrets" step) — same "do nothing until configured" precedent as
  `REVENUECAT_API_KEY`.
- **`get-season-status`** — V4 #7 (deeper gamification): resolves the
  caller's previous week's season-ladder cohort lazily (a side effect
  of this call, same no-cron pattern as `get_my_duels`), ensures a
  current-week cohort exists (room-or-create, same pattern as Teams'
  `auto_join_team`), and returns live division/rank/cohort-size. Unlike
  the three above, this isn't wrapping a trust boundary an existing web
  server function already has — the ranking/promotion math itself is
  genuinely complex enough to want real unit tests (`season-math.ts`/
  `season-math.test.ts`, pure functions, no Supabase client), which is
  why this system is an Edge Function instead of a PL/pgSQL RPC like
  every other V4 #7 write path.

**Not an Edge Function, deliberately**: `/api/analyze-weaknesses`
(weakness detection, see "AI integrations" below) is a plain TanStack
Start API route (`createFileRoute`, same shape as `api/chat.ts`), not a
fourth Edge Function — it needs both NVIDIA NIM access and
`ai-quota.server.ts`'s quota enforcement, both of which only exist in
the TanStack Start runtime, and nothing on the web side calls it (only
iOS does), so there's no portability reason to duplicate it in Deno. It
writes `review_items` using the caller's own RLS-scoped client (anon
key + bearer token), **not** service-role — the trust boundary it
protects is "the LLM decides the question content, not the caller,"
which holds regardless of which key signs the request.

Because Edge Functions bundle each function directory independently,
each carries its own Deno copies of the pure math it needs
(`complete-lesson/{progress-math,hearts,lesson-session}.ts`,
`start-lesson-session/lesson-session.ts`, `grade-review/srs.ts`) rather
than importing across the `supabase/functions/` boundary — **these must
be kept byte-for-byte in sync with their TypeScript source of truth by
hand**. `srs.ts`/`hearts.ts` now have a parity guard (`deno-tests` in
`.github/workflows/ci.yml`, running `grade-review/srs.test.ts` and
`complete-lesson/hearts.test.ts`, which mirror `src/lib/srs.test.ts`/
`hearts.test.ts`'s exact vectors) so a future drift fails CI instead of
surfacing as a silent behavior mismatch between web and iOS; `progress-math.ts`
and `lesson-session.ts` don't have this yet. Deployed via `supabase
functions deploy <name>` (or the Supabase MCP `deploy_edge_function`
tool); `complete-lesson` and `start-lesson-session` both need the
`LESSON_SESSION_SECRET` Edge Function secret to match the web app's own
env value exactly, or tokens issued by one side won't verify on the
other (`grade-review` doesn't use session tokens at all — the `due_on <=
today` check is what prevents grading a never-actually-reviewed item).
See `docs/superpowers/specs/2026-09-17-complete-lesson-edge-function-design.md`.

## Hearts economy

`src/lib/hearts.ts` (ported to Deno for the Edge Function, and to Swift as
`ios/LearnWithAlphonsoKit/.../HeartsEconomy.swift`) is the pure math for:
passive regen (`hearts_refill_at` resolves back to full once its time
passes — resolved lazily on the next read/write, not via a cron job),
+1 heart for a perfect lesson, a full refill at every 7-day streak
milestone, +1 heart for spending XP (`buy_heart_with_xp` RPC), and +1/day
for clearing the SRS review queue (`claim_review_clear_bonus` RPC, guarded
by `user_progress.last_review_bonus_date`). The three RPCs exist
specifically to make "check current state, then write" atomic under
concurrent calls (`FOR UPDATE` row lock) — the equivalent logic in
`completeLessonRemote`/the Edge Function doesn't need its own RPC since a
single server-function invocation is already atomic from the client's
perspective.

## Themes

Three user-selectable themes (`meadow` default, `studio-ink`,
`manuscript`), defined as CSS custom properties per `[data-theme="..."]`
block in `src/styles.css` plus a design-tokens JSON per theme
(`src/design-tokens/*.json`, currently informational/export-only — the
CSS is the real source of truth the app reads). `src/lib/theme.ts` is a
small Zustand store: resolves server value (from `profiles.theme`) over
localStorage over the `meadow` default, and an inline `<script>` in
`src/routes/__root.tsx` applies the stored theme before first paint to
avoid a flash of the wrong theme. `profiles.theme` is validated by both a
Zod enum (`leaderboard.functions.ts`'s `updateProfile`) and a Postgres
`CHECK` constraint — both need updating together when a theme is added
(see `supabase/migrations/20260918140000_add_manuscript_theme.sql` for the
pattern: drop and re-add the constraint, since it isn't named per-value).

## Native iOS app (`ios/`)

Two pieces: `LearnWithAlphonsoKit` (a plain Swift Package — content
models, `ContentStore` bundled-JSON loader, SRS/progress-math/hearts-economy
ports, and network clients: `SupabaseAuthClient`, `ProgressSyncClient`
(PostgREST + the `complete-lesson`/`start-lesson-session`/`grade-review`
Edge Functions), `AIConversationClient` (this repo's own
`/api/chat`/`/api/tts`/`/api/stt`), `TutorConversationClient` +
`DeviceEnrollmentClient` (AlphonsoCompanion's Cloud Voice, Pro-only — see
below)) and `LearnWithAlphonso` (the SwiftUI app target, scaffolded via
XcodeGen so the `.xcodeproj` is generated from `project.yml` rather than
hand-clicked/committed).

There is no local Xcode/macOS in this development environment. The Kit
was written and tested on Windows via
`ios/LearnWithAlphonsoKit/swift-test.ps1` (zero UIKit/SwiftUI
dependency, so this works); the app target's *only* compile
verification is CI — `.github/workflows/ci.yml`'s `ios-app-build` job
runs a real `xcodebuild` on a macOS GitHub Actions runner on every PR,
and `.github/workflows/ios-release.yml` (manual trigger) produces a
real signed archive/`.ipa` and can optionally upload it to TestFlight,
using an App Store Connect API key (`-allowProvisioningUpdates`) rather
than any interactive Apple ID login. Empirically confirmed (two full
runs) that this signing flow does not permanently accumulate
certificates on the Apple account, despite each CI run starting from an
empty keychain — no certificate-persistence (`.p12`/fastlane-match)
infrastructure was needed.

**Two separate AI-conversation modes, two separate backends:**
- **Free** — `ConversationView.swift` / `AIConversationClient.swift`:
  calls this repo's own already-deployed AI endpoints directly (same
  backend, same Supabase account/session the rest of the app uses).
- **Pro** ($9.99/month, RevenueCat-gated) — `HectorView.swift` /
  `TutorConversationClient.swift`: AlphonsoCompanion's Cloud Voice
  backend (`voice.obsidianmedia.online`), which requires its own
  separate email-OTP sign-in and device enrollment
  (`HectorSession.swift` / `DeviceEnrollmentClient.swift`) against a
  **different Supabase project** (`ywavjlmjbxuslbxactsx`) — a second,
  deliberate account system, not a bug. Speech-to-text for this mode
  still goes through the app's own `/api/stt` (only the chat reply + its
  TTS audio come from Cloud Voice). That Cloud Voice Supabase project
  auto-paused (`INACTIVE`) once already during this project's
  lifetime — if Hector stops working, check its status first.

**RevenueCat**: `EntitlementStore.swift` wraps the SDK
(`Purchases.configure` in `LearnWithAlphonsoApp.init`) — every
Pro-gated view reads only `EntitlementStore.isPro`/`.packages`, never
touches `Purchases` directly. Currently configured with a **Test Store**
key; no real Offering/Package exists in the RevenueCat dashboard yet, so
`PaywallView` shows a "not available yet" state rather than a working
purchase button until a real App Store Connect subscription product is
created and connected. See `AGENTS.md`'s RevenueCat note for the exact
remaining steps.

App Store Connect app record exists: "Learn With Alphonso", app id
`6813969159`, bundle `com.obsidianmedia.learnwithalphonso`, Team ID
`9Y6GYPM3K5`.

**Design system** (`ios/LearnWithAlphonso/Sources/DesignSystem/`,
2026-09-22, extended to a full theme system 2026-09-22): ports all
three of the web app's themes (`src/styles.css`'s `:root`/Meadow,
`[data-theme="studio-ink"]`, `[data-theme="manuscript"]` blocks) rather
than inventing a separate native-only look, so web and iOS read as one
product. `AlphonsoTheme.swift` defines `AlphonsoThemeID` (raw values
match the web's `THEME_NAMES`/`profiles.theme` CHECK constraint
exactly), `AlphonsoPalette` (colors converted from each theme's oklch
values to sRGB via a standard OKLab conversion — computed, not
eyeballed — plus each theme's font base names/optical-size range and a
`ColorScheme`), and `AlphonsoThemeManager` (an `@Observable` singleton,
`UserDefaults`-backed — the iOS equivalent of the web's `theme.ts`
Zustand store). `AlphonsoColor`'s members are computed properties
reading the active theme's palette rather than fixed constants, so
adding a theme required zero changes at any of the ~16 already-styled
screens' call sites.

Each theme's font pair is bundled as its upstream **variable** font
file(s) (`Sources/Fonts/*.ttf`, all from google/fonts, OFL-licensed:
Fraunces/Geist for Meadow, Instrument Serif/Instrument Sans for Studio
Ink, Newsreader/Source Sans 3 for Manuscript — Instrument Serif is the
one static-only exception, a single Regular face, since the web app
never loads a bold weight for it) and `AlphonsoFont.swift` resolves a
specific weight/optical-size instance at request time via CoreText's
`kCTFontVariationAttribute`, rather than depending on iOS's per-OS-
version support for resolving a variable font's named instances by
PostScript name. Fonts are registered via `Info.plist`'s `UIAppFonts`
array (the same "merged custom Info.plist" mechanism already used for
Google Sign-In's `CFBundleURLTypes`) — no `project.yml` change needed,
since XcodeGen already treats non-Swift files under a `sources:` path
as Copy Bundle Resources.

`RootView` applies `.preferredColorScheme(theme.colorScheme)` around
the whole app (including `AuthView`, shown before sign-in) so SwiftUI's
own dynamic/system colors — navigation-bar titles, `ContentUnavailableView`,
segmented-Picker tint — resolve against the *active theme's*
light-or-dark-ness rather than the device's own system Dark Mode
setting. This is a real-bug fix, not speculative hardening: a Meadow-
only build (no `preferredColorScheme` override) shipped to TestFlight
and was illegible on a device in system Dark Mode — native chrome
flipped to light-on-dark text while the app's then-fixed-light palette
stayed put. Studio Ink is a genuinely dark theme by design (not "Meadow
following system dark mode"), so this same mechanism is what makes it
render correctly too, not just Meadow/Manuscript.

`SettingsView.swift` (new — the app had no settings screen before this)
is the in-app theme picker, reachable from a gear button on the Learn
tab. Picking a theme applies instantly (via `AlphonsoThemeManager`) and
syncs to `profiles.theme` in the background
(`ProgressSyncClient+Profile.swift`, new Kit extension) — a plain
PostgREST GET/PATCH, since `profiles` (unlike the gamification tables)
never had its direct-write grant revoked; RLS's `profiles_update_own`
policy is the same one the web's `updateProfile` server function relies
on. `restRequest` widened from `private` to `internal` in
`ProgressSyncClient.swift` so this extension file can call it, same
precedent as `ProgressSyncClient+Season.swift`'s earlier widening.

`AlphonsoComponents.swift` has the reusable button styles (the primary
one replicates `styles.css`'s `.hard-shadow` pressed effect),
card/badge/progress-bar/empty-state views, `SpringEntrance` (promoted
out of `LessonPlayerView`'s original private copy), and
`alphonsoInputBackground()` (parchment fill + a visible hairline
border, applied to every text-input field app-wide — added after a
real device showed parchment-on-surface alone was too subtle to read as
an input field). Still deliberately deferred: no in-app light/dark
override independent of the chosen theme, and no grain-texture effect
(no trivial SwiftUI equivalent to the CSS `feTurbulence` noise).

See `docs/superpowers/specs/2026-09-17-native-ios-app-design.md` for the
original design (note: that doc's plan to reuse Cloud Voice for *all* AI
conversation, and its V2 deferral of hearts/streak-freezes, were both
superseded in practice — see this file's git history / session
decisions rather than trusting that doc's roadmap section as current).

## AI integrations

- **Chat:** NVIDIA NIM (`integrate.api.nvidia.com`, OpenAI-compatible),
  model configurable via `NVIDIA_CHAT_MODEL` — `src/routes/api/chat.ts`
- **TTS/STT:** Deepgram directly (Aura-2 / Nova-3) —
  `src/routes/api/tts.ts`, `src/routes/api/stt.ts`
- **Weakness detection:** `src/routes/api/analyze-weaknesses.ts`
  (iOS-only caller — see "Native iOS app" below) sends a Hector/free
  conversation transcript to NVIDIA NIM with a prompt constrained to a
  fixed 15-category taxonomy (`past-tense`, `articles`, `prepositions`,
  `subject-verb-agreement`, `plurals`, `question-formation`,
  `modal-verbs`, `word-order`, `pronouns`, `comparatives`,
  `conditionals`, `phrasal-verbs`, `negation`, `vocabulary-choice`,
  `spelling`), defensively parses the response (no structured-output
  mode assumed — strip code fences, `JSON.parse`, zod-validate, empty
  array on any failure), dedupes against the caller's existing
  not-yet-retired weakness items by category, and inserts survivors
  into `review_items`. No dedicated unit tests exist for this route (7%
  coverage — see `AGENTS.md`'s Testing section) or the two web routes it
  parallels (`api/chat.ts`/Edge Functions) — verified via
  `lint-and-typecheck`/`e2e` CI plus manual smoke-testing, same as
  those.
- All three chat/tts/stt endpoints (weakness-detection reuses the
  `"chat"` quota bucket rather than adding a fourth) are gated by
  `consumeQuota` (`src/lib/ai-quota.server.ts`): per-minute rate limit
  checked first, then the daily quota RPC.

## Known rough edges

(A full audit is kept locally, gitignored, not in this repo — see the
note in README.md's Documentation section for why.)

- **A custom SwiftUI color palette that doesn't set `.preferredColorScheme`
  will look broken on a device in system Dark Mode, even if every color
  is a fixed/explicit value.** Found for real on TestFlight (2026-09-22):
  the iOS design system's Meadow palette (`AlphonsoColor`, all fixed
  hex values, not adaptive) shipped without a `.preferredColorScheme`
  override. On a device in Dark Mode, every *system*-styled element this
  app didn't explicitly restyle (`.navigationTitle` text,
  `ContentUnavailableView`'s icon/title, segmented-Picker chrome) still
  resolves its color against the *device's* Dark Mode setting via
  SwiftUI's dynamic/semantic colors (`.primary`, etc.) — so those
  elements rendered light-colored text, while this app's fixed-light
  background colors stayed put, making titles and empty states
  unreadable. Fixed by applying `.preferredColorScheme(theme.colorScheme)`
  at the app root (`RootView`) — this pins every dynamic system color to
  resolve against the *chosen theme's* light-or-dark-ness instead of the
  device's setting. Generalizes beyond Meadow: Studio Ink is
  legitimately a dark theme (see "Design system" above), and this same
  mechanism is what makes its dynamic system colors resolve correctly
  too, not a special case.
- **SwiftUI `Section { content } header: { header }` silently misparses
  if the content closure is missing its own closing brace** — found
  twice while restyling every screen for the design-system pass
  (2026-09-22). When a `Section`'s sole content is a bare
  `ForEach(...) { ... }` with no wrapping `if`/`else`, it's easy to
  write only one closing brace before `header:` instead of two (one for
  `ForEach`, one for `Section`'s own content closure) — Swift then
  parses `header:` as a second trailing closure on `ForEach` itself
  ("extra trailing closure passed in call"), not on `Section`. This
  compiles as an ordinary Swift file — `swift -frontend -parse` (the
  only syntax check available without local Xcode/macOS) doesn't catch
  it, since it's a semantic overload-resolution error, not a syntax
  error; only a real `ios-app-build` CI run surfaces it. Safest fix when
  a `Section`'s content is a bare `ForEach`: assign the `ForEach` to a
  `let` constant first and reference it by name inside `Section`'s
  content closure (see `DuelsView.swift`'s `pendingSection`/
  `pastDuelsSection`) — that leaves no nested unclosed brace for
  `header:` to misattach to, rather than relying on getting the
  indentation/brace-count exactly right by eye.
- **Found 2026-09-21, mid-fix: this Supabase project's auth emails were
  never usable for real (non-team) users, and iOS's OTP sign-in never
  actually showed a code.** Two compounding issues, found while
  investigating "the app asks for a 6-digit code but the email I get is
  a login link (which doesn't load)": (1) the project was still on
  Supabase's built-in mailer (`noreply@mail.app.supabase.io`, confirmed
  via `mail_type:"magic_link"` in the auth logs) — per Supabase's own
  docs, that mailer **refuses to deliver to any address outside the
  project's own organization team**, so no real end user (web or iOS —
  same Supabase Auth instance, same mailer, for both) could receive any
  auth email at all until custom SMTP is configured; (2) iOS's OTP flow
  (`SupabaseAuthClient.requestEmailOTP`, `POST /auth/v1/otp`) shares
  Supabase's single "Magic Link" template with every OTP request, and
  that template ships showing only a clickable link, never the raw
  `{{ .Token }}` code the iOS UI asks the user to type in — so even a
  successfully-delivered email was the wrong shape for iOS's flow.
  `scripts/configure-custom-smtp.ts` (Resend) and `scripts/
  update-auth-email-template.ts` fix these via the Supabase Management
  API directly (no CLI/MCP wrapper exists for either setting), runnable
  via the `configure-auth-emails.yml` workflow. Also surfaced a real
  scope gap, not a regression: iOS has no Google OAuth at all —
  `docs/superpowers/specs/2026-09-17-native-ios-app-design.md` scoped
  iOS auth as "the existing web app's auth pattern, ported," but the web
  app actually uses password + Google OAuth, never OTP; iOS's OTP-only
  design was built on that incorrect premise and Google was simply never
  added.
- `src/integrations/supabase/{client.ts,client.server.ts,auth-middleware.ts}`
  carry "auto-generated, do not edit" banners from the Lovable Supabase
  connection tool and duplicate a `createSupabaseFetch` helper 3 ways;
  consolidating them risks a future regeneration reverting the change (see
  `src/integrations/supabase/fetch.ts`'s comment for the one file that was
  safe to consolidate).
- `bun run dev` still doesn't boot in the Windows sandbox this has been
  developed in, so nothing UI-level has been visually verified there —
  `bun run build` does work now, though (the Windows path-separator bug
  was in `@lovable.dev/mcp-js`'s Vite plugin, removed along with the MCP
  feature this repo used to expose at `/mcp`).
- **Fixed 2026-09-20: Supabase migrations and Edge Functions now auto-deploy
  on push to `main`** via the `deploy-supabase` job in
  `.github/workflows/ci.yml` — previously every file in
  `supabase/migrations/` needed a manual `supabase db push`, and every
  `supabase/functions/` change needed its own manual `supabase functions
  deploy`, both easy to forget (this bit a real session that added several
  migrations in one sitting). The CI job needs `SUPABASE_ACCESS_TOKEN`,
  `SUPABASE_DB_PASSWORD`, and `LESSON_SESSION_SECRET` set as repo secrets
  (see the job's own comment) — if those lapse or the job is disabled, the
  manual `supabase db push`/`supabase functions deploy` path (or the
  dashboard SQL editor / Supabase MCP `apply_migration`) is still the
  fallback, and the same "feature works in code but 500s in prod" symptom
  is the tell that it has lapsed.
- **`scripts/export-ios-content.ts` and `scripts/seed-curriculum-db.ts` are
  both still manual** ("someone has to remember to run this," the exact
  class of gap `deploy-supabase` was created to close for
  migrations/functions above) — and this bit for real during V3 package
  4a: package 2's expanded achievement catalog (18 -> 24) shipped to web
  and prod's curriculum-data tables, but nobody re-ran
  `export-ios-content.ts`, so the iOS-bundled `achievements.json` (and a
  Kit test asserting its count) silently stayed at 18 until this was
  caught while regenerating it for pkg 4a's new question formats. A CI
  step for `seed-curriculum-db.ts` now exists (`deploy-supabase` job,
  no-ops until `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` repo secrets are
  added), but `export-ios-content.ts`'s output is *committed* JSON, not a
  DB write, so it can't be a silent CI step the same way -- it still needs
  a human to run it and commit the diff after any change to
  `curriculum.ts`/`curriculum-fr.ts`/`scenarios.ts`/`achievements.ts`/
  `vocab-images.ts`, and there's no test that fails loudly if it's
  forgotten (only a symptom: iOS shows stale/missing content the web app
  already has).
- `USER_ID_TABLES` in `account.functions.ts` (GDPR export/delete) previously
  had three real bugs — wrong table name, wrong filter column for
  `profiles`, and two missing tables — all silent because neither
  handler checked query errors. Fixed, but it's evidence this list needs
  to be updated by hand whenever a new user-scoped table is added; nothing
  enforces it stays in sync.
- App Store upload validation (error 90474) rejects an archive whose
  `UISupportedInterfaceOrientations` declares fewer than all four
  orientations, even for an iPhone-only (`TARGETED_DEVICE_FAMILY=1`)
  app — found via a real failed `ios-release.yml` upload, fixed in
  `ios/LearnWithAlphonso/project.yml`. Worth knowing if a future Info.plist
  change reintroduces a narrower orientation list.
- Cloud Voice's Supabase project (`ywavjlmjbxuslbxactsx`, Hector's
  separate account system) auto-paused once already this project's
  lifetime — Supabase free-tier inactivity pausing. If Hector sign-in
  fails with a connection error, check that project's status
  (`mcp__claude_ai_Supabase__get_project`) before assuming a code bug.
- **Offline-first (iOS) has two known, deliberately-unsolved edge cases**
  (see `docs/v2-kickoffs/01-offline-first.md` for the full design):
  concurrent-device review grading, and streak continuity across an
  offline gap. If a queued-offline review grade is replayed against
  `grade-review` after the same item was already graded on another
  device (online) in the meantime, it applies on top of stale SM-2 state
  — single-device usage (the overwhelming common case, since there's only
  ever one local queue) has no such issue. Separately, `complete-lesson`
  derives the completion date from the sync's *execution* time, not when
  the lesson was actually played offline — a lesson played on day N but
  synced on day N+1 records as completed on day N+1, which can break a
  streak the user was relying on that lesson to keep alive. Neither is
  solved by heavier machinery (vector clocks, a client-submitted-date
  trust exception) preemptively; revisit only if real usage shows either
  is a frequent complaint.
- **Vercel's GitHub integration lost this repo across the org transfer,
  then was reconnected and fully confirmed the same day (2026-09-20)**
  — (personal account → `obsidian-media`, transfer done to fix a GitHub
  Actions billing block). Between the transfer and the reconnect, every
  merge to `main` since PR #49 (leaderboards base) went undeployed
  until a manual `vercel deploy --prod` catch-up. **Fully confirmed
  working, both ways, same day**: the Vercel project's git link shows
  `org: "obsidian-media", repo: "LearnWithAlphonso"`
  (`mcp__plugin_vercel_vercel__get_git_deployment_context`); a real
  git-sourced deployment built and went `READY`; and — the real
  end-to-end test — a plain `git push` to `main` (no manual trigger)
  produced a new deployment with `source: "git"` on its own within
  ~90 seconds, proving the webhook itself fires correctly, not just
  that Vercel *can* pull from the repo when asked. Auto-deploy-on-push
  is genuinely restored. `.vercelignore` (added the same day, still
  relevant for any future manual CLI deploy as a fallback) scopes what
  gets uploaded — without it, a deploy from this local machine picks
  up unrelated `.claude/worktrees/` content from other parallel
  sessions (hit a real mid-upload failure
  this way, a file vanished from a live worktree during upload).
- **Test coverage was near-zero before 2026-09-20's PR #46** — now 502
  tests across 72 files, ~91% line / ~90% statement coverage (`bun run
  test:coverage`, see `AGENTS.md`'s Testing section for the full
  per-file breakdown and what's still thin: `HeartsModal.tsx` ~70%,
  `__root.tsx` ~18%, `analyze-weaknesses.ts` ~8% — server routes this
  codebase doesn't unit-test as a matter of established pattern, not an
  oversight).
- **Nudge-a-friend (iOS) is deliberately the weaker V2 approach, not the
  finished feature** — a `nudges` table (`supabase/migrations/
  20260920020000_nudges.sql`) the recipient's app polls for on foreground/
  screen-appear, not real push. A nudge only surfaces once the recipient
  next opens the Friends tab, which the kickoff doc (`docs/v2-kickoffs/
  04-friends-and-social.md`) flagged as largely defeating the point of a
  "nudge" (reaching someone who *hasn't* opened the app). Built anyway per
  explicit direction, with this note as the promised V3 follow-up marker.
  A real V3 version needs: an APNs Auth Key (Apple Developer Console →
  Keys), a `device_tokens` table (RLS-scoped to `auth.uid()`), device-token
  registration on app launch requesting *remote* notification permission
  (a materially different flow than this app's existing local-only
  `NotificationScheduler`), and a server-side trigger — Supabase has no
  built-in cron for Edge Functions as of this note; verify current
  capabilities before assuming `pg_cron` + a `SECURITY DEFINER` function
  is the only path. The same infrastructure would also serve
  leaderboards' "you've been overtaken" feature (currently an in-app
  toast, same reasoning) if that's ever upgraded to real push too — worth
  building once for both rather than twice.
