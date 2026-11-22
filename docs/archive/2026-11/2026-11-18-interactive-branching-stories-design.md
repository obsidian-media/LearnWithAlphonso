> Historical record. Delivered in #622 web (2026-11-18), #635 mobile (2026-11-19); #659 reader, #675/#678 Mona stories (2026-11-20). Current behaviour: ARCHITECTURE.md § Branching stories.

# Interactive branching stories — design

Date: 2026-11-18. Status: owner-approved design (brainstorm + approved mock). Web-first increment, built on the merged graded-stories v1 (PR #617).

## Goal

Grow graded stories from one straight read-along into a **branching story**: a tree of read-along nodes joined by **choice points**, reaching one of several **endings**. A choice both advances the plot and only makes sense if the learner understood the passage (a "blend" choice, like the mock's "Flat 12" clue). Branching is **soft**: there is no wrong/fail styling and no dead-end loop — a path that ignored a clue still reaches a (less ideal) ending. A plain v1 story is just a branching story with no choices, so the two live side by side.

Web only this round. iOS and Android parity is a later task (the same `nodes` shape and the same server function port to the Kit, as v1 will).

## Data model — chosen shape and why

**Decision: extend `public.stories` with one nullable `nodes jsonb` column holding the whole node graph, plus a cheap `branching boolean` flag. No new content tables.**

A branching story's entire tree is authored, reviewed, shipped, and published as one unit, and the reader and the server each read the *whole* tree in one go — never a single node in isolation. That is exactly the shape of v1's `segments jsonb` and of the podcast content model. Splitting it into `story_nodes` / `story_choices` / `story_endings` child tables would add three tables, three policies, three grants, and FK-cascade/ordering bookkeeping to buy nothing, because we never query one node alone. So the graph stays in jsonb on the existing row, and v1's RLS / grants / `SECURITY DEFINER` / review-before-publish posture is inherited unchanged.

- A **v1 (linear) story**: `segments` set, `nodes` NULL, `branching = false`. Untouched by this migration.
- A **branching story**: `nodes` set, `branching = true`; `segments` is an empty array (the text lives in the nodes). A `CHECK` keeps `branching = (nodes IS NOT NULL)` so the flag can never disagree with the data.

### `nodes` jsonb shape

```jsonc
{
  "start": "n1",                       // id of the first node
  "map": {
    "n1": {
      "segments": ["sentence.", "..."],// read-along text — the v1 reader unit (narration + highlight + tap-define)
      "art": "en/<story-slug>/n1.jpg",  // OPTIONAL scene-art object key (see Illustration); absent => placeholder
      "choice": {                       // OPTIONAL — a choice node
        "prompt": "The bus leaves at 8:20. What does Sam do first?",
        "options": [
          { "label": "Run to the stop", "goto": "n2", "clue": true  },
          { "label": "Make breakfast",  "goto": "n3", "clue": false }
        ]
      }
      // a node has EXACTLY ONE continuation:
      // "choice"  -> a branch (2–3 options),
      // "next": "nX" -> a single linear link, or
      // "ending": { "id": "kind-and-on-time", "title": "...", "wrap": "...", "quality": "good" } -> terminal
    }
  }
}
```

- `clue: true` marks the option that reflects having understood the passage (the attentive path). It drives nothing punitive — it is used only to decide ending quality and the stars blend.
- `ending.quality ∈ {good, ok, lesser}`. There is at least one `good` ending (the fully attentive path) and no node that is neither a continuation nor an ending (a content error the rehearsal catches).
- `nodes` CHECK is intentionally light (`jsonb_typeof = 'object' AND nodes ? 'start' AND jsonb_typeof(nodes->'map') = 'object'`). Deep validity is the human review plus the BEGIN…ROLLBACK walk rehearsal, not a constraint.

### Progress + endings tracker

Extend `public.story_progress` (do not add a table) with:
- `endings_found jsonb NOT NULL DEFAULT '[]'` — the set of ending ids the learner has reached (deduped), for the "endings found X of N" tracker.
- `reading_credited boolean NOT NULL DEFAULT false` — the farm-proof flag: the `reading` skill credit is granted at most once per (user, story), ever.

v1's `segment_index`, `best_correct`, `check_total`, `completed_at` stay; a branching story leaves `best_correct/check_total` NULL (it has no MC quiz) and uses `completed_at` for "reached an ending at least once".

## Server function + farm-proof credit

New `public.finish_branching_story(_user_id uuid, _story_id uuid, _path jsonb)` — `SECURITY DEFINER`, `search_path = ''`, **service-role only** (REVOKE from PUBLIC/anon/authenticated; GRANT EXECUTE to service_role), called by a server fn that passes the verified user id, exactly like `submit_story_check`.

`_path` is a jsonb array of integers: the option index chosen at each choice node, in order. **The server never trusts a client-claimed ending.** It re-walks the stored `nodes` from `start`, applying `_path` at each choice node and following `next` links, until it lands on an `ending` node — and that node, read from the stored graph, is the authoritative ending id and quality. Mismatched / out-of-range / unconsumed path ⇒ `{status:'invalid'}`; unpublished or non-branching story ⇒ `{status:'not-found'}` (the published check is the same gate as v1). A 100-step guard stops any malformed cyclic graph.

**Farm-proof reading credit (default decision #1-tie, see below):** under an advisory xact lock on (user, story), the function records the ending in `endings_found` and sets `completed_at`. The `reading` skill is credited **once, the first time the learner reaches a `good` ending** (`add_skill_results(reading, right:1, total:1)`), then `reading_credited = true` forever. Re-reaching the good ending, reaching other good endings, or replaying any path never credits again — the credit is gated solely on the server-computed quality and the one-way `reading_credited` flag, so it cannot be farmed by replay. A `lesser`/`ok` ending completes the story and is tracked, but does not grant the reading credit until a `good` ending is reached.

Returns `{status:'applied', endingId, quality, endingsFound:[...], endingsTotal, credited}`.

## Reader flow

The route `getStory` returns a discriminated story: linear (`branching:false`, `segments`+`questions`, → existing `StoryReader`) or branching (`branching:true`, `graph`, → new `BranchingStoryReader`). The library route and library list are shared.

`BranchingStoryReader` is a small state machine over a **pure engine** (`src/lib/branching.ts`, unit- + mutation-tested):
- `startNode`, `nodeKind`, `applyChoice(graph, path, optionIndex)`, `walk(graph, path)` (the TS twin of the SQL walk, for UX), `storyStars(...)`, `endingsProgress(found, total)`.
- **Passage:** each node's `segments` render through the **reused** v1 read-along — `useStoryNarration` (per-sentence `/api/tts` + highlight) and `TappableText` inside `SaveWordProvider` (tap-to-hear-and-define). A shared `<ReadAlongPassage>` is extracted from `StoryReader` so both readers use one implementation.
- **Illustration:** above the passage, the scene illustration (or a tasteful themed placeholder — see below).
- **Choice point:** under the passage, the **real Alphonso avatar** (`/avatar/base.webp`, the app's own asset) presents the `choice.prompt`, with 2–3 soft option buttons (no right/wrong colour; the DS choice tint only). Picking one appends its index to the path and transitions to `goto`.
- **Ending screen:** a short `wrap`, which ending was reached, the **endings-found tracker** (X of N, soft), the **stars** blend, a line confirming the reading credit when it was just granted, and two actions — **"Try another path"** (restart at `start`, keep `endings_found`) and **"Read it again"**.
- **Motion** (owner: "not plain boring"): framer-motion node-enter and choice-select transitions via `AnimatePresence`, mirroring `MascotImage`; `useReducedMotion()` collapses them to plain cuts.

## Illustration convention (coordinator fills the art)

- New **public-read storage bucket `story-art`** (owner/coordinator creates it out-of-band, like `vocab-images` and `podcast-audio`; not created by a migration).
- Object key convention: **`<course>/<story-slug>/<nodeId>.jpg`**, e.g. `en/a-day-that-could-go-a-few-ways/n1.jpg`. The node's `art` field stores this key (mirroring how `stories.audio_path` stores a key in `podcast-audio`).
- `getStory` resolves each key to a public URL server-side (`storage.from('story-art').getPublicUrl(key)`), attaching `artUrl` or `null` to each node.
- **Graceful degradation (required):** when `art` is absent or the URL is empty, the reader shows a themed DS placeholder tile (a 3D `compass` scene icon on the DS scene background) — **never a broken `<img>`**. So the feature ships and looks finished before any art exists; the coordinator later uploads the files at the keys above and they appear with no code change (same "data change, no release" property as publishing).

## The proof story — "A Day That Could Go a Few Ways" (EN, A2)

Seeded **UNPUBLISHED / `needs_review = true`** (agent-drafted, not a native speaker — reviewed before publish, exactly like v1's seed). Course `en`, level `A2`, slug `a-day-that-could-go-a-few-ways`.

3 decision points, 4 endings. Each choice blends comprehension with the plot:

- **n1 (start)** — Sam wakes at 8:10; his bus leaves at 8:20. *Choice:* understand the bus is in 10 minutes → **Run** (`clue`, →n2) vs **Make breakfast** (→n3).
- **n2** — On the way Sam finds a wallet with a card: "Mrs Patel, Flat 12". The bus is coming. *Choice:* having read the card → **Take it to Flat 12** (`clue`, →n4) vs **Leave it and board** (→n5).
- **n3** — Sam eats a big breakfast and misses the bus; first class is PE, outside. *Choice:* understand PE is active/outside → **Walk and arrive warmed up** (`clue`, →n7) vs **Wait for the late bus** (→n6).
- **Endings:** **n4** `kind-and-on-time` (**good** — the one that credits reading), **n5** `on-time-but-uneasy` (lesser), **n7** `late-but-ready` (ok), **n6** `late-but-calm` (lesser).

**Scene-art slots the coordinator must fill** (bucket `story-art`, keys under `en/a-day-that-could-go-a-few-ways/`): `n1.jpg` … `n7.jpg` (7 scenes). A manifest of the slots + one-line art briefs ships next to the seed in the migration comment and is listed in the final report.

## Migration

`supabase/migrations/20261122100000_branching_stories.sql` — versioned **after** the current max on origin/main (graded-stories `20261121100000`; the deferred podcast-quiz PR also uses `20261121100000`, so this takes a later day). It is additive: `ALTER TABLE public.stories ADD COLUMN nodes jsonb`, `ADD COLUMN branching boolean NOT NULL DEFAULT false`, the consistency CHECK; `ALTER TABLE public.story_progress ADD COLUMN endings_found jsonb`, `ADD COLUMN reading_credited boolean`; `CREATE FUNCTION finish_branching_story` with v1's REVOKE/GRANT; the one proof-story seed. Rehearsed on project `qhcjpfbxfcltjbiuknyt` inside `BEGIN … ROLLBACK` with the new function called as a seeded user in the same rolled-back transaction (the main session confirms the MCP). Existing columns get no client write grant (writes still go through functions); `branching` and `nodes` are SELECT-only for `authenticated`, which the existing `stories` grant already covers (no new table). A PR with a migration is owner-gated: not merged by the agent or the coordinator.

## The three open decisions — DEFAULTED (owner may change), flagged for review

1. **Stars = a blend** of how well the story was followed (reaching a `good` ending) and how many endings have been found: 1 star for reaching any ending, +1 for reaching a `good` ending, +1 for having found all endings (max 3). *Owner may reweight or drop stars.*
2. **A skipped-clue path still reaches a (lesser) ending** — soft, never a loop-back dead-end; `lesser`/`ok` endings are real endings, tracked, replayable via "Try another path". *Owner may choose to steer skipped-clue paths back to a retry instead.*
3. **Branching stories live in the SAME `/stories` library as v1**, each marked with a **"Choose your path"** badge (a DS pill + `compass` affordance) so the two kinds are distinguishable in one list. *Owner may split them into a separate shelf.*

Tie-in flagged with #1: **the reading credit is granted on the first `good` ending**, not on any first completion. This rewards comprehension while staying soft (a lesser ending is never shamed, and the learner is invited to try another path). *Owner may switch to "credit on any first completion" — one line in `finish_branching_story`.*

## Out of scope

Pricing, the lesson engine, and the podcast feature are untouched. iOS/Android parity is a follow-up (port the `nodes` shape, the pure engine, and `finish_branching_story` to the Kit). No new illustrations are generated here — the art is the coordinator's separate task; this round ships the slots, the convention, and the graceful placeholder.

## Self-review

- No placeholders or TODOs; every field above is wired to the migration, the server fn, or the reader.
- Consistent with v1: inherits RLS (published-only), own-row progress, `SECURITY DEFINER` + `search_path=''`, service-role grading, the review-before-publish CHECK, and the "publish is a data change" property.
- Farm-proof credit is server-computed quality + a one-way flag under an advisory lock — the right axis to guard, mutation-checked in the rehearsal (credit fires once, not on replay) and in the migration text test.
- Scope: web only; one PR; migration owner-gated; no art generated; no v1 row or test disturbed (linear stories keep `segments`/`questions` and the existing reader).
