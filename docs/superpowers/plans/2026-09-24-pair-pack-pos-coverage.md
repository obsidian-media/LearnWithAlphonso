# Pair-pack part-of-speech coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `ANSWER_POS` coverage of pair-pack answers so the distractor
ranking layer stops offering wrong answers from the wrong word class, without
reintroducing the bare-word tagging failure.

**Architecture:** `scripts/gen-answer-pos.ts` currently tags only cloze answers,
because only a cloze line supplies a sentence. Pair packs are skipped, so their
answers carry no tag, so `orderDistractorCandidates` expresses no preference and
falls back to pool order. The fix is a new, non-NLP evidence source: each pair
pack's **prompt template is its author's own declaration of the answer's class**
("Which verb goes with…", "Noun form of…", "Comparative of…"). That declaration
is curated per template, fed into the same `observed` map as cloze evidence, and
subject to the same agree-or-drop rule. Genuinely mixed packs declare nothing and
stay untagged.

**Tech Stack:** TypeScript, Bun, `compromise` (generator only, never at runtime),
Vitest.

**Spec:** `docs/superpowers/specs/2026-09-23-english-content-overhaul-design.md`
(Phase 1 correctness audit; this closes its last deferred structural item).
Audit log: `docs/superpowers/english-content-audit-log.md`.

> **Superseded in execution — read this first.**
>
> The plan's central mechanism was withdrawn after whole-branch review measured
> it. Both of its load-bearing claims were wrong, and both were wrong in ways the
> plan's own self-critique did not reach, so they are worth stating plainly.
>
> **1. Reading a pair pack's prompt template as a declaration of its answers'
> class is inert.** "Which verb goes with ...?" cannot be answered by a noun, so
> the declaration is *true* — but a declaration applies to every answer in the
> pool equally, and distractor ranking is relative *within* the pool. A uniformly
> tagged pool ranks exactly as an untagged one does. Ablated: nulling all 27
> template declarations left a1p15's cross-class count unchanged. The 22 packs it
> covered are exactly the packs that never had the defect, and the packs that have
> it are the mixed ones no template can describe. The plan never asked whether a
> uniform tag *could* change an outcome; it only checked whether the tags were
> accurate.
>
> **2. "A wrong tag is worse than no tag" — stated in Global Constraints below, and
> in three source files — is false for a candidate.** `rank()` resolves an
> untagged candidate to the ANSWER's own class, so a candidate with no tag sorts
> as a perfect distractor. Withholding a tag is not an abstention, it is the
> strongest possible endorsement. The declarations collided with sentence evidence,
> the agree-or-drop rule discarded 12 words, and those words were promoted into
> pools where they are ungrammatical: measured **43 questions degraded across 11
> packs, 0 improved**, against 16 fixed in a1p15. The generator printed the 12
> losses and the commit described them as "the conservative rule working".
>
> **What shipped**: only Task 1's Step 2 idea survives — hand labels for pools that
> genuinely mix classes — emitted as a per-pack override map the course-wide map
> never sees, so a label cannot be dropped and no other pack can change. a1p15
> goes 23/25 → **0/25**, and its 25 questions are the only ones in the course whose
> choices move. Two further alternatives were measured and declined: demoting
> untagged candidates (150 of 2,675 questions would draw the same handful of
> distractors every time) and scoping the whole map per pack (loses the
> corpus-wide agreement check, which doubles as an accuracy filter — it tagged
> `coins` a Verb from "Can I pay in ___ instead of cash?").
>
> The tasks below are left as written. They are the record of a plan that was
> careful about the wrong thing: it ablated two tagging approaches, refused to
> touch pack data, and was honest about which tests proved what, while never
> opening the six-line function whose default decided the whole design.

## Global Constraints

- **English only.** `lesson-bank-fr.ts` / `-es.ts` are untouched.
- **No line may be added, removed or reordered in any pack.** Question ids are
  index-derived (`${pack.id}q${i}`) and are real users' review-item keys. This
  plan changes **no pack data at all** — only generator config and the generated
  map.
