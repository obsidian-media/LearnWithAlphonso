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

A cached file therefore needs an identity beyond its path. The intended
mechanism records the object's **`ETag` and `Content-Length`** as served,
alongside the episode id; on a later online listing, a mismatch means the
cached copy is stale and is re-downloaded rather than played.

**This is unverified and the plan probes it first.** Nobody has checked
that Supabase's storage CDN serves a stable `ETag`, or that it changes
when an object is replaced. If it does not, the staleness check can never
fire — a guard that cannot fail, which is the failure class this project
has spent days on. In that case the honest fix is a server-side marker
(a checksum or `audio_updated_at` the CLI writes on upload), which means
a migration, which contradicts the "no migration" constraint below. That
contradiction is real and is resolved by measuring, not by choosing in
advance.

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
  — the same "plausible but wrong" failure as a bad `duration_seconds`.

  Also unverified: `URLSessionDownloadTask` delivers a complete file or
  an error, so this check may be guarding something that cannot happen.
  The plan measures rather than assuming. A check that cannot fail is
  not free — it reads as rigour and invites trust it has not earned.

Resumable downloads (HTTP range requests) are **out of scope**: a
restart is cheap at 3 MB, and resume logic that is wrong produces
exactly the corrupt file this is trying to prevent.

### 3. Eviction

A library of 3 MB episodes is small until it is not. Policy:

**Corrected after self-critique — the first version was unreachable.**
It said explicitly downloaded episodes are never auto-evicted, while
making auto-download a non-goal: so every download is explicit, nothing
is ever evictable, and the policy was dead code that looked like safety.

So: **nothing is ever deleted automatically.**

- A **cache budget** (default 500 MB) over downloaded audio.
- When a download would exceed it, the app **refuses and offers** the
  least-recently-played candidates to remove. The learner chooses.
- Ranking is by least-recently-**played**, not downloaded: the episode
  someone keeps returning to is the last thing to propose removing. A
  never-played download is offered before a played one.
- Only as many candidates as are needed are offered. A prompt proposing
  to delete everything when one file would do reads as the app losing
  its temper.
- The learner can delete a download directly, and can see how much space
  the library uses.

The ranking is a pure function in the Kit — given cached episodes with
sizes and last-played dates, and a budget, return what to *offer* — so it
is testable without a filesystem, which matters more than usual here
since the Kit is the only place CI can see.

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
| `PodcastCacheEntry` | episode id, byte count, `ETag`, stored duration, last played |
| `PodcastCacheBudget` | `canAdd(bytes:to:budget:)` and `deletionCandidates(in:needing:budget:)` — ranks suggestions, authorises nothing |
| `PodcastCache` | filename derivation from an episode id (path-traversal safe); temp-vs-final path rules |
| `PodcastCache.isStale` / `.durationDisagrees` | republish detection and catalogue/file length mismatch |
| `PodcastCache.offlineListing` | the flat downloaded set shown with no network |

No `explicit-download flag`: with auto-download out of scope every
download is explicit, so the flag would partition nothing.

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
the Listen tab shows the **downloaded set** from the local cache rather
than an error. That is the difference between "the app works on a plane"
and "the audio happens to still play".

Listen is a folder *tree*, so this is a different information
architecture, not a filter — and saying so is the part the first draft
skipped. The offline listing is deliberately **flat and title-ordered**:
folders are a browsing aid for a library you can see all of, and offline
you can only see what you downloaded. An explicit banner ("Offline —
showing your downloads") explains why the shape changed, and the tree
returns when connectivity does. Offline with nothing downloaded is its
own state: telling someone who downloaded three episodes that there are
none would be a lie about their own device.

## Constraints

- Canopy is the iOS default; theme tokens only.
- No migration. This is entirely device-local: nothing about what a
  learner downloaded belongs on the server in this phase.
- The audio bucket is public-read, so a download is a plain GET with no
  signed-URL expiry to manage — one of the few places that decision pays
  off rather than costing.
- Files live under **Application Support**, not Caches: the system may
  purge Caches under pressure, and a download someone deliberately asked
  for should not evaporate.
- The directory is **excluded from iCloud backup**. Downloaded audio is
  re-downloadable content, iOS expects it excluded, and Apple has
  rejected apps for exactly this. Missing from the first draft — an App
  Store review-visible property, like `UIBackgroundModes` was.

## Device checks this adds

CI cannot see any of these.

1. Download an episode; airplane mode; play it from Listen.
2. Airplane mode with nothing downloaded: honest message, not a spinner.
3. Airplane mode **browsing** — the downloaded set is listed (device
   check #11, still untested from Phase 1b).
4. Kill the app mid-download, relaunch: no half-file, no phantom
   "downloaded" state.
5. Delete a download **while it is playing**: playback stops cleanly and
   says why, rather than stalling or continuing from a deleted file.
   (Missing from the first draft; plausible and silent.)
6. Delete a download; confirm the space is returned and the episode still
   plays online.
7. Fill the budget: the refusal names what could be removed and deletes
   nothing by itself.
6. Play a downloaded episode, then check resume still works across a
   relaunch and against web.

## Open questions

1. **Budget default.** 500 MB is a guess — roughly 170 episodes at 3 MB.
   Worth revisiting once there is more than one episode.
2. **Whether to auto-download the next episode in a folder.** Tempting
   and out of scope; it spends someone's cellular data on a prediction.
