# Podcast Phase 2b — comprehension questions, XP and SRS

**Status:** spec, awaiting review. Nothing built.

**Follows:** Phase 1a (`2026-09-24-podcast-library-phase1-design.md`),
Phase 1b (`2026-09-24-podcast-phase1b-ios-design.md`), Phase 2a
(transcripts, shipped in #125/#126).

**Goal:** an episode becomes a learning activity, not just audio. After
listening, the learner answers comprehension questions; correct answers
earn XP and the questions enter the spaced-repetition queue alongside
lesson questions.

---

## The finding that shapes this whole design

The obvious implementation — add a `podcast` variant to the `Question`
union in `src/data/curriculum.ts` — is the wrong one, and the codebase
already contains the proof.

Lesson questions live in **bundled** content: `src/data/curriculum.ts`
compiles into the web bundle and exports to `curriculum-en.json` inside
the iOS binary. `ContentStore` is deliberately "No network calls, no
async". Podcast episodes are the opposite: they live in Postgres
specifically so the library can grow without an App Store release. A
`Question` union variant would therefore have to describe content that
is not in the union's own data source — and every consumer of that union
assumes otherwise.

The cost of forcing it, measured against the `listening` type (#88),
which is the closest precedent: **six exhaustive Swift switches**
(`ReviewQueueView.swift` is an entire second iOS player,
`QuestionGrading.swift` grades separately because grading is not
inherited on iOS, and `VocabDerivation.swift` holds three), plus
`review.tsx` on the web which fails *silently* with a blank card rather
than failing to compile, plus a Postgres migration widening
`questions.question_shape_matches_type`, plus three hardcoded lesson
counts in tests. That plan's own post-mortem records every one of those
as a thing it did not predict.

**There is already a mechanism for exactly this.** The Hector
weakness-detection feature (`20260920040000_review_items_weakness_source.sql`)
added to `review_items`:

```sql
source text NOT NULL DEFAULT 'lesson' CHECK (source IN ('lesson', 'weakness')),
weakness_label text, weakness_display text,
prompt text, choices jsonb, answer_index integer, explanation text,
CONSTRAINT weakness_shape_matches_source CHECK (
  (source = 'lesson') OR
  (source = 'weakness' AND weakness_label IS NOT NULL AND ... ))
```

A `weakness` row **carries its own gradable question** instead of
pointing at a bundled lessons/questions row. Both players already render
it: `ReviewQueueView.swift:85` branches on
`currentItem.source == "weakness"` and synthesises a `Question` from the
embedded fields, and `ReviewItem.source` on iOS is a plain `String`, not
an enum — so a new value **decodes without a Swift change**.

Podcast questions are the same shape of problem and get the same
solution. This is not a shortcut around the "full learning activity"
goal; the learner outcome is identical — XP, review queue, cross-device.
What changes is that it costs one CHECK constraint and one widened
branch instead of six switches, a union change, and a second migration.

---

## Schema

### `podcast_questions`

```
id            uuid PK default gen_random_uuid()
episode_id    uuid NOT NULL REFERENCES podcast_episodes(id) ON DELETE CASCADE
prompt        text NOT NULL
choices       jsonb NOT NULL          -- string[], length 2..6, enforced
answer_index  integer NOT NULL        -- 0-based, bounded by choices length
explanation   text NOT NULL
sort_order    integer NOT NULL
created_at / updated_at
UNIQUE (episode_id, sort_order)
```

Multiple-choice only, deliberately. `review_items`'
`weakness_shape_matches_source` constraint already requires `choices`
and `answer_index` on any non-lesson row, and both review renderers read
exactly those two fields. A `fill` or `listening` podcast question would
either not render in review or force the constraint open — and a
comprehension question about audio the learner just heard is naturally
multiple-choice anyway. **If a later format needs free text, this
decision is where to start, and it is a migration plus both review
renderers, not a content change.**

RLS mirrors `podcast_episodes`: `SELECT` to `authenticated` only for
questions whose episode is published; no client `INSERT`/`UPDATE`/`DELETE`
policy at all. Only the CLI's service role writes.

**`answer_index` is readable by the client.** So is every lesson
question's answer — this app has always graded on the device and the
review server re-grades with `deriveAnswerCorrectness`. Recording it
here so nobody later mistakes the podcast table for a stricter one than
its neighbours.

### `review_items.source` gains `'podcast'`

```sql
ALTER TABLE public.review_items DROP CONSTRAINT review_items_source_check;
ALTER TABLE public.review_items
  ADD CONSTRAINT review_items_source_check
    CHECK (source IN ('lesson', 'weakness', 'podcast'));
ALTER TABLE public.review_items DROP CONSTRAINT weakness_shape_matches_source;
ALTER TABLE public.review_items
  ADD CONSTRAINT embedded_shape_matches_source CHECK (
    (source = 'lesson') OR
    (source = 'weakness' AND weakness_label IS NOT NULL AND weakness_display IS NOT NULL
       AND prompt IS NOT NULL AND choices IS NOT NULL AND answer_index IS NOT NULL) OR
    (source = 'podcast' AND prompt IS NOT NULL AND choices IS NOT NULL
       AND answer_index IS NOT NULL)
  );
```

A podcast row needs no `weakness_label`/`weakness_display` — those name
the grammar weakness Hector inferred, and a podcast question has an
episode instead. The renamed constraint is the honest name for what it
now checks.

`item_key` is `podcast:{episode_id}:{question_id}`. The existing lesson
format is `{lessonId}:{questionId}` and weakness rows set
`lesson_id = 'weakness'`; podcast rows set `lesson_id = 'podcast'` by
the same convention. `UNIQUE (user_id, item_key, language)` then gives
per-episode-question uniqueness for free.

**Migration version must sort above `20260927230000`** (transcripts),
which is itself above the two Phase 1a migrations. Wall-clock "now" does
not: the library migration was renumbered forward out of a collision, so
the file series runs ahead of the calendar. This is the repo's most
repeated migration mistake — see `migration-order.test.ts`, whose guard
covers `REFERENCES` in `CREATE TABLE` as well as `ALTER`.

---

## XP, and what "completed" means

An episode's questions are answered once, as a set, after listening.
Grading is client-side for immediate feedback and re-graded server-side
before any XP is written — the existing shape, not a new one.

XP is awarded **per correct answer, once per question, ever**. Not per
attempt: re-listening to a favourite episode must not be a way to farm
XP, and the `UNIQUE (user_id, item_key, language)` row is what makes
"ever" enforceable rather than a policy nobody checks. A question
answered wrong earns nothing and still enters the queue — that is what
the queue is for.

A `podcast_play_events` row already records listening. Episode
completion is **listening plus attempting the questions**, so an episode
with no questions authored can never be "completed" — which is correct,
and is why the UI must not show a completion affordance on an episode
with zero questions rather than showing one that can never be satisfied.

---

## Clients

**Web.** Questions appear after the transcript on the episode route,
behind an explicit "Check what you heard" affordance rather than
auto-playing — a learner who came to listen should not be quizzed
without asking. Reuses the existing review card components.

**iOS.** The same, in `ListenView`'s episode detail. The one code change
in the review path is widening `ReviewQueueView.swift:85` from
`source == "weakness"` to `source != "lesson"`, so an embedded row of
either kind is synthesised from its own fields. `QuestionGrading.swift`
needs nothing: it grades a synthesised `mc` `Question`, and a podcast row
*is* one.

**The unattributed-review problem.** In the review queue a podcast
question arrives without its audio and without its transcript. A
comprehension question divorced from the thing it comprehends is
unanswerable by anything but memory of that specific episode. So a
podcast review card **names its episode and offers to open it**, and the
prompt is authored to stand alone ("In the coffee episode, what did the
customer order?" not "What did she order?"). That is an authoring rule
the CLI must enforce, not a hope: `validate` rejects a prompt containing
an unbound pronoun subject — and it is the single most likely thing to
be got wrong by whoever authors episode 2.

---

## CLI

`podcast-tool.ts` gains `--questions <file.json>`, validated by a new
`src/lib/podcast-questions.ts` (pure, tested) before anything is written:

- 2–6 choices, all non-empty, all distinct after trimming and case-folding
- `answerIndex` within bounds
- `explanation` non-empty
- prompt does not begin with an unbound pronoun (the rule above)
- **markup rejected, exactly as `--transcript` rejects it.** A question
  written beside a TTS script will eventually carry SSML, and the
  `MARKUP` regex in `src/lib/podcast-transcript.ts` is the tested rule;
  reuse it rather than writing a second one that drifts.
- nothing writes without `--confirm yes`, and a misparsed `--confirm`
  fails rather than silently dry-running (`podcast-cli-args.ts`)

Replacing an episode's questions is a **delete-and-reinsert inside one
transaction**, keyed by `sort_order`. Consequence stated plainly: it
orphans the `review_items` rows of anyone who already answered, because
their `item_key` points at a question id that no longer exists. Those
rows are deleted in the same transaction. Editing a published episode's
questions therefore costs those learners their progress on them — which
is the right trade against leaving them reviewing a question whose text
has changed underneath, but it must be printed as a warning naming the
affected row count before `--confirm` is honoured.

---

## Out of scope

Free-text and listening-shaped podcast questions; generating questions
from the transcript with an LLM; per-question analytics beyond what
`review_items` already carries; gating episodes behind Pro (which the
public bucket cannot enforce — see Phase 1a).

---

## Risks

1. **The episode format is going to be respecified.** The account owner
   has said the current episode shape is not what they ultimately mean
   by "podcast". Questions attach to episode *content*, so this is the
   phase most exposed to that. Mitigated by keeping the question table
   independent of episode structure — it references an episode id and
   nothing else — but not eliminated. A respec that changes what an
   "episode" is will cost this phase's content, not its schema.
2. **Review without context** — addressed above, and the authoring rule
   is the mitigation. If episode 2's questions violate it, the guard is
   wrong, not the rule.
3. **Widening a CHECK constraint that a shipped feature depends on.**
   The Hector weakness rows must keep validating identically. A test
   asserting that a `weakness` row missing `weakness_display` is still
   rejected after the migration is mandatory, and must be
   mutation-tested by removing the `weakness` clause — the migration
   guard catches order, not semantics.
