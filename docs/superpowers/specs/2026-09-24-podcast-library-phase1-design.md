# Podcast / Audio Library — Phase 1 design

**Date:** 2026-09-24
**Status:** design approved in brainstorming, not yet implemented
**Worktree/branch:** `.claude/worktrees/podcast-library` / `worktree-podcast-library`

## Purpose

Give learners a browsable library of short-to-medium audio episodes
(roughly 2-10 minutes) organised in folders and subfolders, on both the
web app and the native iOS app, playing content the account owner
publishes.

The long-term intent is a **full learning activity**: transcripts,
comprehension questions, XP, and missed items feeding the existing SRS
review queue. That is deliberately *not* Phase 1 — see "Phasing" — but
the Phase 1 data model is shaped so it can be added without migrating
what Phase 1 writes.

### Success criteria

- The account owner can publish an episode without a code change, a
  deploy, or an App Store release.
- A learner can walk a folder tree on either platform, play an episode,
  leave, come back, and resume where they stopped — including on the
  other platform.
- Audio keeps playing on iOS when the screen locks, with working
  lock-screen controls.

### Non-goals for Phase 1

Transcripts, comprehension questions, XP for listening, SRS wiring,
offline download, search, an in-app admin screen, and any paid gating.
Each is scoped to a later phase below.

## Phasing

Podcasts as "full learning activity" is several independent subsystems.
It is decomposed, each phase its own spec, plan, and PR(s):

| Phase | Scope |
| ----- | ----- |
| **0** | iOS tab-bar consolidation (prerequisite, own small PR — see below) |
| **1a** | Storage bucket, schema, ingestion CLI, web browse + player |
| **1b** | iOS `PodcastClient`, browse + player, background audio |
| **2** | Transcripts, comprehension questions, XP, SRS integration |
| **3** | Offline download, cross-device resume polish, search |
| **4** | Admin subsystem (roles, RLS, admin area) — app-wide, not podcast-specific |

**Phase 1a freezes the schema.** 1b consumes it and must not change it;
a schema change discovered during 1b is a signal to stop and amend this
spec rather than patch around it.

### Phase 0: why the tab consolidation is separate

iOS currently has 7 tabs (`ios/LearnWithAlphonso/Sources/RootView.swift`)
and iPhone renders at most 5 before collapsing the remainder into a
system "More" list. Listen needs a real slot.

Agreed target: **Learn · Listen · Practice · Hector · Profile**, where
Review folds into Learn (which already carries a live due-count badge,
so the entry point and its discoverability already exist) and League,
Friends, Achievements, Season and Settings move into a Profile hub.
Hector keeps its tab deliberately: it is the monetized surface, and a
navigation tidy-up should not quietly cost revenue.

This lands as its own PR **before** the podcast work, with the Listen
tab stubbed, because: it is an iOS navigation refactor unrelated to
podcasts; it changes behaviour for existing users and deserves its own
review; and `RootView.swift` is a likely conflict point with other
concurrent sessions.

## Data model

All three tables follow the conventions already in
`supabase/migrations/20260922040000_teams.sql`: a commented header
pointing back at this spec, `GRANT SELECT` to `authenticated`,
`GRANT ALL` to `service_role`, RLS enabled, explicit policy per table.

### `podcast_folders`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK | `gen_random_uuid()` |
| `parent_id` | `uuid NULL` | self-ref, `ON DELETE RESTRICT` |
| `slug` | `text NOT NULL` | URL segment |
| `title` | `text NOT NULL` | |
| `description` | `text` | |
| `course` | `text NULL` | `'en' \| 'fr' \| 'es'` when applicable |
| `level_id` | `text NULL` | FK `levels(id)` |
| `cover_image_url` | `text NULL` | |
| `sort_order` | `integer NOT NULL` | |
| `created_at` | `timestamptz NOT NULL` | `now()` |

Arbitrary depth by design: the agreed editorial shape (Course → Level →
Series) is a *convention for populating* the tree, not a constraint in
the schema. The clients render a generic tree.

Two wrinkles handled explicitly:

- **Sibling slug uniqueness.** `UNIQUE (parent_id, slug)` does not
  constrain root folders, because Postgres treats `NULL` parents as
  mutually distinct. Needs the normal unique index *plus* a partial
  unique index on `(slug) WHERE parent_id IS NULL`.
- **Cycle prevention.** A folder becoming its own ancestor cannot be a
  `CHECK`. Since only `service_role` (the CLI) ever writes, this is
  validated in `src/lib/podcast-authoring.ts` under test, the same place
  `pack-authoring.ts` holds its validation. No trigger.

### `podcast_episodes`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `folder_id` | `uuid NOT NULL` | FK, `ON DELETE RESTRICT` |
| `slug` | `text NOT NULL` | `UNIQUE (folder_id, slug)` |
| `title` | `text NOT NULL` | |
| `description` | `text` | |
| `audio_path` | `text NOT NULL` | object path within the bucket |
| `duration_seconds` | `integer NOT NULL` | measured, never hand-entered |
| `course` | `text NULL` | |
| `level_id` | `text NULL` | FK `levels(id)` |
| `source` | `text NOT NULL` | `CHECK (source IN ('upload','tts'))` |
| `published` | `boolean NOT NULL` | default `false` |
| `sort_order` | `integer NOT NULL` | |
| `created_at` / `published_at` | `timestamptz` | |

