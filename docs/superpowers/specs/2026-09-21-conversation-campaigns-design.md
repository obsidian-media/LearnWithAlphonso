# Design: Multi-turn conversation campaigns

> Written 2026-09-21, V4 candidate #4
> (`docs/v4-kickoffs/00-INDEX.md` §4). Parallel-safe: additive files plus
> one new section on `converse.tsx`/`ConversationView.swift`, no changes
> to `src/data/scenarios.ts`'s type, `converse_.$scenarioId.tsx`'s
> behavior, or `/api/chat`'s contract.

## Goal

One real, working, end-to-end "campaign": a connected sequence of
scenes (distinct characters/settings) that share one continuous
transcript, so a later scene can reference what happened in an earlier
one -- something today's one-shot `Scenario` roleplays structurally
can't do. This ships **one** campaign to prove the architecture, not a
conversion of every existing scenario.

## Starting reference: how today's scenario chat handles state

Read `converse_.$scenarioId.tsx`, `ConversationSessionView` (iOS), and
`/api/chat` before designing this. Finding: **zero persistence,
anywhere.** `messages`/`turns` is plain `useState`/`@State`, lost the
moment the learner navigates away; `/api/chat` is a stateless endpoint
(system prompt + message array in, one reply out) with no session
concept, no database write, no campaign/session id. Adaptive
difficulty (`cefrLevel`) is the only piece of "state" involved, and
even that's fetched fresh from `/api/sync` on every mount, not stored
per-conversation. This is the baseline every design decision below is
weighed against.

## Data shape

`src/data/campaigns.ts` — deliberately **not** a rewrite of `Scenario`.
A campaign is an ordered list of scenes, each one roughly a
self-contained `Scenario` (own systemPrompt, own opener), plus a
`premise` shared across all scenes and a per-scene `minTurns`:

```ts
export type CampaignScene = {
  id: string;
  title: string;
  systemPrompt: string;
  opener: string;
  minTurns: number;
};

export type Campaign = {
  id: string;
  title: string;
  emoji: string;
  blurb: string;
  level: "Beginner" | "Intermediate" | "Advanced";
  premise: string;
  scenes: CampaignScene[];
};
```

Continuity mechanism: the client keeps **one growing message array for
the whole campaign** (not one per scene). Every `/api/chat` call sends
the *entire* transcript so far -- including earlier scenes' turns --
with a composed `systemPrompt` of `premise + "\n\n" + currentScene.systemPrompt`.
The model therefore always sees what happened earlier (e.g. the
learner ordering a latte in scene 1) and can reference it in scene 2
if it chooses to, without any new field on `/api/chat` itself -- it's
still just "system prompt + messages in, reply out." This is why
`/api/chat` needed zero changes.

## Design decisions

### 1. When does a scene end?

**Decision: an explicit user action ("Continue"), gated by a minimum
turn count per scene.** Not a fixed turn count alone, and not an AI
self-reported "this scene is complete" signal.

- A **pure fixed cutoff** (e.g. "always 4 turns") is the simplest to
  verify but feels mechanical -- some scenes naturally resolve faster
  ("ask for directions" is shorter than "order coffee"), and cutting a
  learner off mid-sentence exchange breaks immersion.
- An **AI judgment call** (asking the model to emit some
  "scene complete" signal) is the most "natural" on paper but is the
  hardest to verify and the least trustworthy: it requires parsing a
  signal out of free-text completions, the model can forget the
  instruction or emit it early/late, and there is no way to unit-test
  it without mocking model behavior. Given this app's existing pattern
  of trusting the model for tone but never for control flow (see
  `/api/chat` never inspecting reply content), this was rejected.
- **User action + a floor** is simplest to verify (it's just "count
  of `role: "user"` messages since the scene started >= N", a pure
  function, trivially unit-tested) and keeps the learner in control of
  pacing, matching how the rest of the app already works (explicit
  taps drive lesson/review flow, nothing auto-advances on a timer).
  The floor exists only so "Continue" can't be tapped before any real
  practice happened in the scene.

### 2. Retry / abandon-and-resume

