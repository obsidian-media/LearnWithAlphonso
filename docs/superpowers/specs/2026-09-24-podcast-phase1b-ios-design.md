# Podcast library Phase 1b — the iOS Listen client

**Date:** 2026-09-24
**Status:** design proposed, not yet approved
**Branch:** `worktree-podcast-phase1b-ios` (from `1b3163f`)
**Follows:** Phase 1a (`2026-09-24-podcast-library-phase1-design.md`), Phase 0 (`2026-09-24-podcast-phase0-ios-tabs-design.md`)

## Purpose

Replace the `ListenView` placeholder with the real client: browse the
folder tree, play an episode, resume where you left off — on the same
account, across devices.

This closes the release constraint Phase 0 opened. **No App Store release
may ship until this lands**, because Listen is currently a tab that does
nothing.

### Success criteria

- A learner browses folders of any depth and plays an episode.
- Audio keeps playing when the screen locks, with working lock-screen
  and Control Center controls.
- Leaving an episode and coming back resumes where it stopped —
  including from the web app, and vice versa.
- A phone call, another app taking audio, or unplugging headphones
  pauses rather than misbehaving.

### Non-goals

Offline download and search (Phase 3), transcripts, comprehension
questions, XP and SRS (Phase 2), and CarPlay.

### Where verification stands, up front

The logic — client, tree, clamping, URLs — lives in the Kit and gets real
tests. **The audio layer does not, and cannot here:** session category,
interruptions, route changes, Now Playing and background playback have no
unit tests in this repo, no local build (no macOS or Xcode in the
development environment), and a simulator would not prove the interesting
cases anyway. So the riskiest code in this phase is the least verified,
and the device pass is its only real check. That is stated here rather
than at the bottom because it should shape how the work is reviewed.

## The first server-fetched content in the iOS app

`ContentStore` is explicitly "No network calls, no async" — curriculum
ships in the app bundle. Podcast content cannot work that way: the
library grows without an App Store release, which is the entire point.

So `PodcastClient` is the first content fetch the iOS app has ever done.
It mirrors `ProgressSyncClient` exactly — `supabaseURL`, `anonKey`,
`accessToken`, and an injected `Requester` closure defaulting to
`URLSession.shared` — because that is what makes it testable without a
network, which is how all 241 Kit tests already run.

### Client surface

| Method | Route |
| --- | --- |
| `fetchFolders()` | `GET rest/v1/podcast_folders` |
| `fetchEpisodes(folderID:)` | `GET rest/v1/podcast_episodes` + this user's `podcast_playback` rows |
| `savePlaybackPosition(episodeID:positionSeconds:completed:)` | `POST rest/v1/podcast_playback` (upsert) |
| `recordPlayEvent(episodeID:secondsListened:)` | `POST rest/v1/rpc/record_podcast_play_event` |

**`recordPlayEvent` must go through the RPC.** `authenticated` no longer
holds INSERT on `podcast_play_events`
(`20260926223031_podcast_play_event_rpc.sql`). A direct insert would fail
as permission denied inside a call the player deliberately swallows, so
play recording would silently never happen on iOS — the same trap the web
client was moved off in that PR, and worth stating here because iOS is
being written from scratch and could walk straight back into it.

Episodes and playback positions are two requests merged on the client;
PostgREST has no equivalent of the server function's join. RLS already
filters episodes to `published = true` and playback rows to the caller,
so neither is re-checked here.

### Two failure modes the client has to own

**A token that expires mid-session.** `PodcastClient` is handed an
`accessToken` at init and cannot refresh it, exactly like
`ProgressSyncClient`. A long listening session can outlive it, and a
position save is a best-effort call whose errors are swallowed — so
resume would quietly stop working with nothing surfaced. The client
therefore maps **401 to a distinct `.unauthorized` error**, and the
player stops issuing saves for the rest of the session rather than firing
calls that cannot succeed. The next launch builds a client from a fresh
token, as `RootView.triggerSync` already does.

**Cross-device resume must not move backwards.** Both clients upsert, so
last-writer-wins lets a stale phone sitting at 5:00 drag a laptop's 0:30
position backwards when it syncs later. `updated_at` exists and nothing
reads it. `savePlaybackPosition` therefore guards on the stored value
rather than overwriting blindly (implementation choice recorded in the
plan). Without that guard the "resumes across devices" criterion above is
not actually delivered, and asserting it while not designing it would be
worse than dropping it.

## What moves into the Kit (so it is tested)

The app target has no unit tests anywhere in this repo. Anything with a
decision in it therefore belongs in `LearnWithAlphonsoKit`:

- **`PodcastFolder` / `PodcastEpisode`** models, mirroring the web types.
- **Folder-tree logic** — `buildFolderTree`, `resolveFolderPath`, and
  slug validation, ported from `src/lib/podcast-tree.ts` with the same
  behaviour: children whose parent is missing are dropped rather than
  promoted, and a path resolves by `(parentId, slug)` one level at a
  time rather than by a global slug lookup.
