# Learning goal planner, part 2 (iOS) Implementation Plan

> Status (2026-10-09): implemented (#225).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Learn tab on iOS shows the learner's goal card ("Finish B1 by 1 Mar 2027", lessons a week, status) and lets them set, change and remove it, rendering the plan the server already computes.

**Architecture:** No plan maths on the device. A Kit `LearningGoalClient` calls `/api/learning-goal` (the same route the web card uses) and decodes the shared JSON contract (`learning-goal.fixtures.json`, copied into the Kit tests and pinned byte-for-byte by a web test). A pure Kit `GoalCopy` turns a plan into the same wording the web card uses, so wording is tested on any machine. The SwiftUI card and setup sheet in the app target only lay that out.

**Tech Stack:** Swift package `LearnWithAlphonsoKit` (XCTest; runs locally), SwiftUI app target (compiled only by CI's `ios-app-build`), Vitest for the one web-side pin.

**Spec:** `docs/superpowers/specs/2026-10-05-learning-goal-planner-design.md`. Web part 1 is merged (#223); this is rollout step 2. Android is step 3, its own plan.

## Global Constraints

- The device never computes the plan. Unknown future values in `status` or `realism` decode to `.unknown` (a newer server must not break an older app); a missing or mistyped required field is an error.
- `goal.createdAt` is ISO-8601 with milliseconds and `Z` (the server normalises it); store it as a `String` and never parse it with a strict ISO decoder.
- Days are UTC. Dates display as `10 Nov 2026` (en_GB, UTC time zone), matching the web card.
- Wording is the web card's wording (see `src/components/GoalCard.tsx`); change both together.
- Free and Pro both get the card. No AI call, no quota.
- Only Learn-tab code changes. No iOS build is cut; no version bump. App-target code compiles only in CI and is NOT run on a device by this work.
- File writes in this environment drop backslashes: write Swift escapes (`\n`, `\u{2026}`, string interpolation) with a raw Python string or check them after writing.

## Review Focus

- A server `plan: null` with a goal present ("level passed this target") must render the "pick a new target" state, not crash or show zeros.
- A response whose `goal.createdAt` is not ISO-with-milliseconds must still decode on iOS (it is a plain string), while a missing field must fail.
- Offline: the cached plan must be per user, shown only for a network failure (`URLError`), never for 401 or server errors.
- A failed remove must not look like "offline".
- The preview request must write nothing and be ignored if a newer one was started.

## File Structure

- Create `ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/LearningGoal.swift` (models + decoding + errors), `LearningGoalClient.swift`, `GoalCopy.swift`, `GoalCache.swift`
- Create tests `LearningGoalTests.swift`, `LearningGoalClientTests.swift`, `GoalCopyTests.swift`, `GoalCacheTests.swift`, and the fixture copy `ios/LearnWithAlphonsoKit/Tests/LearnWithAlphonsoKitTests/Fixtures/learning-goal.fixtures.json` (declared as a test resource in `Package.swift`)
- Create `src/lib/learning-goal-ios-fixtures.test.ts` (byte-for-byte pin)
- Create `ios/LearnWithAlphonso/Sources/GoalCardView.swift`, modify `LessonBrowserView.swift` (one `Section`)
- Modify README, ARCHITECTURE, AGENTS, CHANGELOG, local BACKLOG

---

### Task 1: Fixture copy and the web drift pin

**Files:** Create the Kit fixture copy and `src/lib/learning-goal-ios-fixtures.test.ts`; modify `ios/LearnWithAlphonsoKit/Package.swift`.

- [ ] **Step 1: Write the failing web test**

```ts
// src/lib/learning-goal-ios-fixtures.test.ts
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// The iOS Kit decodes a COPY of the shared contract fixtures. If the web file changes and the
// copy is not refreshed, iOS would keep decoding an old shape and nothing would fail.
const web = path.resolve(import.meta.dirname, "learning-goal.fixtures.json");
const ios = path.resolve(
  import.meta.dirname,
  "../../ios/LearnWithAlphonsoKit/Tests/LearnWithAlphonsoKitTests/Fixtures/learning-goal.fixtures.json",
);

describe("iOS copy of the learning-goal fixtures", () => {
  it("is byte-for-byte the web file", () => {
    expect(fs.readFileSync(ios, "utf8")).toBe(fs.readFileSync(web, "utf8"));
  });
});
```

- [ ] **Step 2:** Run `bun run test src/lib/learning-goal-ios-fixtures.test.ts`. Expected: FAIL (file not found).
- [ ] **Step 3:** Copy the file (`cp src/lib/learning-goal.fixtures.json ios/LearnWithAlphonsoKit/Tests/LearnWithAlphonsoKitTests/Fixtures/`) and declare it in `Package.swift` on the test target: `resources: [.copy("Fixtures")]`. Keep every existing test-target setting.
- [ ] **Step 4:** Run the web test again. Expected: PASS. Mutation: edit one character in the iOS copy, expect FAIL, restore.
- [ ] **Step 5: Commit** `test(goal-ios): pin the iOS copy of the shared fixtures`.

---

### Task 2: Models, decoding and errors (Kit)

**Files:** Create `LearningGoal.swift`, `LearningGoalTests.swift`.

**Interfaces:**
- Produces: `GoalStatus` (`done, expired, justStarted, ahead, onTrack, behind, unknown`), `GoalRealism` (`ok, ambitious, unrealistic, unknown`), `GoalPlan` (`currentLevel, targetLevel, targetDate: String; lessonsInScope, lessonsRemaining, lessonsDoneLast7Days, requiredPerWeek: Int; status; realism; suggestedDate: String?; asOf: String`), `StoredGoal` (`course, targetLevel, targetDate, createdAt: String`), `LearningGoalState { goal: StoredGoal?; plan: GoalPlan? }`, `LearningGoalError` (`invalid(String?)`, `notSignedIn`, `unavailable`, `offline`) with `userMessage`, and `LearningGoalDecoding.state(from: Data) throws -> LearningGoalState`, `LearningGoalDecoding.plan(fromPreview: Data) throws -> GoalPlan`.

- [ ] **Step 1: Write failing tests** covering: every sample in the `plans` fixture decodes (status raw strings `just_started`, `on_track` map to `justStarted`, `onTrack`); every envelope decodes (`stored`, `stored_plan_null` gives `plan == nil` with a goal, `none` gives both nil, `preview` decodes through `plan(fromPreview:)`); an unknown `status` string decodes to `.unknown` (not an error); a missing `requiredPerWeek`, a string where a number is expected, and `plan` present but not an object each throw `.unavailable`; `createdAt` with microseconds and `+00:00` still decodes (plain string); `userMessage` wording equals the web's four messages and `invalid(detail)` returns the detail when present; fixtures are loaded with `Bundle.module.url(forResource: "learning-goal.fixtures", withExtension: "json", subdirectory: "Fixtures")`.
- [ ] **Step 2:** `swift test --filter LearningGoalTests`, expect compile FAIL (types missing).
- [ ] **Step 3: Implement** with `JSONSerialization` (not `Codable`, so unknown strings and clear error paths are explicit; the existing clients do the same). Required keys missing or wrongly typed throw `LearningGoalError.unavailable`.
- [ ] **Step 4:** run the filter, expect all pass.
- [ ] **Step 5: Mutation-check** each rule (unknown status mapped to an error, a required key not enforced, `createdAt` parsed as a date, wording changed). Each must fail a test.
- [ ] **Step 6: Commit.**

---

### Task 3: The client (Kit)

**Files:** Create `LearningGoalClient.swift`, `LearningGoalClientTests.swift`.

**Interfaces:**
- Consumes: Task 2 types. Produces `LearningGoalClient(baseURL:accessToken:refreshAccessToken:requester:)` (same shape as `AIConversationClient`, including the single 401 refresh-and-retry) with `fetch(course:) async throws -> LearningGoalState`, `preview(course:targetLevel:targetDate:) async throws -> GoalPlan`, `save(course:targetLevel:targetDate:) async throws -> LearningGoalState`, `remove(course:) async throws`.

- [ ] **Step 1: Write failing tests** (style of `SavedWordClientTests`, `TestCapture` for the request): `fetch` is `GET /api/learning-goal?course=en` with the bearer token; `preview` is `GET` with `targetLevel` and `targetDate` in the query and no body; `save` is `PUT` with JSON `{course, targetLevel, targetDate}`; `remove` is `DELETE ?course=en`; 400 throws `.invalid(detail)` with the body's `error` string; 401 and 403 throw `.notSignedIn` (a 401 first triggers one refresh-and-retry when configured, and a refreshed token still getting 401 surfaces `.notSignedIn`); 5xx throw `.unavailable`; a `URLError` throws `.offline`; a 200 with a wrong-shaped body throws `.unavailable`; an invalid course string is not sent (the call takes the course code as a `String`, and the test asserts it is URL-encoded).
- [ ] **Step 2:** run, expect compile FAIL. **Step 3:** implement, copying `AIConversationClient`'s request and `perform` pattern (read it first; do not change `AIConversationClient`). **Step 4:** run, expect pass. **Step 5:** mutation-check (drop the bearer header, send a body on preview, treat 400 as `.unavailable`, drop the retry). **Step 6:** commit.

---

### Task 4: Wording and cache (Kit)

**Files:** Create `GoalCopy.swift`, `GoalCache.swift`, `GoalCopyTests.swift`, `GoalCacheTests.swift`.

**Interfaces:**
- Produces `GoalCopy`: `headline(for: StoredGoal) -> String` ("Finish B1 by 1 Mar 2027"), `progress(for: GoalPlan) -> String` ("12 of 30 lessons done"), `statusLine(for: GoalStatus) -> String` (the web card's `STATUS_LINE`), `weeklyLine(for: GoalPlan) -> String?` (nil for `done` and `expired`; otherwise "N lessons a week to finish on time; M in the last 7 days."), `suggestionLine(for: GoalPlan) -> String?` (only for `behind` and `expired` with a `suggestedDate`), `realismLine(for: GoalPlan) -> String?`, `formatDate(_ iso: String) -> String` (UTC, `d MMM yyyy`, en_GB), `estimateNote` ("An estimate of lessons, not of fluency."), `monthsFromToday(_ months: Int, now: Date) -> String` clamped to the end of a shorter month, `tomorrow(now:) -> String`.
- Produces `GoalCache` (protocol `GoalCacheStore` over `UserDefaults`): `read(userID:course:) -> LearningGoalState?` (requires goal AND plan), `write(_:userID:course:)`, `clear(userID:course:)`; keys include the user id; corrupt data reads as nil.

- [ ] **Step 1: Write failing tests**: each wording function against the same cases the web card tests use (done, just_started, behind with suggestion `10 Nov 2026`, expired shows no weekly line and a suggestion, ambitious and unrealistic text); `formatDate("2026-11-10") == "10 Nov 2026"` and a non-date input returns the input unchanged; `monthsFromToday(6, now: 2026-08-31) == "2027-02-28"` and `(6, 2026-10-06) == "2027-04-06"`; `tomorrow`. Cache: round trip per user; another user id reads nil; clear removes; corrupt data nil; a state with `plan == nil` is not cached.
- [ ] **Step 2-4:** compile-fail, implement (UTC calendar and `en_GB` locale set explicitly), pass. **Step 5:** mutation-check (month clamp, UTC zone, per-user key, expired weekly line). **Step 6:** commit.

---

### Task 5: The Learn tab card (app target)

**Files:** Create `ios/LearnWithAlphonso/Sources/GoalCardView.swift`; modify `LessonBrowserView.swift`.

App-target code compiles only in CI and is not run here. Keep it thin: every string comes from `GoalCopy`, every request from `LearningGoalClient`, every cache read from `GoalCache`.

- [ ] **Step 1: Implement `GoalCardView(session:, course:)`** as a `Section` content view following `WeeklyChallengesSection`'s pattern and `AlphonsoComponents` styling: states `loading`, `empty` ("Set a learning goal" button), `goal` (headline, progress bar via `AlphonsoProgressBar`, `progress`, status line, weekly line, suggestion, realism, `estimateNote`, "Change goal" and "Remove goal" buttons), `error` (message plus "Try again"). Load with `.task(id: course.translationCourseCode)`; a result that arrives after the course changed is ignored. On `LearningGoalError.offline` show the cached plan (per user, from `GoalCache`) with "As of <date>" and the edit buttons disabled; any other error never falls back to the cache. A failed remove shows an inline error and leaves the goal editable.
- [ ] **Step 2: Setup sheet** (`.sheet`): `Picker` for level (A1..C1), `DatePicker` (date only, minimum tomorrow UTC), "3 months", "6 months", "12 months" buttons using `GoalCopy.monthsFromToday`, a live preview via `.task(id: "\(level)|\(date)")` calling `preview` (a newer selection cancels the older task, so stale answers are dropped), the weekly line and realism line, the server's reason on a 400, "Save goal" disabled until a preview succeeded and while saving, `estimateNote`. After Save, update state and `GoalCache.write`; after Remove, `GoalCache.clear`.
- [ ] **Step 3: Accessibility:** the card is one `accessibilityElement(children: .contain)` labelled "Learning goal"; the status line is plain text (not colour-only); buttons have explicit labels; the sheet moves focus naturally via `NavigationStack` title "Set a learning goal".
- [ ] **Step 4: Wire it:** add `Section { GoalCardView(session: session, course: course) }` just above `WeeklyChallengesSection(session: session)` in `LessonBrowserView`. Make no other change to that file.
- [ ] **Step 5: Verify what can be verified locally:** `swift build` and the full `swift test` (Kit only). Push and read the `ios-app-build` result in CI; that is the compile check for this task. Record explicitly that layout, VoiceOver, Dynamic Type and the sheet are unverified.
- [ ] **Step 6: Commit.**

---

### Task 6: Documents, review, PR

- [ ] **Step 1:** CHANGELOG entry (iOS part 2, in no build; what is not verified), README feature bullet update, ARCHITECTURE paragraph (iOS client, `GoalCopy`, cache rules, fixtures pin), AGENTS rows (Kit files; "change `GoalCopy` and `GoalCard.tsx` wording together"; the fixtures pin test), local BACKLOG item 8 (part 2 done, part 3 Android left; iOS device checks added to the 0.0-ac #4 checklist: card layout, setup sheet, VoiceOver, Dynamic Type, offline cache).
- [ ] **Step 2: Full verification:** `swift test` (whole Kit), `bun run test` for the two touched web test files, `bunx tsc --noEmit`, `bun run lint`.
- [ ] **Step 3: Fresh whole-branch review** with `review-package`, the Review Focus above verbatim, and the ledger's rulings; fix Critical and Important findings test-first in one pass.
- [ ] **Step 4:** two-dot diff against `origin/main`, push, open the PR with a "NOT verified" section (the SwiftUI layer is CI-compiled only), apply valid CodeRabbit comments, merge when green. No iOS build is cut; nothing reaches users until you cut one.

## Self-review

Spec coverage: iOS card and setup (Task 5), shared contract and the drift pin (Tasks 1, 2), offline cache rules (Task 4, 5), wording parity (Task 4). Not in this plan: Android (step 3), push reminders (out of scope in the spec). Type names (`GoalPlan`, `StoredGoal`, `LearningGoalState`, `LearningGoalError`, `GoalCopy`, `GoalCache`, `LearningGoalClient`) are defined once in Tasks 2-4 and used unchanged in Task 5.
