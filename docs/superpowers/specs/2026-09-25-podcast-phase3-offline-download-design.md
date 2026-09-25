# Podcast library Phase 3 — offline download

**Date:** 2026-09-25
**Status:** design proposed, not yet approved
**Branch:** `worktree-podcast-offline-spec`
**Follows:** Phase 1b (`2026-09-24-podcast-phase1b-ios-design.md`), Phase 2a (transcripts)

## Purpose

Let a learner keep episodes on the device and play them with no signal.

Listen is the only online-only surface in an otherwise offline-first app:
lessons, review and completions all work on a plane. Podcasts are what
people play *with* no signal — on a train, a run, a flight — so the gap
is not merely an inconsistency, it is the feature failing exactly where
it is most wanted.

### Success criteria

- A learner downloads an episode, goes into airplane mode, and plays it
  from the Listen tab.
- Downloaded episodes are browsable offline, not only playable — check
  #11 in the device list is still untested for a reason.
- The device does not fill up silently.
- A download that is interrupted resumes or restarts cleanly; it never
  leaves a half-file that plays as a truncated episode.

### Non-goals

Background/queued downloading of a whole folder, cellular-vs-WiFi
policy, and any sync of "what I downloaded" across devices. Each is a
real feature and none is needed to close the offline gap.

## Where verification can and cannot reach

This shapes the design, so it comes first.

- **`ios-swift-tests` runs the Kit's XCTest suite in CI.** That is the
  only automated test coverage available to any of this work.
- **`ios-app-build` compiles the app target and runs no tests.**
- **`swift.exe` is blocked by an Application Control policy on the
  development machine**, so there is no local Swift build or test either
  — the Kit's tests are written blind and verified by CI.
- No automated check anywhere can see layout, disk behaviour, or what
  happens with the network actually off.

**Therefore: every decision goes in `LearnWithAlphonsoKit`, and only
wiring stays in the app target.** Concretely, the Kit owns the eviction
policy, the partial-file rules, the cached-duration reconciliation and
the path/state model; the app target owns `URLSession` calls, file moves
and SwiftUI. This is not tidiness — it is the difference between logic
that CI can prove and logic nobody can check until a device says so.

## The four questions

### 1. What a republish does to a downloaded episode

An episode's audio can be replaced under a path that has not changed
(`podcast-tool add` uses `upsert: false`, but an object can be replaced
by hand, and re-recording an episode is a normal thing to want).

A cached file therefore needs an identity beyond its path. The download
records the object's **`ETag` and `Content-Length`** as served, alongside
the episode id. On a later online listing, a mismatch means the cached
copy is stale: it is evicted and re-downloaded, rather than played.

Offline, a stale cache cannot be detected — and that is acceptable and
must be stated: with no network there is nothing to compare against, and
a slightly old episode is better than no episode. The staleness check
happens at the first opportunity, not before playback.

### 2. Partial files

A download that dies mid-flight must never be playable. Two rules:

- Download to a **temporary path**, then move into place atomically.
  A file only exists at its final path if it is complete.
- Record the expected byte count first, and **verify the completed file's
  size matches** before the move. A truncated transfer that still
  produced a well-formed MP3 would otherwise play as a shortened episode
  — which is the same "plausible but wrong" failure as a bad
  `duration_seconds`.

Resumable downloads (HTTP range requests) are **out of scope**: a
restart is cheap at 3 MB, and resume logic that is wrong produces
exactly the corrupt file this is trying to prevent.

### 3. Eviction

A library of 3 MB episodes is small until it is not. Policy:

- A **cache budget** (default 500 MB) over downloaded audio.
- Eviction is **least-recently-played**, not least-recently-downloaded:
  the thing someone downloaded and has been re-listening to is the last
  thing to remove.
- **An explicitly downloaded episode is never evicted automatically.**
  If the budget cannot be met without touching one, the download is
  refused with a clear message, rather than silently dropping something
  the learner asked to keep. Deliberate downloads are a promise.
- The learner can delete a download, and can see how much space the
  library is using.

The policy is a pure function in the Kit — given a set of cached
episodes with sizes and last-played dates, and a budget, return what to
evict — so it is testable without a filesystem.

### 4. A cached duration that disagrees with `duration_seconds`

The sharpest question, and it is the resume trap with a second source of
truth.

Today `PodcastAudioPlayer` clamps a resume position against the **media
item's** duration rather than the stored `duration_seconds`, precisely
because the row can be wrong. With a cached file, "the media" is now the
local copy, so:

- The clamp continues to use whatever `AVPlayerItem` reports, which for a
  cached episode is the local file. That stays correct by construction:
  the position is being applied to *that* asset.
- A **disagreement between the cached file's duration and the stored
  `duration_seconds` is recorded, not silently tolerated.** If they
  differ by more than a second, the cached copy is treated as suspect and
  re-downloaded when online. A file whose length does not match the
  catalogue is the signature of both a truncated download and a
  republished episode.
- The **scrubber's total** comes from the media, not the row, so the UI
  cannot show a length the file does not have.

## Shape

### In the Kit (tested)

| Type | Responsibility |
| --- | --- |
| `PodcastDownloadState` | `notDownloaded` / `downloading(progress:)` / `downloaded(bytes:)` / `failed(reason:)` |
| `PodcastCacheEntry` | episode id, byte count, `ETag`, stored duration, last played, explicit-download flag |
| `PodcastCachePolicy` | `evictions(for:budget:)` — pure LRU-by-last-played, never evicts explicit downloads |
| `PodcastCachePaths` | filename derivation from episode id; temp-vs-final path rules |
| `PodcastCacheValidation` | `isStale(entry:against:)` (ETag/size), `durationDisagrees(cached:stored:)` |

### In the app target (compile-checked only)

- `PodcastDownloadManager` — `URLSession` download tasks, the atomic
  move, and writing cache entries through `SyncQueueStore`'s existing
  SwiftData container (the app already has one; a second store would be
  a second thing to migrate).
- Download/delete affordances on the episode row and in the player.
- A "Downloaded" filter on the Listen tab, which is what makes offline
  *browsing* work rather than only offline playback.

### Offline browsing

`fetchFolders`/`fetchEpisodes` currently require the network. Offline,
the Listen tab shows the **downloaded set** from the local cache,
labelled as such, rather than an error. That is the difference between
"the app works on a plane" and "the audio happens to still play".

## Constraints

- Canopy is the iOS default; theme tokens only.
- No migration. This is entirely device-local: nothing about what a
  learner downloaded belongs on the server in this phase.
- The audio bucket is public-read, so a download is a plain GET with no
  signed-URL expiry to manage — one of the few places that decision pays
  off rather than costing.

## Device checks this adds

CI cannot see any of these.

1. Download an episode; airplane mode; play it from Listen.
2. Airplane mode with nothing downloaded: honest message, not a spinner.
3. Airplane mode **browsing** — the downloaded set is listed (device
   check #11, still untested from Phase 1b).
4. Kill the app mid-download, relaunch: no half-file, no phantom
   "downloaded" state.
5. Delete a download; confirm the space is returned and the episode
   still plays online.
6. Play a downloaded episode, then check resume still works across a
   relaunch and against web.

## Open questions

1. **Budget default.** 500 MB is a guess — roughly 170 episodes at 3 MB.
   Worth revisiting once there is more than one episode.
2. **Whether to auto-download the next episode in a folder.** Tempting
   and out of scope; it spends someone's cellular data on a prediction.
