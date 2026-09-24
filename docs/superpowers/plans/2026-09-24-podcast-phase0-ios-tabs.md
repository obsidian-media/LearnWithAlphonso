# Podcast Phase 0 — iOS Tab Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce the iOS tab bar from seven tabs to **Learn · Listen · Practice · Hector · Profile**, building the review entry point that folding Review into Learn requires.

**Architecture:** A new `ProfileHubView` gathers League, Friends, Achievements and Settings. `LessonBrowserView` gains a due-count badge and a row into `ReviewQueueView`, both reading the existing offline `SyncQueueStore` cache. `ListenView` ships as an honest placeholder for Phase 1b. The badge's presentation rule lives in `LearnWithAlphonsoKit` so it is unit-tested rather than asserted about a view.

**Tech Stack:** SwiftUI, SwiftData (`SyncQueueStore`), XCTest (`LearnWithAlphonsoKit`), `xcodebuild` in CI.

**Spec:** `docs/superpowers/specs/2026-09-24-podcast-phase0-ios-tabs-design.md`

## Global Constraints

- **Canopy is the iOS default.** Use theme tokens (`AlphonsoColor.*`, `DesignSystem/`) everywhere. Never a fixed colour — a literal is correct in one theme out of four.
- **Nothing becomes unreachable at any commit.** The review entry point is built and committed *before* the Review tab is removed; Settings keeps its gear on Learn.
- Swift package tests run with `swift test --package-path ios/LearnWithAlphonsoKit`, or `ios/LearnWithAlphonsoKit/swift-test.ps1` on Windows.
- The app target has no unit tests anywhere in this repo. CI's `xcodebuild` is the only automated check on it, and it proves compilation only.
- No migration and no schema change in this phase.
- Do not run installs or other test runs concurrently with a verification run.

## Review Focus

Failure modes the happy path misses, each with its test assigned:

1. **A zero due-count rendering as a "0" badge** — a permanent, meaningless dot on Learn that trains people to ignore the badge. *(Task 1)*
2. **A large due count overflowing the badge** — hundreds of due items must cap, not stretch the tab item. *(Task 1)*
3. **A stale cache under-reporting** — acceptable and by design, but the badge must never claim reviews that are not waiting. *(Task 1)*
4. **Review becoming unreachable** — the tab is removed in the same commit that the entry point lands, never earlier. *(Task 3, enforced by ordering)*
5. **A Profile hub destination that opens nothing** — every row must reach a real screen, including Settings, which also stays on Learn's gear. *(Task 2, device-verified)*

---

### Task 1: The due-count badge rule (Kit, tested)

**Files:**
- Create: `ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/ReviewBadge.swift`
- Test: `ios/LearnWithAlphonsoKit/Tests/LearnWithAlphonsoKitTests/ReviewBadgeTests.swift`

**Interfaces:**
- Consumes: nothing.
- Produces: `public enum ReviewBadge { public static func text(dueCount: Int) -> String? }`

- [ ] **Step 1: Write the failing test**

```swift
import XCTest
@testable import LearnWithAlphonsoKit

final class ReviewBadgeTests: XCTestCase {
    // Review Focus #1: a "0" badge is a permanent meaningless dot that
    // teaches people to ignore the badge entirely.
    func testNoBadgeWhenNothingIsDue() {
        XCTAssertNil(ReviewBadge.text(dueCount: 0))
    }

    func testShowsTheCountWhenReviewsAreWaiting() {
        XCTAssertEqual(ReviewBadge.text(dueCount: 1), "1")
        XCTAssertEqual(ReviewBadge.text(dueCount: 42), "42")
    }

    // Review Focus #2: the tab item must not stretch to fit a big number.
    func testCapsLargeCounts() {
        XCTAssertEqual(ReviewBadge.text(dueCount: 99), "99")
        XCTAssertEqual(ReviewBadge.text(dueCount: 100), "99+")
        XCTAssertEqual(ReviewBadge.text(dueCount: 5000), "99+")
    }

    // A negative count cannot happen from .count, but treating it as
    // "nothing due" is the only sane reading if it ever does.
    func testTreatsANegativeCountAsNothingDue() {
        XCTAssertNil(ReviewBadge.text(dueCount: -1))
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `swift test --package-path ios/LearnWithAlphonsoKit --filter ReviewBadgeTests`
Expected: FAIL — `cannot find 'ReviewBadge' in scope`.

- [ ] **Step 3: Implement**

```swift
import Foundation

