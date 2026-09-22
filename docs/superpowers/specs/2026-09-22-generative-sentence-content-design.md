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

**Honest framing: this pilot does not, by itself, reduce the actual
backlog pain point.** The motivating problem (`docs/BACKLOG.md`'s
native-speaker review burden on French's 500 lessons and Spanish's 508)
is specifically a French/Spanish problem, and this pilot is deliberately
English-only. Shipping the pilot proves the architecture works; it does
not reduce anyone's review workload until the same architecture is
extended to French/Spanish, which is real follow-on work, not a
formality. Don't read "pilot done" as "the backlog item is done."

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
   *  (English: 3rd-person-singular -s). Undefined for non-verb slots.
   *  NOTE: the pilot's compiler (component 4) only implements the one
   *  concrete rule svo-present actually needs -- subject-pronoun ->
   *  3rd-person-singular-or-not. The field is typed generically because
   *  the concept generalizes, but a *general* agreement-resolution
   *  engine (arbitrary slot-to-slot rules) is explicitly NOT built in
   *  this pilot -- adding a third template with a different agreement
   *  shape means extending the compiler's resolution logic, not just
   *  adding a Template entry. Flagging this now so it isn't discovered
   *  as a surprise mid-implementation. */
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
  pos: "noun" | "verb" | "adjective";
  level: Level;
  /** VERIFIED 2026-09-22 via a hands-on spike (not assumed from docs --
   *  see the compiler section below): `compromise` conjugates have,
   *  go, do, and every tested regular verb (walk/run/eat/play)
   *  correctly with NO manual override needed, once queried the right
   *  way (fixed-context derivation, see component 4). This field
   *  exists as a safety valve for a future word that needs one, but
   *  the pilot's actual starter vocab needs zero entries here -- see
   *  "be" below for the one verb that's excluded instead of overridden. */
  irregularForms?: Partial<Record<"presentThirdPerson" | "past", string>>;
  /** Topic tag(s) this word was proposed under -- lets a pack-generation
   *  run filter to vocab relevant to its topic instead of the whole
   *  dataset. Unioned, not duplicated: if a `generate` run proposes a
   *  word that already exists in the dataset (e.g. "coffee" proposed
   *  again under a new topic after already existing from an earlier
   *  run), the new topic tag is added to the existing entry's `topics`
   *  array rather than creating a second entry for the same
   *  (word, pos) pair -- entries are keyed by (word, pos). */
  topics: string[];
};
```

**Pronouns are a fixed closed class (I/you/he/she/it/we/they), not
LLM-proposed vocabulary.** An earlier draft of this spec had `"pronoun"`
as a `VocabEntry.pos` option alongside the open word classes — wrong on
review: there are 7 of them, they never change, and running them
through an LLM-propose-then-validate pipeline designed for open-ended
vocabulary growth is pointless ceremony for a fixed list. Pronouns live
as a small hardcoded constant (`PRONOUNS` in `templates.ts`, alongside
each pronoun's own agreement class — 3rd-person-singular vs. not) that
the compiler consults directly; `VocabEntry.pos` only covers the three
genuinely open classes a topic-driven LLM proposal makes sense for.

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
string. Uses `compromise` for the actual conjugation.

**Verified conjugation strategy (spiked 2026-09-22, not assumed):**
querying `compromise` with the sentence's *actual* subject pronoun and
trusting its own agreement detection is unreliable — confirmed via a
hands-on spike that `nlp("you go").verbs().toPresentTense()` incorrectly
produces "you goes" (and "you is"/"you has" for be/have), because
`compromise` treats "you" as 3rd-person-singular. A bare isolated word
is also unreliable — `nlp("go").verbs().toPastTense()` returns "go"
unchanged (no subject context to key off).

The fix: **never feed compromise the real subject; always derive both
needed forms from fixed, known-correct contexts**, and let the compiler
itself — not compromise — decide which form the actual subject needs:

```ts
function baseForm(verb: string): string {
  const doc = nlp(`I ${verb}`);
  doc.verbs().toPresentTense();
  return doc.text().replace(/^I /, "");
}
function thirdPersonForm(verb: string): string {
  const doc = nlp(`he ${verb}`);
  doc.verbs().toPresentTense();
  return doc.text().replace(/^he /, "");
}
function pastForm(verb: string): string {
  const doc = nlp(`I ${verb}`);
  doc.verbs().toPastTense();
  return doc.text().replace(/^I /, "");
}
```

Verified output for the pilot's planned starter verbs — **zero manual
overrides needed** for any of these:

| verb  | base  | 3rd-person | past    |
|-------|-------|------------|---------|
| have  | have  | has        | had     |
| go    | go    | goes       | went    |
| do    | do    | does       | did     |
| walk  | walk  | walks      | walked  |
| run   | run   | runs       | ran     |
| eat   | eat   | eats       | ate     |
| play  | play  | plays      | played  |

`agreeWith` resolution for `svo-present`: the compiler calls
`thirdPersonForm` when the subject pronoun is he/she/it, `baseForm`
otherwise (I/you/we/they) — this is the compiler's own agreement logic,
not delegated to compromise. Past-tense slots always use `pastForm`
(English past tense doesn't vary by person, confirmed in the same
spike). `irregularForms` on a `VocabEntry` remains available as an
override for a future word this derivation gets wrong, but isn't needed
for the pilot's verified starter set.

**"be" is excluded from the pilot's starter vocab, not overridden.**
Spiked result: `baseForm("be")` returns `"be"` (should be `"am"` for an
I-subject) — `compromise` handles "be"'s 3rd-person ("is") and past
("was") correctly via this same derivation, but not the full
person-varying present paradigm (am/are/is). Building override
infrastructure for one word's full paradigm isn't worth it for a pilot
proving the architecture — "be" is simply left out of the initial
curated vocab (component 2), documented here rather than silently
missing.

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

**Invariant this relies on: one `generate` run uses exactly one
template (one tense).** The CLI signature in component 6 takes a single
`--template` flag, so a generated pack's answer pool is always
tense-homogeneous by construction (all present-tense forms, or all
past-tense forms, never mixed) — this is what keeps distractors
meaningful (a wrong-verb distractor, not a wrong-tense giveaway). Worth
stating explicitly since nothing before this line made it a hard rule:
`generate` must reject a request to mix templates in one run, not
silently allow it.

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

- Unit tests for the compiler (component 4) against the verified verb
  table above (have, go, do, walk, run, eat, play) — asserts exact
  conjugated output per tense/person combination, pinned to the real
  spiked values, not assumed ones. A separate test confirms "be" is
  absent from the starter vocab (not silently included with a wrong
  conjugation).
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

## Self-critique (found on review, before implementation)

- **`compromise`'s exact API surface was unverified hands-on when this
  spec was first drafted — now resolved.** A real spike (not assumed
  from docs) found two genuine bugs the first draft's design didn't
  account for: `compromise` mis-conjugates "you" as 3rd-person-singular
  ("you goes"/"you is"/"you has"), and fails to conjugate a bare
  isolated word to past tense with no subject context at all ("go" ->
  "go", not "went"). Both are worked around by never trusting
  compromise's own subject-agreement detection — deriving both forms
  from fixed, known-correct contexts instead, with the compiler doing
  its own agreement resolution. See component 4 above for the verified
  strategy and output table. This also revealed the pilot's planned
  starter verbs need **zero** manual `irregularForms` overrides (not
  what the first draft assumed) except "be", which is excluded from the
  starter vocab entirely rather than special-cased.
- **`compromise`'s license: confirmed MIT** (checked `node_modules/compromise/package.json`
  directly during the spike) — clear to depend on.
- **Known limitation, not a bug: pilot content will be repetitive for
  small vocab sets.** A topic with only 5-8 words in the curated
  dataset produces a correspondingly small number of distinct
  sentences no matter how the sampling step sequences them. This is
  inherent to a template-driven approach at this stage (vocab growth is
  incremental, LLM-proposal-run by LLM-proposal-run) — worth setting
  expectations on this rather than promising infinite variety the pilot
  can't yet deliver. Mitigated over time by growing the curated vocab
  dataset across multiple `generate` topic runs, not something to solve
  in the pilot itself.
- **Pronouns were originally (incorrectly) modeled as LLM-proposed
  vocabulary** in an earlier draft of this spec — a closed 7-word class
  doesn't belong in an open-ended-growth dataset. Fixed above (see the
  "Pronouns are a fixed closed class" note in component 2).
- **The generic `agreeWith` mechanism oversold its own generality** in
  an earlier draft — the type suggested arbitrary slot-to-slot
  agreement rules, but the actual compiler only implements the one rule
  the two pilot templates need. Fixed above (see the note on `Slot`).

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
