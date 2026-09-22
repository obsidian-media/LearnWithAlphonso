# Design: True generative sentence-template content (pilot)

> Written 2026-09-22. Carried-from-V1/V2 backlog item
> (`docs/BACKLOG.md` §3 "Content & courses" — "True generative
> sentence-template content"). Pilot scope only: proves the
> architecture on English, not a broad multi-language rollout.

## Goal

Produce real, persisted course content — new packs that land in
`src/data/lesson-bank.ts` through the same human-gated pipeline every
hand-authored pack already goes through — using parametrized templates
with grammar-correct-by-construction sentence generation, instead of
either hand-writing every sentence or trusting an LLM to write
grammatically correct prose directly.

This is explicitly **not** a replacement for either of the two
generation mechanisms already shipped:
- `pack-tool.ts draft` (V4 #5) — LLM drafts a whole pack's lines
  freeform, still human-reviewed before `apply`.
- `generate-practice.ts` (V3 pkg 4b) — ephemeral, ungraded, never
  persisted, LLM writes complete questions per request.

Both of those trust an LLM to produce grammatically correct sentences
directly. This pilot's whole point is to stop doing that: the LLM
proposes *vocabulary and topics*, a real morphological library
*compiles* grammar. Scoped to English only — French/Spanish agreement
(gender, adjective agreement) is materially harder and deliberately
deferred until this pipeline is proven.

## Why not the alternatives

- **Fully dynamic, generate-at-request-time content** (a new runtime
  `Question` kind, questions generated per-user with no fixed id) would
  give unbounded variety, but breaks the review system's core
  assumption: `gradeReview` looks up a question by a stable
  `lessonId:questionId` key in `getCourse(course).questionIndex`
  (`review.functions.ts`), which requires a fixed, pre-known universe
  of question ids. It would also require the iOS Swift mirror
  (`scripts/export-ios-content.ts`) to understand an entirely new
  content type. Rejected as far too large a blast radius for a pilot
  whose actual goal is proving one narrow generation architecture.
- **LLM writes full sentences, a grammar checker grades/rejects after
  the fact** was considered and rejected: it still makes the LLM the
  primary author of grammar-bearing text, with validation as a
  best-effort filter rather than a guarantee. The whole reason this
  item exists is to stop relying on that.

## Architecture

```
topic (human or LLM-suggested)
        |
        v
  [LLM: propose vocab candidates]  -- word + claimed part-of-speech
        |
        v
  [compiler: cross-check POS against `compromise`'s own tagging]
        |
        +-- mismatch --> rejected, flagged for manual addition (never guessed)
        |
        v  (confirmed candidates only)
  [curated vocab dataset]  -- word, POS, irregular-form overrides
        |
        v
  [template library]  -- hand-authored grammatical skeletons, NOT LLM-proposed
        |
        v
  [compiler: `compromise` conjugates/agrees, emits "sentence|answer" lines]
        |
        v
  [sampling: seeded `hash()` picks a target-size subset from the
   combinatorial expansion]
        |
        v
  draft Pack JSON  --> EXISTING pack-tool.ts validate/preview/apply --confirm
```

The grammar skeleton (sentence structure — "subject, present-tense verb
agreeing with subject, object") is **hand-authored**, not LLM-proposed.
Grammar structure is a small, stable, human-reviewed-once asset reused
across thousands of generated sentences — exactly the kind of thing
that should not be regenerated or improvised per request. The LLM's
role narrows to what it's actually good at: proposing which *words* fit
a topic, at a scale no human wants to hand-list. This is the "hybrid"
shape: LLM proposes, library compiles — never the reverse.

## Components

### 1. Template library — `src/data/generative/templates.ts` (new)

A small, hand-authored set of grammatical skeletons per CEFR level.
Pilot ships **two templates**, enough to prove the architecture without
building a broad grammar library prematurely:

```ts
export type Slot = {
  name: string;
  pos: "pronoun" | "noun" | "verb" | "adjective";
  /** For verb slots: which other slot's word this one must agree with
   *  (English: 3rd-person-singular -s). Undefined for non-verb slots. */
  agreeWith?: string;
};

export type Template = {
  id: string;
  level: Level;
  tense: "present" | "past";
  /** Slots in left-to-right sentence order. */
  slots: Slot[];
  /** Renders slot values (already conjugated/inflected by the compiler)
   *  into the final sentence. `%1`, `%2`, ... index into `slots`. */
  render: string;
};

export const TEMPLATES: Template[] = [
  {
    id: "svo-present",
    level: "A1",
    tense: "present",
    slots: [
      { name: "subject", pos: "pronoun" },
      { name: "verb", pos: "verb", agreeWith: "subject" },
      { name: "object", pos: "noun" },
    ],
    render: "%1 %2 %3.",
  },
  {
    id: "svo-past",
    level: "A1",
    tense: "past",
    slots: [
      { name: "subject", pos: "pronoun" },
      { name: "verb", pos: "verb" },
      { name: "object", pos: "noun" },
    ],
    render: "%1 %2 %3.",
  },
];
```

### 2. Curated vocab dataset — `src/data/generative/vocab.ts` (new)

```ts
export type VocabEntry = {
  word: string;
  pos: "pronoun" | "noun" | "verb" | "adjective";
  level: Level;
  /** Only for verbs where `compromise`'s regular-conjugation rules get
   *  it wrong (be, have, go, ...). Keyed by the form compromise would
   *  otherwise mis-derive. */
  irregularForms?: Partial<Record<"presentThirdPerson" | "past", string>>;
  /** Topic tag(s) this word was proposed under -- lets a pack-generation
   *  run filter to vocab relevant to its topic instead of the whole
   *  dataset. */
  topics: string[];
};
```

This is a **new, separate dataset** from `VOCAB_IMAGES` — different
concern (grammar tags vs. stock-photo keys for image-matching
questions), and keeping it separate avoids widening the blast radius of
an already-large existing file. Ships empty (or with a small
hand-seeded starter set for the pilot's own topic) and grows only
through the LLM-propose-then-validate path below — never hand-edited
directly with unvalidated entries.

### 3. LLM proposal + validation — `src/lib/generative-vocab.server.ts` (new)

Given a topic string and the slot POS types a template run needs,
prompts an LLM (same NVIDIA NIM integration every other AI feature in
this codebase uses — `nvidia-chat-model.server.ts`) for candidate
words + claimed POS, structured-JSON-in-prose-out and defensively
parsed, same posture as `practice-generation.server.ts` and
`weakness-detection.server.ts` (never assume clean JSON from the
model; any parse/shape failure yields nothing rather than throwing).

Each candidate is then cross-checked: run it through `compromise`'s own
tagging and compare against the LLM's claimed POS.

- **Match** → candidate is accepted into the curated vocab dataset
  (pending the human `apply --confirm` gate downstream, same as any
  other content change).
- **Mismatch** → rejected outright, surfaced in the CLI output as
  "needs manual review," never silently coerced or guessed. This is
  the concrete implementation of "the LLM never writes grammar-bearing
  text directly" — an LLM POS mistake gets caught here, before it can
  ever reach a template slot.

### 4. Compiler — `src/data/generative/compile.ts` (new)

Given a `Template` and a concrete word assigned to each slot, produces
one literal `"sentence|answer"` line — the exact same shape
`bank-engine.ts`'s `packQuestions()` already parses from a `Pack.data`
string. Uses `compromise` for the actual conjugation:

- `agreeWith` resolution: for `svo-present`, the verb slot conjugates
  to third-person-singular (`-s` form) when the subject pronoun is
  he/she/it, base form otherwise — `compromise`'s `.verbs().toPresentTense()`
  family, falling back to `irregularForms.presentThirdPerson` from the
  vocab entry when the word has one (be/have/go/etc. — `compromise`'s
  regular-rule output is checked against the curated irregular-override
  table first, not trusted blind for closed-class high-frequency verbs
  where a wrong form would be maximally visible to a learner).
- Past-tense slots: `.verbs().toPastTense()`, same irregular-override
  precedence.
- The "answer" side of each generated line is the verb form alone
  (matching the existing cloze-pack convention — see `lesson-bank.ts`'s
  `___ have missed the train.|may`-style lines), with the full
  rendered sentence as the "prompt" side, blank substituted for the
  verb slot.

Distractors reuse the **already-fixed** `pickDistractors` (this
session's PR #75) unchanged — the generated batch's own pool of
correct answers (other conjugated forms in the same run) feeds it
exactly like a hand-authored pack's pool does today. No new distractor
logic needed.

### 5. Sampling — reuse `bank-engine.ts`'s `hash()`

A template × vocab-set expansion can combinatorially overproduce (e.g.
5 pronouns × 20 verbs × 30 nouns = 3000 sentences from one template).
Sampled down to a target line count (matching existing pack size,
~24-25 lines) using the same seeded `hash(pack.id + index)` utility
already used for shuffling elsewhere in `bank-engine.ts` — reproducible
across runs given the same pack id, not truly random.

### 6. CLI integration — `scripts/pack-tool.ts generate` (new subcommand)

```
bun run scripts/pack-tool.ts generate \
  --course en --level A1 --id a1genXX --template svo-present \
  --topic "daily routines" [--count 25] --out drafts/a1genXX.json
```

Wraps components 1-5 and writes a draft `Pack` JSON — **the exact same
shape** `pack-tool.ts new`/`draft` already produce. Everything
downstream is unchanged: `validate` → `preview` → `apply --confirm`,
the existing human-gated pipeline. No new Question type, no curriculum
schema changes, no changes to the review system, no changes to the iOS
Swift export (`export-ios-content.ts`) — a generated pack looks
identical to a hand-authored one once it lands in `lesson-bank.ts`.

## Error handling

- LLM call fails or returns unparseable output → `generate` reports
  zero candidates for that topic, same fail-quiet posture as
  `practice-generation.server.ts`; nothing is written.
- A vocab candidate's POS mismatch (component 3) → rejected, listed in
  CLI output, never enters the dataset.
- Template expansion under-produces (not enough vocab in the dataset
  for a slot's POS/level) → `generate` reports the shortfall count
  rather than silently emitting a smaller-than-requested pack; the
  operator adds more vocab (via another `generate` topic run) and
  retries.
- A compiled sentence's `compromise` output for an irregular verb with
  no override on file → treated as a mismatch/failure for that
  combination (skipped, not guessed) — the fix is adding the word's
  `irregularForms` entry to the vocab dataset, never trusting an
  unverified conjugation into a real pack.

## Testing

- Unit tests for the compiler (component 4) against a fixed set of
  test verbs including known English irregulars (be, have, go, do) —
  asserts exact conjugated output per tense/person combination.
- Unit tests for template expansion + sampling (deterministic given a
  fixed pack id, per existing `hash()` convention).
- Unit tests for the POS cross-check rejection path (component 3) —
  a candidate with a deliberately wrong claimed POS must be rejected,
  not silently accepted.
- Integration test: a full `generate` run (mocked LLM response, real
  `compromise` compilation) produces a draft pack that passes
  `src/data/curriculum-consistency.test.ts`'s existing checks
  unchanged — reusing that scan as the acceptance gate for generated
  content, not writing a parallel one.

## Explicitly out of scope for this pilot

- French/Spanish (harder agreement grammar — gender, adjective
  agreement — deliberately deferred until this architecture is proven
  on English's simpler grammar).
- More than two templates (svo-present, svo-past) — proving the
  pipeline, not building a grammar library.
- Any change to `pack-tool.ts`'s existing `new`/`draft`/`validate`/
  `preview`/`apply` commands, the `Pack`/`Question` types, the review
  system, or the iOS export script.
- Auto-applying generated packs without the existing human `--confirm`
  gate — a generated pack is exactly as gated as a hand-authored one.