/// Presentation rule for the Learn tab's due-review badge.
///
/// Lives in the Kit rather than the view so it is actually unit-tested:
/// the app target has no test coverage anywhere in this repo, only a
/// compile check in CI.
public enum ReviewBadge {
    /// Badge text, or nil when no badge should be shown at all.
    public static func text(dueCount: Int) -> String? {
        guard dueCount > 0 else { return nil }
        return dueCount > 99 ? "99+" : String(dueCount)
    }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `swift test --package-path ios/LearnWithAlphonsoKit --filter ReviewBadgeTests`
Expected: PASS (4 tests).

- [ ] **Step 5: Mutation-test the guard**

Temporarily change `guard dueCount > 0` to `guard dueCount >= 0`, re-run, and confirm `testNoBadgeWhenNothingIsDue` goes RED. Restore. A guard that cannot fail is decoration.

- [ ] **Step 6: Commit**

```bash
git add ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/ReviewBadge.swift ios/LearnWithAlphonsoKit/Tests/LearnWithAlphonsoKitTests/ReviewBadgeTests.swift
git commit -m "feat(ios): add the due-review badge rule"
```

---

### Task 2: `ProfileHubView`

**Files:**
- Create: `ios/LearnWithAlphonso/Sources/ProfileHubView.swift`

**Interfaces:**
- Consumes: `LeaderboardView`, `FriendsView`, `AchievementsView`, `SettingsView` — all existing.
- Produces: `struct ProfileHubView: View`, taking the same dependencies those four need (`session`, `contentStore`, `notificationScheduler`, `entitlementStore` as required).

- [ ] **Step 1: Build the hub**

A `NavigationStack` containing a `List` of `NavigationLink`s to League, Friends and Achievements, plus a Settings row. Every colour comes from `AlphonsoColor.*`; match the visual language of the existing list screens (`LeaderboardView` is the closest reference). Each row carries an SF Symbol distinct from the remaining tab icons.

- [ ] **Step 2: Verify it compiles**

Run: `swift build --package-path ios/LearnWithAlphonsoKit`
Expected: builds. (The app target itself compiles only in CI — see Task 5.)

- [ ] **Step 3: Commit**

```bash
git add ios/LearnWithAlphonso/Sources/ProfileHubView.swift
git commit -m "feat(ios): add a Profile hub for League, Friends, Achievements and Settings"
```

---

### Task 3: The review entry on Learn, then the tab swap

This task is deliberately one unit: the entry point and the tab removal ship together, so no commit leaves the review queue unreachable.

**Files:**
- Modify: `ios/LearnWithAlphonso/Sources/LessonBrowserView.swift`
- Modify: `ios/LearnWithAlphonso/Sources/RootView.swift`
- Create: `ios/LearnWithAlphonso/Sources/ListenView.swift`

- [ ] **Step 1: Add the review row to `LessonBrowserView`**

At the top of the lesson list, a row showing the due count from `syncQueueStore.lastKnownDueReviews().count`, navigating to `ReviewQueueView` with the same dependencies `RootView` passes it today. Hidden entirely when nothing is due. Theme tokens only.

- [ ] **Step 2: Add the Listen placeholder**

`ListenView.swift`: a `NavigationStack` with an honest empty state — it says episodes are coming, does not pretend to load, and shows no fake content. Phase 1b replaces the body wholesale.

- [ ] **Step 3: Rewrite the tab bar**

`RootView.swift` becomes exactly five tabs:

```swift
LessonBrowserView(...)
    .tabItem { Label("Learn", systemImage: "book.fill") }
    .badge(ReviewBadge.text(dueCount: syncQueueStore.lastKnownDueReviews().count) ?? "")
ListenView()
    .tabItem { Label("Listen", systemImage: "headphones") }
ConversationView(...)
    .tabItem { Label("Practice", systemImage: "mic.fill") }
HectorView(...)
    .tabItem { Label("Hector", systemImage: "sparkles") }
ProfileHubView(...)
    .tabItem { Label("Profile", systemImage: "person.crop.circle.fill") }
```

Note `.badge(String?)` accepts nil to show nothing — prefer the nil-accepting overload over `?? ""` if it type-checks; an empty-string badge may still render a dot. Verify which behaviour the SDK gives and use the one that shows nothing at zero.

Confirm no remaining tab reuses another's SF Symbol.

- [ ] **Step 4: Confirm nothing was orphaned**

Run: `grep -rn "ReviewQueueView(\|AchievementsView(\|LeaderboardView(\|FriendsView(\|SettingsView(" ios/LearnWithAlphonso/Sources/`
Expected: every one of those five views is instantiated somewhere — `ReviewQueueView` from `LessonBrowserView`, the rest from `ProfileHubView`, and `SettingsView` additionally from Learn's gear.

- [ ] **Step 5: Commit**

```bash
git add ios/LearnWithAlphonso/Sources/LessonBrowserView.swift ios/LearnWithAlphonso/Sources/RootView.swift ios/LearnWithAlphonso/Sources/ListenView.swift
git commit -m "feat(ios): consolidate to five tabs and make review reachable from Learn"
```

---

### Task 4: Documentation

**Files:**
- Modify: `README.md`, `ARCHITECTURE.md`, `CHANGELOG.md`, `AGENTS.md`

- [ ] **Step 1: Update the docs**

Record the five-tab structure, the Profile hub, the review entry on Learn, and — prominently — that the Listen tab is a placeholder until Phase 1b and **no App Store release may go out in between**.

- [ ] **Step 2: Commit**

```bash
git add README.md ARCHITECTURE.md CHANGELOG.md AGENTS.md
git commit -m "docs(ios): document the five-tab structure and the Profile hub"
```

---

### Task 5: CI and the device gate

- [ ] **Step 1: Push and let CI compile the app target**

`ios-app-build` running a real `xcodebuild` is the only automated verification the app target has.

- [ ] **Step 2: State the gate plainly in the PR**

The PR must say that CI green means it compiles, not that it is right, and list the five device checks from the spec for the account owner to run on TestFlight: no "More" overflow, badge legible and correct, every hub destination opens, Settings still on Learn's gear, and all four themes.
