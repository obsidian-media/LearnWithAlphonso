# Design: iOS Achievements Browse Screen

> Written 2026-09-19. V2, parallel-safe (new screen, reads existing data
> only). Leagues themselves already have iOS UI groundwork
> (`LessonCompletionResult.progress.leagueTier` flows through
> `LessonPlayerView`'s finish screen already) — this doc is specifically
> the achievements *catalog browse* screen the web has embedded in
> `/profile` and iOS has nothing for yet.

## Goal

A screen listing every achievement (locked and unlocked), matching the
web's `ACHIEVEMENTS` catalog display on `/profile` — title, description,
tier badge, and whether/how-close the user is to unlocking it.

## Data

Two pieces, both already real:

- **Catalog** (static): `src/data/achievements.ts`'s `ACHIEVEMENTS`
  array — id/title/description/icon/tier/category/threshold. Not
  currently bundled to iOS. The `achievements` Postgres table already
  mirrors this (used server-side by `complete-lesson` to compute newly
  unlocked ids), so there are two real options:
  1. Bundle it as static JSON the same way `scenarios.json` is (extend
     `scripts/export-ios-content.ts` + `src/lib/ios-content-export.ts`
     with a `buildIOSAchievementsBundle()`) — zero network calls, matches
     the existing bundled-content pattern.
  2. Fetch from the `achievements` table via PostgREST at runtime
     (confirmed: `GRANT SELECT ON public.achievements TO authenticated,
     anon` already exists, `supabase/migrations/20260725012934_*.sql` —
     this option needs no migration either).
  **Recommend option 1** — consistent with every other piece of content
  this app bundles, and the catalog changes rarely enough that a rebuild
  to pick up a new achievement is an acceptable tradeoff (same tradeoff
  already accepted for lessons/scenarios).
- **Progress** (per-user): `user_achievements` table — `(user_id,
  achievement_id, progress)`. RLS is `auth.uid() = user_id`-scoped (same
  family of tables as `review_items`), so a direct PostgREST `GET
  /rest/v1/user_achievements?select=achievement_id,progress` under the
  user's own JWT is safe — no Edge Function needed. Add
  `ProgressSyncClient.fetchUnlockedAchievements() async throws ->
  [UnlockedAchievement]` (`achievementID: String, progress: Int`).

## Components (Swift)

- **Kit**: `Achievement` model (mirrors `achievements.ts`'s shape) +
  `ContentStore.achievements: [Achievement]` loader, same pattern as
  `ContentStore.scenarios`.
- **App**: `AchievementsView.swift` — a `List`/grid of achievement cards:
  tier-colored badge (bronze/silver/gold/diamond — port the web's
  tier→color mapping, check `LeagueTierBadge.tsx`/achievement styling
  for the exact palette rather than guessing new colors), title,
  description, and a progress indicator (`user's stat for this
  category` / `threshold`) for locked ones, a checkmark/"Unlocked" state
  for ones present in `user_achievements`.

## Data flow

1. On appear: load `ContentStore.achievements` (instant, bundled) +
   `fetchUnlockedAchievements()` (network).
2. Merge by `id` for the locked/unlocked + progress display.

## Testing

- Kit: a `ContentStoreTests` case confirming `achievements.json` loads
  and decodes (matches the existing `scenarios` load test, if one
  exists — check `ContentStoreTests.swift` for the pattern to follow).
- Kit: `ProgressSyncClientTests` case for `fetchUnlockedAchievements`,
  same shape as the `fetchDueReviews` test (GET request, RLS-scoped,
  decode the row array).
- App: `ios-app-build` CI compile is the verification.

## Rollout

Reachable from wherever makes sense given iOS has no Profile screen yet
(same situation `2026-09-19-ios-friends-design.md` flagged) — a new tab
is the honest V2 choice, or a NavigationLink from an existing tab's
toolbar if the tab bar is getting crowded by the time this lands (by
this point: Learn, Review, Practice, Hector, plus whatever
Leaderboards/Friends docs added — worth checking actual tab count before
implementing and using judgment on tab bar vs. a "More" screen).
