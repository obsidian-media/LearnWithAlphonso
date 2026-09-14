# Architecture

Written 2026-09-13, derived from the actual migrations/routes at that
commit — re-verify against `supabase/migrations/*.sql` and `src/routes/`
before trusting a detail here, the same way `AUDIT.md` had to be
re-verified twice already. This doc favors "where to look" over "what the
answer currently is," since the latter goes stale fast.

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

| Table                                | Purpose                                                                                                   |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `profiles`                           | Display name, avatar seed, country — one row per `auth.users` row (see `handle_new_user` trigger)         |
| `user_progress`                      | Account-wide state: streak, longest streak, hearts, hearts refill timestamp, streak freezes               |
| `language_progress`                  | Per-course state: xp, cefr_level, placement result, league tier. PK `(user_id, language)`                 |
| `lesson_completions`                 | Best score per lesson per course                                                                          |
| `activity_days`                      | XP earned per calendar day, powers the activity heatmap and weekly-XP leaderboard scope                   |
| `achievements` / `user_achievements` | Achievement catalogue + unlocks                                                                           |
| `friendships`                        | `(user_id, friend_id, status)`, written both directions atomically by `accept_friend_invite`              |
| `review_items`                       | SRS queue: `(user_id, item_key, language)` unique, `ease`/`interval_days`/`repetitions`/`due_on`/`lapses` |
| `ai_usage`                           | Daily per-kind (chat/stt/tts) request counter, read by `consume_ai_quota`                                 |
| `ai_rate_limits`                     | Per-minute per-kind request counter, read by `consume_ai_rate_limit`                                      |

RPCs worth knowing (all `SECURITY DEFINER`, all in `supabase/migrations/`):
`get_leaderboard`, `get_friends_progress`, `accept_friend_invite`,
`consume_ai_quota`, `consume_ai_rate_limit`.

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

## AI integrations

- **Chat:** NVIDIA NIM (`integrate.api.nvidia.com`, OpenAI-compatible),
  model configurable via `NVIDIA_CHAT_MODEL` — `src/routes/api/chat.ts`
- **TTS/STT:** Deepgram directly (Aura-2 / Nova-3) —
  `src/routes/api/tts.ts`, `src/routes/api/stt.ts`
- All three are gated by `consumeQuota` (`src/lib/ai-quota.server.ts`):
  per-minute rate limit checked first, then the daily quota RPC.

## MCP server

`src/routes/mcp.ts` (auto-generated by the `@lovable.dev/mcp-js` Vite
plugin from `src/lib/mcp/index.ts`) exposes `get_my_progress`,
`get_due_reviews`, `list_lessons`, `get_leaderboard` over OAuth
(`auth.oauth.issuer`, tokens verified against the Supabase project's own
auth server). Tools forward the caller's verified token
(`supabaseForUser` in `src/lib/mcp/supabase.ts`) so RLS applies — no admin
client is used anywhere in the MCP layer.

## Known rough edges (see `AUDIT.md` for the full list)

- `src/integrations/supabase/{client.ts,client.server.ts,auth-middleware.ts}`
  carry "auto-generated, do not edit" banners from the Lovable Supabase
  connection tool and duplicate a `createSupabaseFetch` helper 3 ways;
  consolidating them risks a future regeneration reverting the change (see
  `src/integrations/supabase/fetch.ts`'s comment for the one file that was
  safe to consolidate).
- `bun run build` fails on Windows on a pre-existing upstream path bug in
  `@lovable.dev/mcp-js`'s Vite plugin — documented in `vite.config.ts`,
  confirmed not to reproduce on Vercel's Linux build environment. The same
  environment couldn't get `bun run dev` to boot either (see `AUDIT.md`),
  so nothing UI-level has been visually verified in this sandbox.
- **No CI/deploy step applies Supabase migrations to the real project**
  (`project_id` in `supabase/config.toml`) — every file in
  `supabase/migrations/` needs a manual `supabase db push` (or dashboard
  SQL) before it's live. Easy to forget after a session like this one that
  added several; check this first if a feature seems to work in code but
  500s in the real app.
- `USER_ID_TABLES` in `account.functions.ts` (GDPR export/delete) previously
  had three real bugs — wrong table name, wrong filter column for
  `profiles`, and two missing tables — all silent because neither
  handler checked query errors. Fixed, but it's evidence this list needs
  to be updated by hand whenever a new user-scoped table is added; nothing
  enforces it stays in sync.
