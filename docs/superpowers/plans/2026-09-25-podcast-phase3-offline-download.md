# Podcast Phase 3 — Offline Download Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a learner download episodes and play *and browse* them with no signal.

**Architecture:** Every decision lives in `LearnWithAlphonsoKit` — cache paths, staleness, size accounting, the offline listing — because `ios-swift-tests` is the only automated coverage available. The app target holds `URLSession` wiring, file moves, SwiftData persistence and SwiftUI, none of which any test can reach.

**Spec:** `docs/superpowers/specs/2026-09-25-podcast-phase3-offline-download-design.md`

## Where verification reaches, and where it stops

- **Kit (`ios-swift-tests`)**: real tests, run in CI. Everything with a decision in it belongs here.
- **App target (`ios-app-build`)**: compiles only. No tests exist or can be added.
- **This machine**: `swift.exe` is blocked by an Application Control policy, so the Kit tests are **written blind and first verified by CI**. Expect a round trip on compile errors; push early rather than batching.
- **Nothing automated** can see layout, disk behaviour, or the network being off.

## Global Constraints

- Canopy is the iOS default. Theme tokens only, never fixed colours.
- Kit code carries no `import SwiftUI`, no `URLSession` calls, no filesystem writes. If a type needs any of those, it is in the wrong target.
- Each ported or mirrored rule names its web counterpart and that file's tests, as `PodcastSearch` and `PodcastTranscript` already do.
- **No migration in this phase** — unless Task 0 says otherwise, in which case stop and amend the spec rather than inventing one mid-plan. Any migration must sort after `20260927230000_podcast_transcripts.sql`.
- The web suite is run chunked and reconciled against the file count: this machine has ~0.8 GB free RAM and a single full run silently drops files while printing a green summary.

## Review Focus

1. **A staleness check that can never fire** — if Supabase serves no stable `ETag`, republish detection silently never triggers and a stale episode plays forever. *(Task 0, then Task 2)*
2. **A half-written file that plays as a shortened episode** — the same "plausible but wrong" failure as a bad `duration_seconds`. *(Task 3)*
3. **Deleting or replacing a file under a playing `AVPlayer`** — plausible, and likely to misbehave silently. *(Task 5, device check)*
4. **Offline browsing that strands the learner** — a flat downloaded list with no way back to the tree when connectivity returns. *(Task 4)*
5. **Downloads filling the device** — with no automatic downloads, nothing is evictable, so the budget must be a *refusal with a choice*, never silent deletion. *(Task 2)*

---

### Task 0: Probe what the storage layer actually serves

**No code. Answer three questions before anything depends on them.** The spec asserts `ETag`; this checks it.

- [ ] **Step 1: Inspect the live object's headers**

```bash
curl -sSI "https://<project>.supabase.co/storage/v1/object/public/podcast-audio/en/a1/ordering-coffee.mp3"
```

Record: is there an `ETag`? Is it stable across two requests? Is `Content-Length` present? Is `Accept-Ranges` advertised?

- [ ] **Step 2: Re-upload the same object and re-check**

Replace the object with `podcast-tool` (or by hand) and compare the `ETag`. **If the ETag does not change on a republish, it cannot detect one** and the design needs a server-side marker instead — which means a migration, which means stopping and amending the spec rather than improvising.

- [ ] **Step 3: Check whether URLSession can even deliver a truncated file**

`URLSessionDownloadTask` delivers a complete file or an error. If the byte-count verification in Task 3 is protecting against something that cannot happen, say so and keep it only if it costs nothing — ceremony that reads as rigour is worse than no check, because it invites trust.

- [ ] **Step 4: Record all three answers in the spec's "Open questions"**

Whichever way they fall, they are now facts rather than assumptions. If Step 2 says a migration is needed, **stop here and amend the spec.**

---

### Task 1: Cache paths and state (Kit)

**Files:**
- Create: `ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/PodcastCache.swift`
- Test: `ios/LearnWithAlphonsoKit/Tests/LearnWithAlphonsoKitTests/PodcastCacheTests.swift`

**Interfaces:**
- Produces:
  - `public enum PodcastDownloadState: Sendable, Equatable { case notDownloaded, downloading(progress: Double), downloaded(bytes: Int), failed(reason: String) }`
  - `public enum PodcastCache { static func fileName(episodeID: String) -> String; static func temporaryFileName(episodeID: String) -> String }`

