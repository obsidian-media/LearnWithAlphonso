# Architecture

Written 2026-09-13, last substantially updated 2026-09-19 — re-verify
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
| `review_items`                                       | SRS queue: `(user_id, item_key, language)` unique, `ease`/`interval_days`/`repetitions`/`due_on`/`lapses`                                                                                                                                                                                                                                                                                                                                                   |
| `ai_usage`                                           | Daily per-kind (chat/stt/tts) request counter, read by `consume_ai_quota`                                                                                                                                                                                                                                                                                                                                                                                   |
| `ai_rate_limits`                                     | Per-minute per-kind request counter, read by `consume_ai_rate_limit`                                                                                                                                                                                                                                                                                                                                                                                        |
| `levels` / `units` / `lessons` / `questions`         | Curriculum data mirrored from `src/data/curriculum.ts`/etc. into real tables (`scripts/seed-curriculum-db.ts` populates them) — exists so the `complete-lesson` Edge Function can validate a completion claim server-side without bundling curriculum JSON. **The web app itself still reads `curriculum.ts` directly, not these tables** — same precedent as `achievements` below. See `docs/superpowers/specs/2026-09-18-curriculum-db-schema-design.md`. |
| `vocab_images` / `placement_questions` / `scenarios` | Same mirroring, for the rest of the curriculum-adjacent static data (`src/data/vocab-images.ts`, `placement.ts`, `scenarios.ts`) — currently no consumer queries these yet                                                                                                                                                                                                                                                                                  |

RPCs worth knowing (all `SECURITY DEFINER`, all in `supabase/migrations/`):
`get_leaderboard`, `get_friends_progress`, `accept_friend_invite`,
`consume_ai_quota`, `consume_ai_rate_limit`, `restore_hearts_if_due`,
`buy_heart_with_xp`, `claim_review_clear_bonus` (the last three: atomic,
row-locked hearts-economy operations — see "Hearts economy" below).

`user_progress`, `language_progress`, `lesson_completions`,
`user_achievements`, `activity_days`, and `review_items` all carry `CHECK`
constraints on their numeric/enum columns (added 2026-09-18) — these tables
still grant direct `INSERT`/`UPDATE` to `authenticated` under RLS (a client
can PATCH its own row via PostgREST), so the constraints are the only thing
stopping a client from writing an arbitrary/negative/invalid value. This is
a deliberate stopgap, not the final design — see the migration's own
comment for why direct writes weren't revoked outright (the iOS
`ProgressSyncClient` still depends on them) and what the real fix looks
like (route every write through a `SECURITY DEFINER` RPC).

**Applying migrations:** there is no CI/deploy step that runs these
automatically (see "Known rough edges" below). After merging a PR that adds
a file under `supabase/migrations/`, someone needs to run
`supabase db push` against the linked project (`project_id` in
`supabase/config.toml`) -- or apply the SQL by hand in the Supabase SQL
editor -- before the corresponding code path will work in the real app. A
new RPC or table referenced by app code but not yet pushed fails at
request time (typically a 500), not at build time.

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

Three trust-sensitive write/issue paths that aren't TanStack Start server
functions, because the native iOS client has no server layer of its own
to run them in. All three are deployed and live in production (project
`qhcjpfbxfcltjbiuknyt`):

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
  due yet, updates/retires the item.

Because Edge Functions bundle each function directory independently,
each carries its own Deno copies of the pure math it needs
(`complete-lesson/{progress-math,hearts,lesson-session}.ts`,
`start-lesson-session/lesson-session.ts`, `grade-review/srs.ts`) rather
than importing across the `supabase/functions/` boundary — **these must
be kept byte-for-byte in sync with their TypeScript source of truth by
hand**; nothing enforces that automatically. Deployed via `supabase
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
- All three are gated by `consumeQuota` (`src/lib/ai-quota.server.ts`):
  per-minute rate limit checked first, then the daily quota RPC.

## Known rough edges

(A full audit is kept locally, gitignored, not in this repo — see the
note in README.md's Documentation section for why.)

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
- **No CI/deploy step applies Supabase migrations to the real project**
  (`project_id` in `supabase/config.toml`) — every file in
  `supabase/migrations/` needs a manual `supabase db push`, the dashboard
  SQL editor, or a Supabase MCP tool's `apply_migration` call before it's
  live. Easy to forget after a session like this one that added several;
  check this first if a feature seems to work in code but 500s in the real
  app. Same applies to the Edge Function in `supabase/functions/` — a code
  change there needs its own `supabase functions deploy` separately from a
  migration push.
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