- **`clampPosition`**, ported from `podcast.functions.ts`, including the
  final-second rule.
- **The public audio URL** built from `audio_path` against the bucket.

Ported deliberately rather than shared: there is no mechanism in this
repo for sharing logic between TypeScript and Swift, and the existing
SRS/hearts/progress-math ports set the precedent.

Nothing enforces that a port and its original stay in step — the existing
ports carry the same exposure. Each ported function therefore carries a
comment naming **both** the TypeScript file and that file's test, so a
change on one side has a visible counterpart to check in review. That is
a weaker guarantee than shared code, and it is the one available.

## Audio

A single `PodcastAudioPlayer` object (app target, `@Observable`) owning
one `AVPlayer`. Because it is a reference type held above the view tree,
playback survives view changes for free — iOS does not have the web's
"element unmounts on navigation" problem, which is what made Phase 1a's
Critical finding possible.

- `AVAudioSession` category `.playback`, activated when playback starts,
  so audio continues when the screen locks.

  **Category policy with the mic screens.** `SpeakQuestionCard`,
  `ConversationView`, `HectorView` and `CampaignView` take the session
  for recording (`.playAndRecord`). When one of them does, this player
  **pauses and does not auto-resume**; the learner restarts it
  deliberately. Auto-resuming would talk over someone doing a speaking
  exercise, and sharing one session between podcast playback and
  recording is not attempted. This is the most likely thing in the phase
  to be wrong on a real device with real headphones, and it has no
  automated coverage.
- `MPNowPlayingInfoCenter` for title and elapsed time;
  `MPRemoteCommandCenter` for play, pause and skip.
- **`UIBackgroundModes` = `audio`** added to `ios/LearnWithAlphonso/Info.plist`
  (wired via `INFOPLIST_FILE` in `project.yml`). This is an App Store
  review-visible capability change — expect a reviewer to check that
  background audio is genuinely used.
- Interruption and route-change notifications: pause on interruption,
  pause on headphone removal rather than continuing out of the speaker.
- A periodic time observer saves position on a throttle, and on pause,
  and when the app backgrounds.
- Resume clamps against the **media's** real duration, not the stored
  `duration_seconds` — the row and the file can disagree, and the
  chunk-join probe remains unrun, which is exactly how they would.

## UI

- **`ListenView`** owns the `NavigationStack` and pushes folder into
  folder. Every child view it pushes is a plain view that does **not**
  own its own `NavigationStack` — Phase 0 showed what nesting costs, and
  this time the children are new code, so the constraint is free.
- **A mini-player bar** attached with `.safeAreaInset(edge: .bottom)` on
  the `TabView`, so it sits above the tab bar without overlapping content
  or being overlapped. It stays visible across tab switches; the audio
  does not depend on it, since the player object lives above the view
  tree — the bar is only a control surface.

  It will **not** follow screens presented over the tabs (the lesson
  player, review queue, and the four Profile sheets). That is intended —
  a control bar floating over a lesson would be worse — but it is a
  decision, and it is on the device checklist rather than left to be
  discovered.
- Empty states are honest: an empty folder says so, and being offline
  says *that* rather than blaming the episode.

**Listen is online-only in this phase.** Everything else on iOS works on
a plane — lessons, review, completions. Podcasts will not until Phase 3
adds download, and a subway is exactly where people listen. `NetworkMonitor`
already exists and must be used to say so plainly. If early use confirms
the complaint, pull Phase 3's download forward rather than defending the
phase order.

## Constraints

- **Canopy is the iOS default.** Theme tokens only, never fixed colours.
- **No migration in this phase.** The schema is live and unchanged. If
  that turns out to be wrong, the new migration's version must sort after
  `20260926030000_podcast_library.sql` regardless of wall-clock time —
  a real timestamp prevents collisions but says nothing about dependency
  order, which is how `20260924223031` came to sort before the table it
  revokes on.

## Testing, and the two things it cannot do

- **XCTest (Kit):** `PodcastClient` through the injected requester — no
  real network — plus the tree, clamp and URL-building ports. This is
  where the real coverage is.
- **`xcodebuild` in CI:** proves the app target compiles. Nothing more.

**Device verification is required, and this phase needs content to
verify against.** There are no published episodes yet. Before the device
pass, at least one real episode must exist, which means running
`scripts/podcast-tool.ts` with credentials — and if that episode is TTS,
**the chunk-join probe should be run first**, since a wrong
`duration_seconds` is precisely what the player's media-duration clamp
would then be papering over.

Device checks, on top of Phase 0's six:

1. An episode plays, and keeps playing with the screen locked.
2. Lock-screen and Control Center controls work and show the right title.
3. Resume works within iOS, and across to the web app on the same account.
4. A phone call pauses it; unplugging headphones pauses it.
5. Airplane mode gives an honest offline message, not a stuck spinner.
6. The mini-player bar behaves across tab switches.