Read policy: `USING (published = true)`. `GRANT SELECT` to
`authenticated` only — unlike the curriculum tables, this sits behind
`_authenticated`, so `anon` gets nothing.

### `podcast_playback`

Per-user resume position: `user_id` (FK `auth.users`), `episode_id`,
`position_seconds`, `completed_at`, `updated_at`, PK
`(user_id, episode_id)`, owner-only RLS
(`USING (auth.uid() = user_id)`), matching the existing per-user tables.

Resume-where-you-left-off is what separates a player from a file list,
and including it now yields cross-device resume for free rather than as
rework.

### `podcast_play_events`

Append-only: `user_id`, `episode_id`, `started_at`,
`seconds_listened`, owner-insert RLS. One row per play session.

Rationale: without it there is no evidence that anyone listens, and
Phase 2 would be building transcripts and quizzes on top of content of
unknown value. Nearly free now; not reconstructable later.

### Generated types

`src/integrations/supabase/types.ts` is generated ("Do not edit it
directly") and must be regenerated as part of the migration work.

## Storage

One bucket, `podcast-audio`, **public-read**, paths
`{course}/{level}/{folder-slug}/{episode-slug}.mp3`.

No client write policy exists, so no user device can write to the
bucket. Only the CLI's service-role key uploads.

**Known and accepted limitation.** RLS hides the *row*, not the *file*.
With a public bucket an unpublished episode's audio is still fetchable
by anyone who knows or guesses the URL — `published` is a staging flag
for the app, not privacy. Accepted because Phase 1 content is free for
all learners (decided during design). Draft episodes should use an
unguessable path suffix; that is obscurity, not access control.

**If podcasts are ever gated behind Pro this decision must be revisited
before that work starts** — public URLs cannot enforce entitlement, and
the migration to a private bucket with signed URLs is the expensive,
hard-to-reverse part of this design. RevenueCat Pro already exists on
iOS, so this is a live possibility, not a hypothetical.

**Cost.** Audio egress is orders of magnitude heavier than this app's
current text-and-thumbnail traffic, and Supabase bandwidth is metered.
A 6-minute 64kbps mono MP3 is roughly 2.9 MB; 100 episodes played once
each by 100 learners is roughly 29 GB of egress. Encode mono at a
speech-appropriate bitrate and check the project's bandwidth allowance
before bulk-publishing.

## Ingestion

`scripts/podcast-tool.ts` — a thin argv/fs wrapper, with the real logic
in a Vitest-covered `src/lib/podcast-authoring.ts`. Mirrors
`scripts/pack-tool.ts` exactly, including its human gate: nothing that
writes does so without `--confirm`.

```
bun run scripts/podcast-tool.ts folder  --parent <slug|root> --slug intro-a1 --title "..."
bun run scripts/podcast-tool.ts add     --folder intro-a1 --file ./ep1.mp3 --title "..."
bun run scripts/podcast-tool.ts add     --folder intro-a1 --script ./ep1.txt --voice aura-2-thalia-en
bun run scripts/podcast-tool.ts validate <file>
bun run scripts/podcast-tool.ts publish  <episode-slug> [--confirm]
```

`--file` uploads a recorded MP3; `--script` generates one via Deepgram.
Everything downstream — upload, duration measurement, row insert — is
shared, so the two sources differ only in the `source` column.

**TTS chunking.** `src/routes/api/tts.ts` slices text at 2,000
characters per Deepgram call; a 6-8 minute episode is roughly 7,000
characters. The script splits on sentence boundaries into sub-2,000
character chunks, synthesises each, and joins the results.

**Open technical risk — joining the chunks.** Concatenated MP3 frames
usually play, but can yield unreliable reported duration and seeking.
Resolve with a throwaway probe *first*, before building the TTS path:
synthesise a real multi-chunk episode and verify duration and seeking
in both players. If naive concatenation misbehaves, fall back to
requiring `ffmpeg` on the authoring machine (acceptable — the CLI runs
only on the owner's machine). The probe's outcome is recorded here
before the TTS path is built.

**Duration** is read from the finished MP3 with `music-metadata` (pure
JS, no ffmpeg) — a new dependency, chosen to avoid a system binary.
`duration_seconds` drives the scrubber, so a wrong value is immediately
visible.

The CLI calls Deepgram and Supabase directly, bypassing `/api/tts`,
whose per-user quota and auth do not apply to an admin tool. The
service-role key is resolved via the `aws-secrets-manager` pattern per
`CLAUDE.md`, never read into agent context.

**Partial-failure handling.** The row is inserted only after a verified
upload. If the insert then fails, the CLI reports the orphaned object
path so it can be retried or cleaned up. No silent partial state.

## Web client (Phase 1a)

- Routes: `/listen` for the root, and a splat route `listen.$.tsx`
  resolving a slug path of any depth — one route for the whole tree.
- Data via TanStack Query, matching every other screen.
- Nav: a fifth tab in `AppShell`'s bottom nav (currently Learn, Chat,
  League, Profile — web has room; only iOS is constrained).

**Player structure — the load-bearing decision.** A single `<audio>`
element mounted once in `AppShell`, driven by a Zustand store, with a
persistent mini-player docked above the bottom nav. If the element
lives in the route component instead, navigating from a folder into a
subfolder unmounts it and playback stops — the most common way a web
audio feature ends up broken. Free now, painful to retrofit.

## iOS client (Phase 1b)

- `PodcastClient` in `LearnWithAlphonsoKit`, mirroring
  `ProgressSyncClient` (URLSession against PostgREST with the access
  token, injected-requester closure for tests).
- **This is the first time the iOS app fetches content from the server
  rather than its bundle** (`ContentStore` is explicitly "No network
  calls, no async"). It is the largest new concept in the iOS work.
- `ListenView` with a `NavigationStack` pushing folder into folder —
  the natural match for arbitrary depth.
- `AVPlayer`, audio session category `.playback` so audio continues
  when the screen locks, plus `MPNowPlayingInfoCenter` and
  `MPRemoteCommandCenter` for lock-screen and Control Center controls.
- Requires the `audio` background mode in `Info.plist` — a capability
  change visible in App Store review. Know before submission.
- Position saves best-effort on pause and backgrounding, the same
  posture as `RootView.hydrateThemeFromServer`: a failed write leaves
  the last known position alone rather than resetting it.

**Known trade-off.** Listen will be the only online-only surface in an
otherwise offline-first iOS app: lessons, review and completions all
work on a plane; podcasts will not, because download is Phase 3. Users
will experience this as the new tab being broken on the subway —
precisely when people listen to podcasts. If early use confirms it,
pull Phase 3's download forward rather than defending the phase order.

## Failure modes

- **Audio won't load** (bad path, deleted object, no connectivity): a
  real error state with retry; never an indefinite fake buffering
  state at 0:00. iOS consults the existing `NetworkMonitor` to say
  "you're offline" rather than blaming the file.
- **Playback interrupted** (call, other app, headphones unplugged):
  iOS handles `AVAudioSession` interruption and route-change
  notifications — pause on interruption, and pause on headphone
  removal rather than blasting audio from the speaker.
- **Saved position past the end** (episode re-uploaded shorter): clamp
  on read; never seek past the end.
- **Empty or orphaned folder**: an ordinary empty state, not an error —
  expected, since the tree gets built before it is filled.

## Testing

Per `AGENTS.md`, TDD: tests first.

- **Vitest (pure logic):** folder-tree building, cycle detection,
  sentence-boundary chunking, slug/path validation, position clamping.
- **Vitest + React Testing Library:** browse and player components,
  including error and empty states.
- **XCTest (`LearnWithAlphonsoKit`):** `PodcastClient` via the
  injected-requester pattern — no real network, matching the existing
  146-test suite.
- **Playwright:** E2E is scoped to unauthenticated routes (no seeded
  CI test account), so `/listen` gets no real E2E coverage. Named
  rather than papered over.

CI already runs lint, typecheck, Vitest, Playwright, and the Swift
package tests on every PR, plus a real `xcodebuild` of the app target —
the only compile verification for the iOS app in this environment.

## Open questions

1. **Chunk-joining — still open.** The probe was not run: no
   `DEEPGRAM_API_KEY` was reachable from the implementation environment,
   and the probe is only meaningful against real Deepgram output. The CLI
   ships with byte concatenation behind a single function,
   `joinMp3Chunks` in `scripts/podcast-tool.ts`. Run the probe before
   publishing a real multi-chunk TTS episode; if durations or seeking
   misbehave, that one function becomes an `ffmpeg -f concat` call.
2. Target bitrate/encoding for published audio, pending the cost check.
3. **Captions/transcripts are an accessibility gap, not just a Phase 2
   feature.** The web player currently has no `<track>`, so episodes are
   inaccessible to deaf and hard-of-hearing learners. `jsx-a11y/media-has-caption`
   is disabled on that one line with a comment; Phase 2's transcripts are
   the real fix, and should be treated as an accessibility obligation
   rather than an enhancement.

## Implementation status (2026-09-24)

Phase 1a is implemented on `worktree-podcast-library` except for two
steps that need credentials this environment does not have:

- The migration has **not** been applied to the live Supabase project,
  and the `podcast-audio` bucket has **not** been created.
- `src/integrations/supabase/types.ts` has **not** been regenerated, so
  `podcast.functions.ts` talks to the client through a documented
  one-line `untyped()` cast. Delete that helper once types are
  regenerated.

Until both are done the Listen tab renders but has no data to show.
