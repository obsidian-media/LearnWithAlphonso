# Podcast Phase 1b — iOS Listen Client Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `ListenView` placeholder with a real client — browse the folder tree, play episodes with background audio and lock-screen controls, and resume where you left off across devices.

**Architecture:** Everything with a decision in it goes into `LearnWithAlphonsoKit`, where it can be unit-tested: models, tree logic, position clamping, audio-URL building, and `PodcastClient` (mirroring `ProgressSyncClient`'s injected-`Requester` shape). The app target holds only SwiftUI views and one `@Observable` audio player wrapping `AVPlayer`.

**Tech Stack:** SwiftUI, AVFoundation, MediaPlayer, XCTest (`LearnWithAlphonsoKit`), `xcodebuild` in CI.

**Spec:** `docs/superpowers/specs/2026-09-24-podcast-phase1b-ios-design.md`

## Where verification actually stands

Be honest about this while building, not at the end:

- **Kit code** (client, tree, clamp, URLs) gets real tests. This is most of the logic and all of the branching.
- **The audio layer — session category, interruptions, route changes, Now Playing, background playback — has no automated coverage at all.** There are no app-target unit tests in this repo, no macOS/Xcode in the development environment, and a simulator would not prove the interesting cases anyway. `xcodebuild` in CI proves it compiles.
- The riskiest code in this phase is therefore the least verified. Say so in the PR, and treat the device pass as the only real check on it.

## Global Constraints

- **Canopy is the iOS default.** Theme tokens (`AlphonsoColor.*`) only, never fixed colours.
- **`recordPlayEvent` goes through the `record_podcast_play_event` RPC**, never a direct insert. `authenticated` has no INSERT grant on `podcast_play_events`; a direct insert fails as permission denied inside a call the player swallows, so play recording would silently never happen.
- **No view pushed inside `ListenView` may own a `NavigationStack`.** Nesting is what forced Phase 0's hub to present rather than push.
- Every ported function carries a comment naming its TypeScript original **and that original's test file**, so drift is visible in review.
- Kit tests: `swift test --package-path ios/LearnWithAlphonsoKit` (or `swift-test.ps1` on Windows). No concurrent builds — the SwiftPM build DB locks, and a starved run produces meaningless timeouts.
- No migration in this phase. If one becomes necessary, its version must sort **after** `20260926030000_podcast_library.sql` regardless of wall-clock time.

## Review Focus

1. **Category collision with the mic screens.** A podcast plays, the learner opens a speaking exercise (`.playAndRecord`), and the podcast is killed, ducked, or resumes wrongly on return. *(Task 4, policy + device check)*
2. **A token that expires mid-session.** Position saves start 401ing into a best-effort call that swallows errors, so resume silently stops working. *(Task 3)*
3. **Cross-device resume moving backwards.** Last-writer-wins drags a 5:00 position back to 0:30 when a stale device syncs later. *(Task 3)*
4. **A folder tree with a cycle or a missing parent**, from hand-edited data — rendering must not loop or lose the tree. *(Task 1)*
5. **An episode whose stored duration disagrees with the file.** The chunk-join probe is still unrun; resume must clamp against the media. *(Task 2 + Task 4)*

---

### Task 1: Models and folder-tree port (Kit)

**Files:**
- Create: `ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/PodcastModels.swift`
- Create: `ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/PodcastTree.swift`
- Test: `ios/LearnWithAlphonsoKit/Tests/LearnWithAlphonsoKitTests/PodcastTreeTests.swift`

**Interfaces:**
- Produces:
  - `public struct PodcastFolder: Sendable, Equatable, Identifiable { id, parentID, slug, title, description, sortOrder }`
  - `public struct PodcastEpisode: Sendable, Equatable, Identifiable { id, folderID, slug, title, description, audioURL, durationSeconds, positionSeconds }`
  - `public enum PodcastTree { static func children(of:in:) -> [PodcastFolder]; static func resolve(path:in:) -> PodcastFolder?; static func findCycle(in:) -> [String]? }`

- [ ] **Step 1: Write the failing tests**

Port the cases from `src/lib/podcast-tree.test.ts` one-for-one:

```swift
import XCTest
@testable import LearnWithAlphonsoKit

final class PodcastTreeTests: XCTestCase {
    private func folder(_ id: String, _ parentID: String?, _ slug: String, _ sortOrder: Int = 0) -> PodcastFolder {
        PodcastFolder(id: id, parentID: parentID, slug: slug, title: slug, description: nil, sortOrder: sortOrder)
    }

    func testChildrenAreOrderedBySortOrder() {
        let all = [folder("b", "a", "b1", 2), folder("a", nil, "en"), folder("c", "a", "c1", 1)]
        XCTAssertEqual(PodcastTree.children(of: "a", in: all).map(\.slug), ["c1", "b1"])
    }

    func testRootsAreFoldersWithNoParent() {
        let all = [folder("a", nil, "en"), folder("b", "a", "a1")]
        XCTAssertEqual(PodcastTree.children(of: nil, in: all).map(\.slug), ["en"])
    }

    func testAChildWithAMissingParentIsDroppedNotPromoted() {
        // Surfacing an orphan at top level would misrepresent the tree.
        let all = [folder("a", nil, "en"), folder("orphan", "gone", "lost")]
        XCTAssertEqual(PodcastTree.children(of: nil, in: all).map(\.slug), ["en"])
    }

    func testResolvesASlugPathOfArbitraryDepth() {
        let all = [folder("a", nil, "en"), folder("b", "a", "a1"), folder("c", "b", "cafe")]
        XCTAssertEqual(PodcastTree.resolve(path: ["en", "a1", "cafe"], in: all)?.id, "c")
    }

    func testDoesNotMatchAFolderThatExistsElsewhereInTheTree() {
        // "cafe" is a child of a1, not of en -- en/cafe must not resolve.
        let all = [folder("a", nil, "en"), folder("b", "a", "a1"), folder("c", "b", "cafe")]
        XCTAssertNil(PodcastTree.resolve(path: ["en", "cafe"], in: all))
    }

    // Review Focus #4.
    func testDetectsACycle() {
        XCTAssertNotNil(PodcastTree.findCycle(in: [folder("a", "b", "en"), folder("b", "a", "a1")]))
        XCTAssertEqual(PodcastTree.findCycle(in: [folder("a", "a", "en")]), ["a"])
        XCTAssertNil(PodcastTree.findCycle(in: [folder("a", nil, "en"), folder("b", "a", "a1")]))
    }

    func testChildrenTerminatesOnACyclicTree() {
        // A cycle must not hang the UI: members have non-nil parents, so
        // they never surface as roots and the walk is bounded.
        let all = [folder("a", "b", "en"), folder("b", "a", "a1")]
        XCTAssertEqual(PodcastTree.children(of: nil, in: all).count, 0)
    }
}
```

- [ ] **Step 2: Run to verify they fail**

Run: `swift test --package-path ios/LearnWithAlphonsoKit --filter PodcastTreeTests`
Expected: FAIL — `cannot find 'PodcastTree' in scope`.

- [ ] **Step 3: Implement both files**

`PodcastTree`'s doc comment must name `src/lib/podcast-tree.ts` **and** `src/lib/podcast-tree.test.ts` as the originals, per the Global Constraints. `children(of:in:)` filters by `parentID` and sorts by `(sortOrder, slug)`; `resolve(path:in:)` walks one level at a time matching `(parentID, slug)`; `findCycle` walks ancestors collecting ids and returns the loop.

- [ ] **Step 4: Run to verify they pass**

Run: `swift test --package-path ios/LearnWithAlphonsoKit --filter PodcastTreeTests`
Expected: PASS (7 tests).

- [ ] **Step 5: Mutation-test the orphan rule**

Change `children(of:in:)` so a missing parent promotes the child to a root, re-run, and confirm `testAChildWithAMissingParentIsDroppedNotPromoted` goes RED. Restore.

- [ ] **Step 6: Commit**

```bash
git add ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/PodcastModels.swift ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/PodcastTree.swift ios/LearnWithAlphonsoKit/Tests/LearnWithAlphonsoKitTests/PodcastTreeTests.swift
git commit -m "feat(ios): port podcast models and folder-tree logic to the Kit"
```

---

### Task 2: Position clamping and audio URLs (Kit)

**Files:**
- Create: `ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/PodcastPlayback.swift`
- Test: `ios/LearnWithAlphonsoKit/Tests/LearnWithAlphonsoKitTests/PodcastPlaybackTests.swift`

**Interfaces:**
- Produces:
  - `public enum PodcastPlayback { static func clampPosition(_ position: Double, durationSeconds: Double) -> Double }`
  - `static func audioURL(supabaseURL: URL, audioPath: String) -> URL`

- [ ] **Step 1: Write the failing tests**

Ported from `src/lib/podcast.functions.test.ts`'s `clampPosition` cases, same values:

```swift
import XCTest
@testable import LearnWithAlphonsoKit

final class PodcastPlaybackTests: XCTestCase {
    func testKeepsAPositionInsideTheEpisode() {
        XCTAssertEqual(PodcastPlayback.clampPosition(42, durationSeconds: 300), 42)
    }

    func testRestartsWhenThePositionIsPastTheEnd() {
        XCTAssertEqual(PodcastPlayback.clampPosition(400, durationSeconds: 300), 0)
    }

    func testRestartsWhenThePositionIsInTheFinalSecond() {
        // Resuming at 299.6/300 replays a fraction and instantly ends --
        // indistinguishable from a broken player.
        XCTAssertEqual(PodcastPlayback.clampPosition(299.6, durationSeconds: 300), 0)
    }

    func testTreatsNegativeAndNonFiniteAsTheStart() {
        XCTAssertEqual(PodcastPlayback.clampPosition(-5, durationSeconds: 300), 0)
        XCTAssertEqual(PodcastPlayback.clampPosition(.nan, durationSeconds: 300), 0)
        XCTAssertEqual(PodcastPlayback.clampPosition(.infinity, durationSeconds: 300), 0)
    }

    func testBuildsThePublicBucketURL() {
        let base = URL(string: "https://project.supabase.co")!
        XCTAssertEqual(
            PodcastPlayback.audioURL(supabaseURL: base, audioPath: "en/a1/ordering-coffee.mp3").absoluteString,
            "https://project.supabase.co/storage/v1/object/public/podcast-audio/en/a1/ordering-coffee.mp3"
        )
    }

    func testPercentEncodesAPathSegmentThatNeedsIt() {
        let base = URL(string: "https://project.supabase.co")!
        let url = PodcastPlayback.audioURL(supabaseURL: base, audioPath: "en/a1/cafe au lait.mp3")
        XCTAssertFalse(url.absoluteString.contains(" "))
    }
}
```

- [ ] **Step 2: Run to verify they fail**

Run: `swift test --package-path ios/LearnWithAlphonsoKit --filter PodcastPlaybackTests`
Expected: FAIL — `cannot find 'PodcastPlayback' in scope`.

- [ ] **Step 3: Implement**

`clampPosition` mirrors `podcast.functions.ts` exactly, including the `duration - 1` rule; its doc comment names that file and its test file. `audioURL` appends `storage/v1/object/public/podcast-audio/` and percent-encodes each path segment.

- [ ] **Step 4: Run to verify they pass**

Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/PodcastPlayback.swift ios/LearnWithAlphonsoKit/Tests/LearnWithAlphonsoKitTests/PodcastPlaybackTests.swift
git commit -m "feat(ios): port resume clamping and audio-URL building to the Kit"
```

---

### Task 3: `PodcastClient` (Kit)

**Files:**
- Create: `ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/PodcastClient.swift`
- Test: `ios/LearnWithAlphonsoKit/Tests/LearnWithAlphonsoKitTests/PodcastClientTests.swift`

**Interfaces:**
- Consumes: `PodcastFolder`, `PodcastEpisode` (Task 1); `PodcastPlayback.clampPosition`, `.audioURL` (Task 2).
- Produces: `public final class PodcastClient: Sendable` with the same init shape as `ProgressSyncClient` (`supabaseURL`, `anonKey`, `accessToken`, `requester:` defaulting to `URLSession.shared.data(for:)`), and:
  - `func fetchFolders() async throws -> [PodcastFolder]`
  - `func fetchEpisodes(folderID: String) async throws -> [PodcastEpisode]`
  - `func savePlaybackPosition(episodeID: String, positionSeconds: Int, completed: Bool) async throws`
  - `func recordPlayEvent(episodeID: String, secondsListened: Int) async throws`
  - `public enum PodcastClientError: Error, Equatable { case badResponse, server(status: Int), invalidPayload, unauthorized }`

- [ ] **Step 1: Write the failing tests**

Follow `ProgressSyncClientTests`'s `makeClient(response:)` + `jsonResponse(for:body:status:)` helpers exactly — no real network anywhere.

```swift
func testFetchEpisodesMergesThisUsersSavedPositions() async throws {
    let client = makeClient { request in
        let url = request.url!
        if url.path.contains("podcast_episodes") {
            return self.jsonResponse(for: url, body: [[
                "id": "e1", "folder_id": "f1", "slug": "ordering-coffee",
                "title": "Ordering Coffee", "description": NSNull(),
                "audio_path": "en/a1/ordering-coffee.mp3", "duration_seconds": 300,
            ]])
        }
        return self.jsonResponse(for: url, body: [["episode_id": "e1", "position_seconds": 90]])
    }
    let episodes = try await client.fetchEpisodes(folderID: "f1")
    XCTAssertEqual(episodes.first?.positionSeconds, 90)
    XCTAssertEqual(episodes.first?.audioURL.absoluteString.hasSuffix("ordering-coffee.mp3"), true)
}

// Review Focus #5.
func testFetchEpisodesClampsAPositionPastTheEnd() async throws { /* position 400 of 300 -> 0 */ }

// A failed playback read must not fail the listing: the episodes still
// play, they just start from the beginning. Mirrors the web handler.
func testFetchEpisodesStillReturnsEpisodesWhenThePlaybackReadFails() async throws { /* 500 on playback -> episodes with 0 */ }

// Review Focus #2: a 401 must be distinguishable, not swallowed as a
// generic failure -- the caller needs to know a token refresh is the fix.
func testSurfacesUnauthorizedDistinctly() async throws { /* 401 -> PodcastClientError.unauthorized */ }

// Global Constraint: the table has no client INSERT grant.
func testRecordPlayEventCallsTheRPCRatherThanInsertingDirectly() async throws {
    let box = RequestBox()
    let client = makeClient { request in
        await box.record(request.url!)
        return self.jsonResponse(for: request.url!, body: [])
    }
    try await client.recordPlayEvent(episodeID: "e1", secondsListened: 42)
    let url = await box.last!
    XCTAssertTrue(url.path.hasSuffix("/rest/v1/rpc/record_podcast_play_event"))
    XCTAssertFalse(url.path.contains("/rest/v1/podcast_play_events"))
}

// Review Focus #3: optimistic concurrency, not magnitude and not now().
func testSavePlaybackPositionGuardsOnTheUpdatedAtItLastRead() async throws {
    let box = RequestBox()
    let client = makeClient { request in
        await box.record(request)
        return self.jsonResponse(for: request.url!, body: [["position_seconds": 90]])
    }
    try await client.savePlaybackPosition(
        episodeID: "e1", positionSeconds: 90, completed: false,
        lastSeenUpdatedAt: "2026-09-24T10:00:00Z"
    )
    let request = await box.last!
    XCTAssertEqual(request.httpMethod, "PATCH")
    XCTAssertTrue(request.url!.query!.contains("updated_at=eq.2026-09-24T10%3A00%3A00Z"))
}

// An empty representation means the filter matched nothing: another
// device wrote since we last read. Must be distinguishable so the
// player re-reads instead of retrying a write that cannot land.
func testReportsAStaleWriteWhenAnotherDeviceHasWrittenSince() async throws {
    let client = makeClient { request in self.jsonResponse(for: request.url!, body: []) }
    do {
        try await client.savePlaybackPosition(
            episodeID: "e1", positionSeconds: 90, completed: false,
            lastSeenUpdatedAt: "2026-09-24T10:00:00Z"
        )
        XCTFail("expected a stale-write error")
    } catch {
        XCTAssertEqual(error as? PodcastClientError, .staleWrite)
    }
}

// A rewind is a fresh observation, so it must be accepted -- this is the
// case a magnitude guard would wrongly reject.
func testAcceptsARewindToAnEarlierPosition() async throws {
    let box = RequestBox()
    let client = makeClient { request in
        await box.record(request)
        return self.jsonResponse(for: request.url!, body: [["position_seconds": 30]])
    }
    try await client.savePlaybackPosition(
        episodeID: "e1", positionSeconds: 30, completed: false,
        lastSeenUpdatedAt: "2026-09-24T10:00:00Z"
    )
    let body = try JSONSerialization.jsonObject(with: await box.last!.httpBody!) as! [String: Any]
    XCTAssertEqual(body["position_seconds"] as? Int, 30)
}

// No row yet: POST rather than a PATCH that would match nothing.
func testPostsWhenThereIsNoExistingPlaybackRow() async throws {
    let box = RequestBox()
    let client = makeClient { request in
        await box.record(request)
        return self.jsonResponse(for: request.url!, body: [["position_seconds": 5]])
    }
    try await client.savePlaybackPosition(
        episodeID: "e1", positionSeconds: 5, completed: false, lastSeenUpdatedAt: nil
    )
    XCTAssertEqual(await box.last!.httpMethod, "POST")
}
```

- [ ] **Step 2: Run to verify they fail**

Run: `swift test --package-path ios/LearnWithAlphonsoKit --filter PodcastClientTests`
Expected: FAIL — `cannot find 'PodcastClient' in scope`.

- [ ] **Step 3: Implement**

Mirror `ProgressSyncClient`'s request construction exactly: `apikey` header from `anonKey`, `Authorization: Bearer \(accessToken)`, `Content-Type: application/json`, and a shared `requireSuccess(data:response:)` that maps **401 to `.unauthorized`** and other non-2xx to `.server(status:)`.

Two Review Focus items are resolved here, and both need a decision recorded in the code:

- **Token expiry (Focus #2):** the client cannot refresh a token it was handed. It surfaces `.unauthorized` distinctly so the app layer can stop pretending the save succeeded. The app layer's response is Task 4: stop issuing position saves for the rest of the session and let the next launch (which builds a client from a fresh token, as `RootView.triggerSync` already does) recover. Silently swallowing 401 is what makes resume mysteriously stop working.
- **Backwards resume (Focus #3): optimistic concurrency on `updated_at`.** Do **not** guard on position magnitude and do **not** guard on `now()`. Magnitude fixes the stale phone but breaks deliberate rewind — a learner scrubbing back to 0:30 gets snapped forward. `now()` is evaluated at write time, so the stale flush is the newest write and the guard accepts exactly what it should reject. What separates them is *observation* recency.

  So: `savePlaybackPosition(episodeID:positionSeconds:completed:lastSeenUpdatedAt:)` issues a PATCH filtered on `updated_at=eq.<lastSeenUpdatedAt>` with `Prefer: return=representation`, and sets `updated_at` to `now()` in the body. An empty response body means the filter matched nothing — another device has written since this one last read — which surfaces as `PodcastClientError.staleWrite` rather than being retried blindly. When `lastSeenUpdatedAt` is nil (no row yet) it POSTs instead, and treats a unique-violation as the same stale case.

  `fetchEpisodes` must therefore select `updated_at` from `podcast_playback` and carry it on the episode, so the player has something to send back.

- [ ] **Step 4: Run to verify they pass**

Run: `swift test --package-path ios/LearnWithAlphonsoKit --filter PodcastClientTests`
Expected: PASS.

- [ ] **Step 5: Run the whole Kit suite**

Run: `swift test --package-path ios/LearnWithAlphonsoKit`
Expected: all previous tests plus the new ones, 0 failures. Nothing else running concurrently.

- [ ] **Step 6: Commit**

```bash
git add ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/PodcastClient.swift ios/LearnWithAlphonsoKit/Tests/LearnWithAlphonsoKitTests/PodcastClientTests.swift
git commit -m "feat(ios): add PodcastClient with the play-event RPC and resume guards"
```

---

### Task 4: The audio player (app target)

**Files:**
- Create: `ios/LearnWithAlphonso/Sources/PodcastAudioPlayer.swift`
- Modify: `ios/LearnWithAlphonso/Info.plist`

**No unit tests exist for this file and none can be added** — see "Where verification actually stands". Compile checking is CI's `xcodebuild`; everything else is the device pass.

- [ ] **Step 1: Add the background mode**

`ios/LearnWithAlphonso/Info.plist` gains:

```xml
<key>UIBackgroundModes</key>
<array>
  <string>audio</string>
</array>
```

App Store review-visible. Expect a reviewer to check background audio is genuinely used.

- [ ] **Step 2: Write the player**

An `@Observable` final class owning one `AVPlayer`, exposing `episode`, `isPlaying`, `elapsedSeconds`, `failed`, and `play(_:)`, `toggle()`, `close()`. It is held once at app level (see Task 6), so playback survives view changes — unlike the web, where an element in the view tree unmounts.

Required behaviour, each of which is a device check:

- **Audio session policy (Review Focus #1).** Set `.playback` when playback starts. The mic screens (`SpeakQuestionCard`, `ConversationView`, `HectorView`, `CampaignView`) set `.playAndRecord` for their own work. Policy: when another screen takes the session for recording, this player **pauses** and does not auto-resume; the learner restarts it deliberately. Auto-resuming into a speaking exercise would talk over the learner. Do not attempt to share the session between podcast playback and recording.
- **Interruptions, by type.** Observe `AVAudioSession.interruptionNotification`: pause on `.began`. On `.ended`, **honour `.shouldResume`** — iOS supplies it precisely to mark a call, alarm or Siri, and never resuming makes a podcast silently die after a phone call, which reads as a bug. **Suppress resume only for the in-app mic case**, detected by an app-level `isRecording` flag the mic screens set (`SpeakQuestionCard`, `ConversationView`, `HectorView`, `CampaignView`), not by guessing from the notification. Resuming over someone mid-speaking-exercise is the failure to avoid.
- **Route changes.** Observe `routeChangeNotification`: on `.oldDeviceUnavailable` (headphones pulled), pause rather than continuing out of the speaker.
- **Now Playing.** `MPNowPlayingInfoCenter` title and elapsed/duration; `MPRemoteCommandCenter` play, pause, and ±15s skip.
- **Position saves.** Periodic time observer, throttled to ~10s, plus on pause and on `scenePhase` background. Use the absolute difference, not a bare subtraction — after a backward skip a plain subtraction stays negative and silently stops saving.
- **Resume (Review Focus #5).** Seek to `PodcastPlayback.clampPosition(saved, durationSeconds:)` **measured against the item's real duration**, not the stored `duration_seconds`; the chunk-join probe is unrun and the row can disagree with the file.
- **Unauthorized (Review Focus #2).** When a save returns `.unauthorized`, stop issuing saves for the rest of the session and record that it happened. Do not keep firing calls that cannot succeed, and do not pretend they did.

- [ ] **Step 3: Verify it compiles in CI**

Push and read `ios-app-build`. It cannot be compiled locally — there is no macOS or Xcode here.

- [ ] **Step 4: Commit**

```bash
git add ios/LearnWithAlphonso/Sources/PodcastAudioPlayer.swift ios/LearnWithAlphonso/Info.plist
git commit -m "feat(ios): add the podcast audio player with background playback"
```

---

### Task 5: `ListenView`

**Files:**
- Modify: `ios/LearnWithAlphonso/Sources/ListenView.swift` (replaces the placeholder)

- [ ] **Step 1: Build the browser**

`ListenView` owns the `NavigationStack` and pushes a `PodcastFolderView` per level, driven by `PodcastTree.children(of:in:)`. **`PodcastFolderView` must not own a `NavigationStack`** — nesting is what forced Phase 0's hub to present rather than push, and here the child is new code so the constraint is free.

Folders fetch once at the top (`fetchFolders`) and are passed down; episodes fetch per folder on appear. Tapping an episode calls `player.play(_:)`.

States, all of which are ordinary and must look deliberate:

- **Loading** — a real progress indicator, not an empty list.
- **Empty folder** — says so; expected, since the tree is built before it is filled.
- **Offline** — consult `NetworkMonitor` and say *that*, rather than blaming the episode. Listen is online-only until Phase 3 adds download, and a subway is exactly where people listen.
- **Failed fetch** — an error with a retry.

- [ ] **Step 2: Commit**

```bash
git add ios/LearnWithAlphonso/Sources/ListenView.swift
git commit -m "feat(ios): browse the podcast folder tree and play episodes"
```

---

### Task 6: The mini-player bar

**Files:**
- Modify: `ios/LearnWithAlphonso/Sources/RootView.swift`
- Create: `ios/LearnWithAlphonso/Sources/PodcastMiniBar.swift`

- [ ] **Step 1: Own the player at app level**

`RootView` holds the single `PodcastAudioPlayer` and passes it to `ListenView`. It is a reference type above the view tree, so audio is unaffected by any view coming and going.

- [ ] **Step 2: Attach the bar**

Render `PodcastMiniBar` via `.safeAreaInset(edge: .bottom)` on the `TabView` so it sits above the tab bar without overlapping content or being overlapped by it. It renders nothing when no episode is loaded.

**Decide and record what happens outside the tab roots.** The lesson player, review queue and the four Profile sheets are presented over the tabs. The bar will not follow them, and that is the intended behaviour — a control bar floating over a lesson would be worse — but it must be a decision in the ledger and a line in the device checks, not something discovered on a screen.

- [ ] **Step 3: Commit**

```bash
git add ios/LearnWithAlphonso/Sources/RootView.swift ios/LearnWithAlphonso/Sources/PodcastMiniBar.swift
git commit -m "feat(ios): keep a podcast mini-player above the tab bar"
```

---

### Task 7: Documentation and the device gate

**Files:**
- Modify: `README.md`, `ARCHITECTURE.md`, `CHANGELOG.md`, `AGENTS.md`
- Modify: `docs/superpowers/specs/2026-09-24-podcast-phase1b-ios-design.md`

- [ ] **Step 1: Update the docs**

Record that iOS now fetches content from the server for the first time, the audio-session policy (podcast pauses for the mic screens and does not auto-resume), the background-mode capability, and that **the Phase 0/1b release constraint is now lifted** — Listen is real.

- [ ] **Step 2: Write the device checks into the PR**

CI green means it compiles. On top of Phase 0's six checks:

1. An episode plays and keeps playing with the screen locked.
2. Lock-screen and Control Center show the right title and the controls work.
3. Resume works within iOS, and across to web on the same account — and **a stale device must not drag the position backwards**.
4. A phone call pauses it. Unplugging headphones pauses it.
5. Starting a speaking exercise while a podcast plays pauses the podcast cleanly, and returning does not auto-resume over the learner.
6. Airplane mode gives an honest offline message, not a stuck spinner.
7. The mini-bar sits above the tab bar without overlap, and its absence over lessons/sheets looks deliberate.

**Verification needs content that does not exist yet.** Publish at least one real episode with `scripts/podcast-tool.ts` first — and if it is TTS, run the chunk-join probe before trusting its duration, since a wrong `duration_seconds` is exactly what the media-duration clamp would be hiding.

- [ ] **Step 3: Commit**

```bash
git add README.md ARCHITECTURE.md CHANGELOG.md AGENTS.md docs/superpowers/specs/2026-09-24-podcast-phase1b-ios-design.md
git commit -m "docs(ios): document the Listen client and lift the release constraint"
```