- **A wrong tag is worse than no tag.** No tag declines to express a preference;
  a wrong tag actively promotes a bad distractor. Leave untagged rather than
  guess. This is the existing generator's rule and it is preserved.
- **Never tag from a bare word, and never tag from a synthetic sentence frame.**
  Both were measured (see Evidence): bare-word tagging is wrong on
  `square`/`circle`/`cube`/`rock`/`eyes` (all → Verb), and a frame does not read
  a word's class, it *imposes* one — `They X.` tags 16 of this corpus's nouns as
  verbs, `It is X.` tags every verb as a noun.
- **Verification must be independent of the map.** Anything that consumes
  `ANSWER_POS` also sorts by it, so those tests can only confirm the sort obeyed
  the map. Ground truth is hand-labelled, written from the packs.
- **Multi-word answers are not tagged.** `tagInContext` reads the answer's first
  word; for a gloss answer ("every single time") that is meaningless.

## Evidence (measured before planning, 2026-09-24)

Cross-class distractors in a1p15, the pack the audit flagged:
**23 of 25 questions** offer one. `a1p15q19` "is a perfect cube shape" offers
`[cube, huge, narrow, average]` — three of four choices are size adjectives, so
the answer needs no geometry.

Tagging accuracy on a 45-word hand-labelled sample spanning 15 pair packs:

| source | tagged | accuracy | wrong on |
|---|---|---|---|
| bare word | 45/45 | 89% | square, cube, rock, eyes → Verb; ascertain → Noun |
| frame `It is X.` | 45/45 | 93% | catch, ascertain, assist → Noun (all verbs) |
| frame `The answer is X.` | 45/45 | 87% | + went, ate, bought → Adjective |
| frame `They X.` | 45/45 | 64% | 16 nouns → Verb |

A frame's accuracy is a function of the frame's own syntax, not the word. Hence
the declared-class approach below, which uses no NLP at all for pair packs.

Corpus: 850 pair lines, 610 with single-word answers, 712 distinct answers
currently carrying no tag.

## Review Focus

Five ways this could bite a learner that no task's happy path exercises:

1. A pack's content disagrees with its template's declaration (one noun in a
   "Which verb…" pack) — every answer in that pack then gets a wrong tag at
   once. Task 2 adds a per-pack agreement guard.
2. The new tags push one class over the dominance tripwire's 44% bound, and the
   bound gets raised to make the change pass — silently disabling the only guard
   against bare-word regression. Task 3 replaces the proxy with a named check.
3. A word legitimately used as two classes in two packs (`light` is a noun in
   a1p18 and an adjective in a1p15) gets arbitrated rather than dropped. Task 1
   keeps the agree-or-drop rule and Task 3 pins an example.
