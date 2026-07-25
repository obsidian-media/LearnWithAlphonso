## Scope

Ship all four in one pass:
1. Email + Google auth (Lovable Cloud) with a public landing + `/auth` route, and gate the app behind `_authenticated`
2. Backend persistence — sync XP, streak, hearts, lesson history, achievements across devices
3. Weekly league with filters (Global / Friends / Country) and league tiers
4. Streaks (with freezes), achievements, and badges

Defaulting to **yes on a profiles table** (needed for display name + country on leaderboards). Guest local progress is merged into the account on first sign-in.

## Backend (Lovable Cloud)

Enable Cloud, then one migration with these tables + RLS + grants:

- `profiles` — `id (uuid, FK auth.users)`, `username`, `display_name`, `country`, `avatar_seed`, `created_at`. Trigger auto-creates row on signup.
- `user_progress` — `user_id PK`, `xp`, `streak`, `longest_streak`, `last_active_date`, `hearts`, `hearts_refill_at`, `streak_freezes`, `league_tier` (bronze/silver/sapphire/ruby/diamond), `updated_at`.
- `lesson_completions` — `user_id`, `lesson_id`, `correct`, `total`, `xp_earned`, `completed_at`. Unique `(user_id, lesson_id)` on latest.
- `activity_days` — `user_id`, `day (date)`, `xp_earned`. Powers streak strip + weekly XP.
- `achievements` — static seed table (`id`, `title`, `description`, `icon`, `tier`, `criteria_json`).
- `user_achievements` — `user_id`, `achievement_id`, `unlocked_at`, `progress`.
- `friendships` — `user_id`, `friend_id`, `status` (pending/accepted), for Friends leaderboard.

RLS: users read/write their own rows; `profiles` readable by any authenticated user (for leaderboard display); `achievements` readable by all authenticated. All tables get explicit GRANTs to `authenticated` + `service_role`.

## Server functions (`src/lib/*.functions.ts`)

- `syncProgress` — pull current state on app load.
- `completeLessonRemote({ lessonId, correct, total })` — atomic: updates progress, inserts completion + activity row, recomputes streak, evaluates achievement unlocks, returns `{ progress, newlyUnlocked[] }`.
- `getLeaderboard({ scope: 'global'|'friends'|'country', period: 'weekly'|'all-time' })` — reads `activity_days` (weekly) or `user_progress` (all-time), joined to `profiles`.
- `getAchievements` — user's unlock state + progress.
- `mergeGuestProgress({ localState })` — one-time merge on first sign-in.
- `useStreakFreeze` — spend a freeze to protect yesterday.
- `updateProfile({ display_name, country })`.

All use `.middleware([requireSupabaseAuth])`. Weekly bucket = ISO week of `activity_days.day`.

## Auth UI

- `/` — public landing (hero + "Start learning" → `/auth`, "Continue as guest" → local-only).
- `/auth` — combined sign-in / sign-up (email+password + Google button); `redirect_uri` = `window.location.origin`.
- `/_authenticated/route.tsx` — integration-managed gate (already scaffolded when Cloud auth is on).
- Move Learn / Lesson / League / Profile under `_authenticated/`.
- Guest mode: keep current local-only flow intact under `/practice` for anonymous users so nothing regresses.

## Progress store rewrite

`src/lib/progress.ts` becomes a Zustand store hydrated from server (via `syncProgress` in a root effect) with optimistic local writes + background push. On sign-in, if `localStorage` has guest progress, call `mergeGuestProgress` once and clear it.

## League screen

- Header shows current tier + week countdown + your rank.
- Segmented control: **Global | Friends | Country** × **This Week | All Time**.
- Top-3 medal styling kept; "You" row pinned + highlighted.
- Empty states for Friends (add friends CTA) and Country (set country in profile CTA).
- Tier badges (bronze → diamond) rendered as inline SVG in brand palette (not stock gold/silver).

## Achievements + Badges

- New `/achievements` tab (add 4th nav slot, or move under Profile — will put it as a section on Profile to keep nav to 3).
- Achievement categories: **Streak** (3/7/30/100 day), **XP** (100/500/2k/10k), **Perfection** (10/50 perfect lessons), **Explorer** (finish unit 1/2/3), **Consistency** (7 days in a row of ≥20 XP).
- Badge grid on Profile — locked = grayscale + lock overlay, unlocked = full color hard-shadow card.
- Unlock toast (Framer Motion slide-up) triggered by `newlyUnlocked` from `completeLessonRemote`.
- Streak freeze: earn 1 per 10-day streak milestone, auto-applied if a day is missed and freezes > 0.

## Visual polish (keep the direction)

- New tier icons (custom SVG chevron-shield in moss/ember/parchment palette).
- Achievement cards use the same hard-shadow + hairline treatment as existing cards.
- Weekly countdown uses Fraunces tabular numerals.
- No template purples/golds — everything from existing OKLCH tokens.

## Files to add / change

Add:
- `src/routes/auth.tsx`, `src/routes/_authenticated/route.tsx` (if not managed), `src/routes/_authenticated/learn.tsx` (moved from index), `.../lesson.$id.tsx`, `.../league.tsx`, `.../profile.tsx`
- `src/routes/index.tsx` becomes public landing
- `src/lib/progress.functions.ts`, `src/lib/leaderboard.functions.ts`, `src/lib/achievements.functions.ts`, `src/lib/profile.functions.ts`
- `src/data/achievements.ts` (static definitions, seeded to DB)
- `src/components/AchievementCard.tsx`, `BadgeGrid.tsx`, `LeagueTierBadge.tsx`, `UnlockToast.tsx`, `SegmentedControl.tsx`
- Migration file with all tables, RLS, grants, seed achievements

Change:
- `src/lib/progress.ts` — server-synced store
- `src/routes/__root.tsx` — auth listener + progress hydration
- `src/components/AppShell.tsx` — show current tier chip; account menu

## Out of scope this pass

Streak repair after miss (only freeze), friend search UI beyond invite-by-username, push notifications, offline mode. Ready to add in follow-ups.