- [ ] **Step 1: Write the failing tests**

```swift
import XCTest
@testable import LearnWithAlphonsoKit

final class PodcastCacheTests: XCTestCase {
    func testFileNameIsDerivedFromTheEpisodeID() {
        // Keyed by id, not by slug or title: a republished episode keeps its
        // id, and a renamed one must not orphan its own cached file.
        let name = PodcastCache.fileName(episodeID: "11111111-1111-1111-1111-111111111111")
        XCTAssertTrue(name.hasSuffix(".mp3"))
        XCTAssertTrue(name.contains("11111111-1111-1111-1111-111111111111"))
    }

    func testFileNameContainsNoPathSeparators() {
        // An episode id comes from the server. Treating it as a path
        // component without checking is how a "../" ends up escaping the
        // cache directory.
        let name = PodcastCache.fileName(episodeID: "../../etc/passwd")
        XCTAssertFalse(name.contains("/"))
        XCTAssertFalse(name.contains(".."))
    }

    func testTemporaryNameDiffersFromTheFinalName() {
        // A file exists at its final path only when it is complete, so the
        // two must never collide.
        let id = "abc"
        XCTAssertNotEqual(PodcastCache.fileName(episodeID: id), PodcastCache.temporaryFileName(episodeID: id))
    }

    func testDownloadStateIsEquatableForViewUpdates() {
        XCTAssertEqual(PodcastDownloadState.downloading(progress: 0.5), .downloading(progress: 0.5))
        XCTAssertNotEqual(PodcastDownloadState.notDownloaded, .downloaded(bytes: 1))
    }
}
```

- [ ] **Step 2: Push and read CI**

`swift.exe` is blocked locally, so `ios-swift-tests` failing with "cannot find 'PodcastCache'" **is** the RED step. Do not skip it — it is the only proof the test runs at all.

- [ ] **Step 3: Implement, sanitising the id**

Percent-encode or reject anything that is not hex-and-dashes. The traversal test above must pass for the right reason, not because UUIDs happen to be safe.

- [ ] **Step 4: Push and read CI for GREEN**

- [ ] **Step 5: Commit**

```bash
git add ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/PodcastCache.swift ios/LearnWithAlphonsoKit/Tests/LearnWithAlphonsoKitTests/PodcastCacheTests.swift
git commit -m "feat(ios): add podcast cache paths and download state"
```

---

### Task 2: Budget and staleness (Kit)

**Files:**
- Modify: `ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/PodcastCache.swift`
- Modify: `ios/LearnWithAlphonsoKit/Tests/LearnWithAlphonsoKitTests/PodcastCacheTests.swift`

**Interfaces:**
- Produces:
  - `public struct PodcastCacheEntry: Sendable, Equatable { episodeID, bytes, etag: String?, storedDurationSeconds: Int, lastPlayed: Date? }`
  - `public enum PodcastCacheBudget { static func canAdd(bytes:to:budget:) -> Bool; static func deletionCandidates(in:needing:budget:) -> [PodcastCacheEntry] }`
  - `static func isStale(entry: PodcastCacheEntry, servedETag: String?, servedBytes: Int?) -> Bool`
  - `static func durationDisagrees(cachedSeconds: Double, storedSeconds: Int) -> Bool`

**The spec's eviction policy was unreachable and is replaced here.** It said explicit downloads are never auto-evicted — and made auto-download a non-goal, so *every* download is explicit and nothing was ever evictable. Dead code that looks like safety is worse than none. So: **nothing is ever deleted automatically.** When a download would exceed the budget, the app refuses and offers the learner the least-recently-played candidates to remove. `deletionCandidates` ranks suggestions; it does not authorise deletion.

- [ ] **Step 1: Write the failing tests**