4. `b2p2 "Which fits: …?"` is *deliberately* cross-class (affect/effect, its/it's).
   Tagging it would demote exactly the distractors that make it a real question.
   Task 1 excludes it explicitly, Task 3 pins that it stays untagged.
5. Ranking changes which distractors appear, so any test snapshotting choices
   will move. Task 4 re-runs the id-parity and content-dump checks and confirms
   no question changed *type* or id (only `useMc`'s `distractors.length < 3`
   branch could do that, and ordering cannot change the count).

## Self-critique (run against this plan before executing)

Four problems found in the first draft, all fixed above:

1. **The template table was incomplete.** It omitted the six gloss-phrase
   templates, so Task 2's coverage test would have failed on its own plan.
2. **The merge could silently drop tags the map has today.** Unmeasured in the
   first draft; measured now at 12 words, all genuine homographs, 0 flips.
3. **The dominance guard was going to fire.** The first draft said "loosen it if
   it still says something true", which is the shape of a decision made to get
   green. Measured (45.7% Noun) and replaced with a named check plus a bound that
   still asserts something.
4. **It was about to accuse the audit of misdiagnosing a1p15.** The audit's
   diagnosis was right; only its proposed remedy is stale.

One risk checked and found absent: French and Spanish do **not** share this
ranking layer — `bank-engine.ts` deliberately uses the language-neutral
`orderByLexicalSimilarity` instead, so growing the English map cannot touch them.

---

### Task 1: Declared-class evidence from pair templates

**Files:**
- Modify: `scripts/gen-answer-pos.ts`
- Regenerate: `src/data/answer-pos.ts`

**Interfaces:**
- Produces: a larger `ANSWER_POS` with the same `Record<string, string>` shape,
  so no consumer changes.

- [ ] **Step 1: Add the declared-class table**

Keyed by the exact `pack.prompt` template, with `null` meaning "declares
nothing". A template absent from the table is also untagged, so a new pack's
answers are never tagged by accident.

```ts
/**
 * A pair pack's prompt template is the author's own statement of what the
 * answer is: "Which verb goes with ...?" cannot be answered by a noun. That
 * makes it evidence about word class with no NLP in the loop, which matters
 * because every automated alternative was measured worse: tagging the bare word
 * calls `square`, `circle`, `cube`, `rock` and `eyes` verbs, and dropping the
 * answer into a synthetic frame does not read its class but imposes one
 * (`They X.` tags 16 of this corpus's nouns as verbs).
 *
 * `null` means the template declares nothing and its answers stay untagged.
 * Absence from this table means the same, so a newly authored pack is never
 * tagged by accident.
 */
const DECLARED_BY_TEMPLATE: Record<string, string | null> = {
  'Plural of "%s":': "Noun",
  'Female form of "%s":': "Noun",
  'Someone who "%s" is a…': "Noun",
  'An animal that "%s" is a…': "Noun",
  'Which noun goes with "%s"?': "Noun",
  'The body part "%s" is your…': "Noun",
  'This hobby involves "%s"…': "Noun",
  'Which sport or hobby uses "%s"?': "Noun",
  'Noun form of "%s":': "Noun",
  'The noun form of "%s" is…': "Noun",
  'Complete: "%s ___"': "Noun",
  'Complete the collocation with "%s"…': "Noun",
  'Which verb goes with "%s"?': "Verb",
  'Past simple of "%s":': "Verb",
  'Which verb means "%s"?': "Verb",
  'Formal equivalent of "%s":': "Verb",
  'Opposite of "%s":': "Adjective",
  'Comparative of "%s":': "Adjective",
  'Superlative of "%s":': "Adjective",
  'Which trait means "%s"?': "Adjective",
  'Which word pairs with "%s"?': "Adjective",
  // Declares nothing, deliberately:
  'Something that "%s" is…': null, // a1p15 mixes shape nouns and size adjectives
  'Which word completes "%s"?': null, // b1p5 holds nouns and "agree"
  'Which fits: "%s"?': null, // b2p2 IS cross-class on purpose (affect/effect, its/it's)
  '"%s" means:': null, // gloss phrases
  'The phrase "%s" is a polite way of saying…': null,
  // Gloss-phrase packs: the answer is a definition, so tagging its first word
  // says nothing ("every single time" -> Determiner). Present as explicit nulls
  // so the coverage test in Task 2 passes and a future pack is not silently
  // skipped.
  'How often does "%s" happen?': null,
  'Someone who is "%s" tends to…': null,
  'The expression "%s" means…': null,
  'The connector "%s" is used to…': null,
  'The phrasal verb "%s" means…': null,
  'The idiom "%s" means…': null,
};
```

All 34 pair templates must appear here. Measured: with the table above, zero
templates are unclassified.

- [ ] **Step 2: Add the per-pack override for genuinely mixed packs**

a1p15 is the pack the audit flagged and the only one where the defect is real
*and* the pool is honestly two classes. Its words are hand-labelled here rather
than in the pack data, so no line moves and no id shifts.

```ts
/**
 * Hand-labelled answers for packs whose pool is genuinely two classes, so no
 * template-level claim can cover them. Labelled by reading the pack.
 *
 * a1p15 is the audit's one deferred defect (docs/.../english-content-audit-log.md).
 * Its note says the pack "needs a split"; that is stale — a split would move
 * lines and repoint every later question id, and it was never the only option.
 * The defect is that these answers carry no tag, not that they share a pack.
 *
 * b2p2 is deliberately NOT here: its cross-class choices are the exercise.
 */
const DECLARED_BY_PACK: Record<string, Record<string, string>> = {
  a1p15: {
    triangle: "Noun", square: "Noun", circle: "Noun", rectangle: "Noun",
    pentagon: "Noun", hexagon: "Noun", oval: "Noun", octagon: "Noun",
    cube: "Noun", sphere: "Noun", cone: "Noun", cylinder: "Noun",
    huge: "Adjective", tiny: "Adjective", thin: "Adjective", thick: "Adjective",
    long: "Adjective", short: "Adjective", towering: "Adjective",
    narrow: "Adjective", broad: "Adjective", light: "Adjective",
    heavy: "Adjective", average: "Adjective", oversized: "Adjective",
  },
};
```

- [ ] **Step 3: Feed pair evidence into the same `observed` map**

Single-word answers only, and through the *same* map so the existing
agree-or-drop rule arbitrates nothing:

```ts
    if (pack.kind !== "cloze" || !left.includes("___")) {
      // Pair evidence: the template's declaration, or a hand label for a pack
      // that declares nothing. Deliberately routed through the same `observed`
      // map as cloze evidence, so a word tagged one way here and another way by
      // a sentence is DROPPED rather than arbitrated -- `light` is a noun in
      // a1p18 and an adjective in a1p15, and neither pack should win.
      const declared =
        DECLARED_BY_PACK[pack.id]?.[answer] ??
        (pack.kind === "pair" ? DECLARED_BY_TEMPLATE[pack.prompt ?? ""] : null);
      if (declared && !/\s/.test(answer)) {
        if (!observed.has(answer)) observed.set(answer, new Set());
        observed.get(answer)!.add(declared);
        pairTagged++;
      } else {
        pairSkipped++;
      }
      continue;
    }
```

- [ ] **Step 4: Regenerate and check against the measured expectations**

Run: `bun run scripts/gen-answer-pos.ts`

Measured in advance, so a different result means the implementation diverged
from the design rather than the design being wrong:

- 530 pair lines tagged, 695 skipped (multi-word answers and undeclared templates)
- map size **1098 → 1507**
- **0 tags changed.** No word's tag may flip. Only additions and drops are
  legitimate: a flip would mean pair evidence overrode sentence evidence, which
  the agree-or-drop rule forbids. Assert this rather than eyeballing it.
- **12 tags lost** to new conflicts: `lives, closed, leaves, light, swimming,
  painting, long, complete, increase, decline, far, head`. Every one is a real
  homograph in this corpus ("leaves" the plural noun vs. the verb, "swimming" the
  sport vs. the verb, "decline" the formal verb vs. the noun), so each was
  previously tagged with a confidence the corpus does not support. Losing them is
  the conservative rule working; it costs a preference on ~1% of the map and
  removes twelve chances to promote a wrong-class distractor.

Add the generator log line for lost/changed counts so a future regeneration
surfaces the same figures.

- [ ] **Step 5: Commit**

```bash
git add scripts/gen-answer-pos.ts src/data/answer-pos.ts
git commit -m "feat: tag pair-pack answers from what their template declares"
```

---

### Task 2: Guard that a pack's content agrees with its template

**Files:**
- Create: `src/data/pair-pack-class.test.ts`

**Interfaces:**
- Consumes: `BANK` from `src/data/lesson-bank`, and the exported tables from
  Task 1 (export `DECLARED_BY_TEMPLATE` from a small module both the script and
  the test can import — `src/data/pair-answer-class.ts` — so the test is not
  importing a script).

Note: Task 1 Steps 1-2 place the tables in `scripts/`. Move them to
`src/data/pair-answer-class.ts` and import them from the script, so this test
can read them without importing a generator that writes files on import.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { BANK } from "./lesson-bank";
import { DECLARED_BY_TEMPLATE } from "./pair-answer-class";

/**
 * A declared class applies to a whole pack at once, so one mismatched line
 * mis-tags every answer in it. This asserts the DECLARATION is honest, using
 * hand-written expectations -- not ANSWER_POS, which is generated FROM the
 * declaration and would agree with it by construction.
 */
describe("pair templates declare a class their content can satisfy", () => {
  it("never declares a class for a pack whose pool mixes classes", () => {
    // Hand-listed: packs whose pools are genuinely heterogeneous, read off the
    // content. Each must declare nothing.
    for (const id of ["a1p15", "b1p5", "b2p2", "b1p1", "c1p1", "c1p18"]) {
      const pack = Object.values(BANK).flat().find((p) => p.id === id)!;
      expect(DECLARED_BY_TEMPLATE[pack.prompt ?? ""] ?? null, `${id} must declare nothing`).toBe(
        null,
      );
    }
  });

  it("covers every pair pack, as a declaration or an explicit null", () => {
    // Forces a NEW pack to be considered rather than silently untagged.
    for (const pack of Object.values(BANK).flat()) {
      if (pack.kind !== "pair") continue;
      expect(
        Object.prototype.hasOwnProperty.call(DECLARED_BY_TEMPLATE, pack.prompt ?? ""),
        `${pack.id}'s template is unclassified: ${pack.prompt}`,
      ).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `bunx vitest run src/data/pair-pack-class.test.ts`
Expected: FAIL — `pair-answer-class` does not exist yet.

- [ ] **Step 3: Extract the tables into `src/data/pair-answer-class.ts`** and
  import them from `scripts/gen-answer-pos.ts`.

- [ ] **Step 4: Run and watch it pass.** Then **mutate**: declare
  `'Something that "%s" is…': "Noun"` and confirm test 1 goes red naming a1p15.
  Restore.

- [ ] **Step 5: Commit**

---

### Task 3: Verification that is independent of the map

**Files:**
- Modify: `src/data/answer-pos.test.ts`

- [ ] **Step 1: Extend the hand-labelled sample to pair answers**

Add the 45 words measured in Evidence, labelled as they read in their own pack.
The existing 80% threshold stays; record the achieved figure in the test comment.

- [ ] **Step 2: Replace the dominance tripwire with a named regression check**

The 44% bound is a proxy for "the generator regressed to bare words", and it
**does** fire here: Noun is measured at **45.7%** (689 of 1507), because 13 of the
22 declared packs are nominal. Verb *falls* to 30.8% from roughly 37%, which is
the opposite of the bare-word signature — so the guard fires on a change that
moves the corpus away from the failure it was built to detect. That is a false
positive, and "raise the bound until it passes" would leave a number that means
nothing. Replace the proxy with a check that names the failure, and keep a much
looser bound purely as a catastrophic-regression tripwire:

```ts
  it("does not tag as verbs the nouns that bare-word tagging calls verbs", () => {
    // These five come back Verb from `compromise` with no context -- measured,
    // 2026-09-24 -- and the 44.8%-Verb map tagged them that way. This detects
    // that regression directly, rather than through a share-of-map proxy that
    // moves whenever content composition does.
    for (const word of ["square", "circle", "cube", "rock", "eyes"]) {
      expect(ANSWER_POS[word], `${word} is tagged Verb -- bare-word regression?`).not.toBe("Verb");
    }
  });
```

Keep the dominance check, at a bound that still asserts something true — no tag
above 60%, which catches "the generator collapsed to one tag" while not firing on
a corpus that is legitimately 46% nominal. Record in the comment that the 44%
figure was chosen to sit under a *measured* bad map and that the named check
above now carries that job, so the number moving is a narrowing of this test's
claim, not a weakening of the suite.

Verify by re-pointing the test at the old bare-word map if one can be
reconstructed cheaply; if not, the mutation is to hand-edit `answer-pos.ts` so
`square`/`circle`/`cube` read `Verb` and confirm the named check goes red while
the dominance check stays green — which is exactly the point of replacing it.

- [ ] **Step 3: Pin the agree-or-drop behaviour**

```ts
  it("drops a word two packs class differently", () => {
    // `light` is a noun in a1p18 ("Which noun goes with 'not heavy'") and an
    // adjective in a1p15. Neither pack should win, so it must carry no tag.
    expect(ANSWER_POS["light"]).toBeUndefined();
  });
```

- [ ] **Step 4: Run, then mutate each new assertion** and confirm it fails for
  the reason it claims.

- [ ] **Step 5: Commit**

---

### Task 4: Measure the improvement and prove nothing shifted

**Files:**
- Create: `src/data/pair-distractor-quality.test.ts`

- [ ] **Step 1: Write the cross-class metric as a test**

Hand-listed shape nouns, so the metric does not read the same table the ranking
reads:

```ts
const A1P15_SHAPES = new Set([
  "triangle", "square", "circle", "rectangle", "pentagon", "hexagon",
  "oval", "octagon", "cube", "sphere", "cone", "cylinder",
]);

it("stops offering size adjectives as distractors for shape questions", () => {
  // Was 23 of 25 before pair answers were tagged: "is a perfect cube shape"
  // offered [cube, huge, narrow, average], so the answer needed no geometry.
  let crossed = 0;
  let total = 0;
  for (const q of questionsFromPack("a1p15")) {
    const choices = q.type === "mc" ? q.choices : q.bank;
    const answer = q.type === "mc" ? choices[q.answer]! : q.answer;
    const answerIsShape = A1P15_SHAPES.has(answer.toLowerCase());
    total++;
    if (choices.some((c) => c !== answer && A1P15_SHAPES.has(c.toLowerCase()) !== answerIsShape)) {
      crossed++;
    }
  }
  expect(total).toBe(25);
  expect(crossed).toBeLessThanOrEqual(4);
});
```

The bound is set from the measured result, not the other way round: run it
first, record the actual figure, then set the bound at that figure and note the
before/after in the comment. If the result is not a large improvement, the
approach is wrong and this task fails rather than the bound moving.

- [ ] **Step 2: Confirm no id or question type moved**

Run: `bunx vitest run src/lib/english-id-parity.test.ts src/lib/english-content-dump.test.ts src/data/curriculum-consistency.test.ts`
Expected: PASS with no re-baselining. Ordering cannot change
`distractors.length`, so `useMc` cannot flip a question between mc and fill —
confirm that claim holds rather than assuming it.

- [ ] **Step 3: Commit**

---

### Task 5: Documentation

**Files:**
- Modify: `docs/superpowers/english-content-audit-log.md` (the a1p15 entry and
  the "Deferred structural changes" section — both say the pack needs a split,
  which is stale and would shift ids)
- Modify: `ARCHITECTURE.md`, `CHANGELOG.md`, `AGENTS.md` as the change requires

- [ ] **Step 1: Correct the audit log's a1p15 verdict.** Be accurate about what
  was wrong with it: the audit **did** diagnose the cause correctly — its note
  already says "its answers appear only in 'pair' lines, which carry no sentence,
  so they are deliberately left untagged and no preference is expressed." What is
  stale is the *remedy*: "needs a pack split", which would move lines and repoint
  every later question id. Record the measured before/after and that no split is
  needed. Do not imply the diagnosis was wrong; it was the reason this fix was
  findable at all.
- [ ] **Step 2: Note the frame finding** — that a synthetic sentence frame
  imposes a class rather than reading one — next to the existing bare-word note,
  since it is the same trap and the next person will reach for a frame.
- [ ] **Step 3: Full verification** — `bunx tsc --noEmit`, full `bunx vitest
  run` (sequential, nothing backgrounded), `bun run lint`, `bun run build`, and
  `bun scripts/export-ios-content.ts` for drift.
- [ ] **Step 4: Commit**