**Decision: a learner can restart the *current* scene from scratch
("Restart this scene"); progression is otherwise one-way (no jumping
back to redo an already-completed scene in this slice). Abandoning a
campaign mid-way loses progress, identical to what already happens
today if a learner navigates away from a single scenario mid-chat.**

This mirrors the "zero persistence" baseline above rather than adding
new asymmetric behavior: today, leaving `/converse/$scenarioId` mid-chat
already discards the whole conversation with no warning and no resume.
Giving campaigns a different (persisted) resume story than every
existing scenario chat would be new user-facing behavior invented for
this feature alone, not something this slice needs to prove the
architecture. "Restart this scene" is cheap or given the transcript is
just truncated back to the scene's start (`sceneAnchor` index) and
that opener is re-shown -- no server round trip, no persistence needed.
Restarting the *whole* campaign is just navigating back and back in
again (fresh component mount = fresh state), same as scenarios today.

Follow-up (explicitly out of scope here): if real user feedback wants
resume-after-close, that's a genuine new feature (localStorage at
minimum, a Supabase table if cross-device resume matters) and should
get its own design pass, not be smuggled into this slice as a side
effect.

### 3. Where does campaign state live?

**Decision: client-side only, in-memory (`useState`/`@State`), no new
Supabase table or columns.** Directly follows from the "starting
reference" finding above: today's scenario chat has no server-side
state at all, and campaigns are still fundamentally one chat session
with a client-tracked scene pointer layered on top -- there is no new
information here that needs to survive a page reload or be readable
from a second device. Introducing a `campaign_sessions` table for this
first slice would be new architecture this feature doesn't need yet,
and the task's own framing ("first slice," "prove the architecture")
argues for the smallest shape that actually demonstrates connected
multi-scene continuity end to end.

## Web implementation

- `src/data/campaigns.ts` -- the data above, one campaign
  (`city-day`: coffee stop -> ask for directions -> small talk at the
  market), `getCampaign(id)`.
- `src/routes/_authenticated/campaign_.$campaignId.tsx` -- new route,
  `/campaign/$campaignId`. Structurally a sibling of
  `converse_.$scenarioId.tsx` (same header/bubble/mic/TTS chrome,
  reused patterns not reused code -- the scene-progression state this
  page needs doesn't exist on the scenario page), plus:
  - a progress label ("Scene 2 of 3 — Ask for directions")
  - a "Continue" affordance once `minTurns` is met for the active scene
  - a "Restart this scene" control
  - a completion state once the last scene's Continue is tapped
- `src/routes/_authenticated/converse.tsx` gets one additive section
  above the existing scenario list ("Campaigns") linking to the new
  route -- `SCENARIOS`/`Scenario` untouched.
- `src/lib/ios-content-export.ts` / `scripts/export-ios-content.ts` --
  add `buildIOSCampaignsBundle()` and a `campaigns.json` write, same
  pass-through pattern as `buildIOSScenariosBundle`.

## iOS implementation

- `CurriculumModels.swift` -- add `CampaignScene`/`Campaign` Decodable
  structs mirroring the TS shape exactly (same convention as `Scenario`
  and every other bundled-content type here).
- `ContentStore.swift` -- `public let campaigns: [Campaign]`, loaded
  from the bundled `campaigns.json` the same way `scenarios` is.
- `ConversationView.swift` gets a second `List` section ("Campaigns")
  above the existing scenario list, linking to a new
  `CampaignSessionView` in `CampaignView.swift` -- deliberately *not* a
  new `RootView` tab, to avoid touching shared navigation structure for
  a first-slice feature.
- `CampaignView.swift` -- new file, same record/transcribe/chat/speak
  turn loop as `ConversationSessionView`, plus the scene-pointer state
  described above.

## What this slice explicitly does not do

- Does not convert any existing `Scenario` into a campaign, and does
  not add a second campaign -- one real campaign, to prove the shape.
- No server-side persistence of any kind (table, columns, or edit to
  `/api/chat`'s contract).
- No resume-after-navigating-away for campaigns (matches today's
  scenario chat exactly).
- No jumping back to redo an earlier *completed* scene, only "restart
  the current scene."