```swift
// Review Focus #5.
func testAllowsADownloadThatFitsTheBudget() {
    let entries = [entry(bytes: 100)]
    XCTAssertTrue(PodcastCacheBudget.canAdd(bytes: 50, to: entries, budget: 200))
}

func testRefusesADownloadThatWouldExceedTheBudget() {
    let entries = [entry(bytes: 180)]
    XCTAssertFalse(PodcastCacheBudget.canAdd(bytes: 50, to: entries, budget: 200))
}

func testSuggestsTheLeastRecentlyPlayedFirst() {
    // Least recently PLAYED, not downloaded: the episode someone keeps
    // returning to is the last thing to propose removing.
    let old = entry(id: "old", bytes: 100, lastPlayed: .distantPast)
    let fresh = entry(id: "fresh", bytes: 100, lastPlayed: Date())
    let candidates = PodcastCacheBudget.deletionCandidates(in: [fresh, old], needing: 50, budget: 200)
    XCTAssertEqual(candidates.first?.episodeID, "old")
}

func testSuggestsOnlyAsManyAsAreNeeded() {
    // A prompt offering to delete everything when one file would do reads
    // as the app losing its temper.
    let candidates = PodcastCacheBudget.deletionCandidates(
        in: [entry(id: "a", bytes: 100), entry(id: "b", bytes: 100)], needing: 60, budget: 150
    )
    XCTAssertEqual(candidates.count, 1)
}

func testANeverPlayedDownloadIsOfferedBeforeAPlayedOne() {
    let neverPlayed = entry(id: "never", bytes: 100, lastPlayed: nil)
    let played = entry(id: "played", bytes: 100, lastPlayed: Date())
    XCTAssertEqual(
        PodcastCacheBudget.deletionCandidates(in: [played, neverPlayed], needing: 50, budget: 150).first?.episodeID,
        "never"
    )
}

// Review Focus #1 -- and see Task 0. If the probe showed the ETag does not
// change on republish, these tests are asserting a guard that cannot fire,
// and the spec must be amended before they are written.
func testDetectsAReplacedObjectByETag() {
    XCTAssertTrue(PodcastCache.isStale(entry: entry(etag: "v1"), servedETag: "v2", servedBytes: nil))
}

func testDetectsAReplacedObjectByByteCountWhenNoETagIsServed() {
    XCTAssertTrue(PodcastCache.isStale(entry: entry(bytes: 100, etag: nil), servedETag: nil, servedBytes: 200))
}

func testIsNotStaleWhenNothingIsKnown() {
    // Offline there is nothing to compare against, and a slightly old
    // episode beats no episode. Never evict on ignorance.
    XCTAssertFalse(PodcastCache.isStale(entry: entry(etag: "v1"), servedETag: nil, servedBytes: nil))
}

// Review Focus #2's sibling: a length that disagrees with the catalogue is
// the signature of BOTH a truncated download and a republished episode.
func testFlagsADurationThatDisagreesWithTheCatalogue() {
    XCTAssertTrue(PodcastCache.durationDisagrees(cachedSeconds: 40, storedSeconds: 172))
}

func testToleratesSubSecondRoundingBetweenTheFileAndTheRow() {
    XCTAssertFalse(PodcastCache.durationDisagrees(cachedSeconds: 171.6, storedSeconds: 172))
}
```

- [ ] **Step 2: Push, read CI for RED**

- [ ] **Step 3: Implement**

- [ ] **Step 4: Push, read CI for GREEN**

- [ ] **Step 5: Mutation-test the two guards that matter**

Break `isStale` to always return `false`, confirm the ETag and byte-count tests go red. Break `deletionCandidates` to return everything, confirm `testSuggestsOnlyAsManyAsAreNeeded` goes red. Restore. **Break each property separately** — one mutation proves one axis.

- [ ] **Step 6: Commit**

---

### Task 3: The download manager (app target)

**Files:**
- Create: `ios/LearnWithAlphonso/Sources/PodcastDownloadManager.swift`
- Modify: `ios/LearnWithAlphonso/Sources/SyncQueueStore.swift` (a `@Model` for cache entries, alongside the existing four)

**No tests are possible here.** Keep it thin: every decision is a Kit call.

- [ ] **Step 1: Write the manager**

Required behaviour:

- Store under **Application Support**, not Caches (the system may purge Caches under pressure, and a download the learner asked for should not evaporate), in a `podcast-audio/` subdirectory.
- **Set `isExcludedFromBackup` on the directory.** Downloaded audio is re-downloadable content; iOS expects it excluded from iCloud backup and Apple has rejected apps for exactly this. Missing from the spec; it is an App Store review-visible property like `UIBackgroundModes`.
- `URLSessionDownloadTask` to a temporary location, then verify per Task 0 Step 3's finding, then **move atomically** into the final path. A file exists at its final path only if it is complete.
- Write the `PodcastCacheEntry` **after** the move succeeds, never before — a phantom "downloaded" row pointing at no file is worse than no row.
- On relaunch, reconcile: any entry whose file is missing is deleted, any file with no entry is deleted. Kill-the-app-mid-download is a normal event, not an exception.
- Refuse a download that `PodcastCacheBudget.canAdd` rejects, surfacing `deletionCandidates` as a choice. **Never delete anything the learner did not choose.**

- [ ] **Step 2: Push; confirm `ios-app-build` compiles**

- [ ] **Step 3: Commit**

---

### Task 4: Offline browsing (Kit + app target)

**Files:**
- Modify: `ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/PodcastCache.swift`
- Modify: `ios/LearnWithAlphonso/Sources/ListenView.swift`

The spec gave this one sentence — "show the downloaded set" — which is not a design. Listen is a *folder tree*; a flat list is a different information architecture.

**Interfaces:**
- Produces: `static func offlineListing(entries: [PodcastCacheEntry], episodes: [PodcastEpisode]) -> [PodcastEpisode]`

- [ ] **Step 1: Write the failing tests**

```swift
func testOfflineListingKeepsOnlyDownloadedEpisodes() { /* … */ }

func testOfflineListingIsOrderedByTitleNotByFolder() {
    // Flat on purpose: folders are a browsing aid for a library you can
    // see all of, and offline you can only see what you downloaded.
}

func testOfflineListingIsEmptyWhenNothingIsDownloaded() {
    // Distinct from "offline with downloads" -- the UI says different
    // things, and saying "no episodes" to someone who downloaded three
    // would be a lie about their own device.
}
```

- [ ] **Step 2: Push, read CI for RED, implement, push for GREEN**

- [ ] **Step 3: Wire the Listen tab**

Offline, the tab shows the flat downloaded listing with an explicit banner ("Offline — showing your downloads"), **not** an error and not an empty tree. When connectivity returns, the tree comes back; the banner is the affordance that explains why the shape changed. Nothing downloaded and offline is its own state, distinct from the above.

- [ ] **Step 4: Commit**

---

### Task 5: Download affordances and playback interaction (app target)

**Files:**
- Modify: `ios/LearnWithAlphonso/Sources/ListenView.swift`, `ios/LearnWithAlphonso/Sources/PodcastMiniBar.swift`

- [ ] **Step 1: Add download/delete controls**

A download affordance on the episode row showing `PodcastDownloadState`, and delete on a downloaded one. Theme tokens only.

- [ ] **Step 2: Handle deletion during playback (Review Focus #3)**

Deleting the file under a playing `AVPlayer` is plausible and likely to misbehave. Policy: **deleting the episode that is currently playing stops playback first**, then deletes, then reports it plainly. Silently continuing from a deleted file, or stalling with no explanation, are both worse than a clear stop.

- [ ] **Step 3: Push; confirm compilation**

- [ ] **Step 4: Commit**

---

### Task 6: Documentation and the device gate

- [ ] **Step 1: Update `README.md`, `ARCHITECTURE.md`, `CHANGELOG.md`, `AGENTS.md`**

Record the Application Support location and backup exclusion, that nothing is ever auto-deleted, and that offline browsing is a deliberately flat listing.

- [ ] **Step 2: Write the device checks into the PR**

CI proves the Kit's logic and that the app compiles. Everything below is unverifiable without hardware:

1. Download an episode; airplane mode; play it from Listen.
2. Airplane mode, nothing downloaded: honest message, not a spinner.
3. Airplane mode **browsing** — the downloaded set is listed (this is device check #11 from Phase 1b, still untested).
4. Kill the app mid-download, relaunch: no half-file, no phantom "downloaded" state.
5. Delete a download **while it is playing**: playback stops cleanly and says why.
6. Fill the budget: the refusal names what could be removed and deletes nothing on its own.
7. Resume still works for a downloaded episode across a relaunch, and against web.

- [ ] **Step 3: Commit**
