# Podcast library Phase 0 — iOS tab consolidation

**Date:** 2026-09-24
**Status:** design approved in chat, not yet implemented
**Branch:** `worktree-podcast-phase0-ios` (from `ff4ba57`)
**Follows:** `docs/superpowers/specs/2026-09-24-podcast-library-phase1-design.md`

## Purpose

Make room on the iOS tab bar for Listen, and fix an existing defect while
doing it.

`ios/LearnWithAlphonso/Sources/RootView.swift` declares **seven** tabs.
iPhone renders at most five before collapsing the remainder into a system
"More" list, so Achievements is already buried today — this is a live
defect, not a cost introduced by the podcast work.

Target: **Learn · Listen · Practice · Hector · Profile**.

### Success criteria

- Five tabs, none in "More", on an iPhone screen.
- The review queue is reachable and its due count is visible without
  opening it.
- Nothing that was reachable before becomes unreachable.
- Every surface reads theme tokens, so Canopy (the iOS default) is
  correct — no fixed colours.

## A correction this design rests on

The Phase 1 spec justified folding Review into Learn by saying Learn
"already carries a live due-count badge, so the entry point and its
discoverability already exist." **That is true of the web app and false
on iOS.** Verified: `ReviewQueueView` is instantiated in exactly one
place in the entire iOS app — the tab bar — and `LessonBrowserView` has
no review entry, no due count, no badge.

So removing Review's tab without building an entry point first does not
relocate the review queue, it **deletes the only way in**. Building that
entry is therefore in scope here, not free.

## What changes

### 1. The review entry on Learn (build first, remove the tab last)

- A **tab-bar badge** on Learn showing the number of due reviews.
- A **row at the top of the lesson list** — due count, tapping it opens
  `ReviewQueueView`.

Both read `SyncQueueStore.lastKnownDueReviews().count`, the existing
offline cache, with no new network call — the same posture
`StatusHeaderView` already takes.

That count is safe to display. The cache is replaced wholesale from the
server's authoritative due list (`replaceLastKnownDueReviews`) and pruned
when an item is graded offline and is no longer due. Because due dates
only ever pass, a stale cache under-reports rather than over-reports:
it can miss items that became due since the last fetch, but it cannot
show reviews that are not really waiting.

**Ordering matters:** the entry point ships in the same change that
removes the tab, never after it.

### 2. `ProfileHubView` (new)

A list gathering what leaves the tab bar:

| Destination | Note |
| --- | --- |
| League (`LeaderboardView`) | already hubs Teams and Season |
| Friends (`FriendsView`) | already hubs Duels |
| Achievements (`AchievementsView`) | currently a tab |
| Settings (`SettingsView`) | currently behind a gear on Learn |

The tab bar is flatter than the app: League and Friends are already hub
screens. This assembles existing navigation rather than inventing a
hierarchy.

Settings keeps its gear on Learn as well — removing a path people already
use, in a change about making things reachable, would be perverse.

### 3. `ListenView` (placeholder, filled by Phase 1b)

The Listen tab ships in this change with an honest empty state. Phase 1b
replaces it with the real client (`PodcastClient`, folder tree, player).

**Release constraint:** no App Store release may go out between Phase 0
and Phase 1b, or real users get a tab that does nothing. Phase 1b follows
immediately and continuously; if that ordering ever breaks, the Listen
tab comes out until 1b is ready.

### 4. Duplicate tab icon (existing defect)

`League` and `Achievements` both use `trophy.fill` today. Both move
behind Profile, so the collision disappears, but Profile needs an icon
distinct from every remaining tab.

## Constraints

- **Canopy is the iOS default.** Every new view uses theme tokens
  (`AlphonsoColor.*`, `DesignSystem/`), never fixed colours. A hardcoded
  colour is correct in exactly one theme out of four.
- **No migration, no schema change.** Nothing in this phase touches the
  database. (The Phase 1a version collision is not a risk here; when a
  migration is next needed, use a real timestamp with seconds, never a
  rounded `HHmmss` of zeros.)

## Testing, and what it cannot prove

- **XCTest (`ios/LearnWithAlphonsoKit`)** covers pure logic. The badge's
  presentation rule (hidden at zero, capped above 99) goes in the Kit so
  it is genuinely tested rather than asserted about a view.
- **`xcodebuild` in CI** proves the app target compiles. That is the only
  automated check that exists for the app target — there is no macOS or
  Xcode in the development environment.

**A green CI does not mean this is right.** Compilation says nothing
about whether five tabs fit, whether the badge renders legibly in Canopy,
or whether the Profile hub looks deliberate. Backlog items 11, 13 and 15
each passed CI and were still wrong on a screen. **A real-device
TestFlight pass by the account owner is required before this is
considered done**, specifically checking:

1. Five tabs, no "More" overflow, on a real iPhone.
2. The due-count badge and row — correct number, legible in Canopy.
3. Every Profile hub destination opens.
4. Settings still reachable from Learn's gear.
5. All four themes, not just Canopy.

## Out of scope

The real Listen screen (Phase 1b), transcripts and questions (Phase 2),
offline download (Phase 3), the admin subsystem (Phase 4), and the
`podcast_play_events` INSERT-grant hardening — which is a migration, is
now higher priority than the rest, and belongs in its own small PR rather
than riding along with an iOS navigation change.
