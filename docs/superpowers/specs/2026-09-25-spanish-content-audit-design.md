# Design: Spanish content audit and question-type parity

> **Status:** not started. Authoritative handoff for the session that
> completed the French audit (PR #97) and French phase 2 (four PRs
> ending #115). Written 2026-09-25 against `main` at `2de245e`.
>
> **Every number in this document was measured on 2026-09-25**, not
> inherited from another document. Where it contradicts an earlier
> Spanish draft, this one is correct — see §3, which exists because a
> measurement that looked clean was not.
>
> **Supersedes** the untracked `2026-09-24-spanish-content-audit-design.md`
> in the French worktree. That draft has detail this one lacks (phase
> scoping, encoding baseline, morphology framing); fold it into this
> file and delete it, rather than keeping two.
>
> Prerequisite reading:
> `docs/superpowers/specs/2026-09-24-french-content-audit-design.md`
> and `-french-phase-2-question-types-design.md`. The id-stability rule
> and the verification gates from those two govern everything here and
> are not restated in full.

---

## 1. Why Spanish, and why now

Spanish is **live**. It is registered in `COURSES`, has
`placement-es.ts`, compiles to `curriculum-es.ts`, and ships an iOS
bundle. Learners can pick it today and 2,540 questions are in front of
them.

It is also the least examined course in the repo:

|                     | English | French | **Spanish** |
| ------------------- | ------- | ------ | ----------- |
| Units (packs)       | 126     | 115    | **130**     |
| Lessons             | 609     | 575    | **508**     |
| Questions           | 3,096   | 2,875  | **2,540**   |
| `mc`                | 1,386   | 1,303  | 1,658       |
| `fill`              | 1,333   | 1,197  | 882         |
| `listening`         | 126     | 125    | **0**       |
| `speak`             | 125     | 125    | **0**       |
| `translate`         | 125     | 125    | **0**       |
| `reorder`           | 1       | 0      | 0           |
| Audit baseline file | yes     | yes    | **none**    |

Three things fall out of that table.

**Spanish has the most packs and the fewest questions.** Not a rounding
difference: 130 packs producing 508 lessons is 3.9 lessons per pack,
against French's clean 5.0. §2 explains why.

**Spanish is 65% multiple-choice** (1,658 of 2,540) against French's
45%. A learner's experience of Spanish is materially different from
their experience of French, and nobody decided that.

**There is no `.audit-baseline/spanish-ids.json`.** English and French
both have one. This is the item that gates everything else — see §4.

`reorder` is vestigial, not a gap: English has exactly one such
question and French has none. Do not build toward it.

---

## 2. Finding 1 — 83 of 130 packs are short

Verified by parsing `lesson-bank-es.ts` directly:

| Lines per pack | Packs  |
| -------------- | ------ |
| 10             | 3      |
| 15             | 53     |
| 20             | 27     |
| **25 (full)**  | **47** |

**83 of 130 packs carry fewer than 25 lines**, totalling 2,540 lines
against the 3,250 a full bank would hold. English and French packs are
uniformly 25.

This is the headline finding, and it is upstream of the type gap: a
short pack yields fewer lessons _and_ a smaller distractor pool, and a
small pool is what produces implausible wrong answers. The three
10-line packs are the acute case — a 10-line pool drawing 3 distractors
per question reuses nearly the whole pool every time.

**Decide deliberately between two responses, and record which:**

- **Fill the short packs to 25.** Restores lesson parity (508 → 650)
  and fixes pool sizes. Appending lines to an existing pack is
  **id-safe** (§4).
- **Accept them and document why.** Legitimate if some topics genuinely
  have less to teach at that level.

Do not leave it undecided. A reader of the code today cannot tell
whether 15 was a choice or an omission.

**Decision (2026-09-25): accept, document, do not fill.** Reasoning:

1. **§10's own priority ordering argues against filling now.** Filling
   83 packs to 25 means authoring ~710 new Spanish lines — content on
   the scale of much of Phase 2 — with no native-speaker review
   commissioned. §10 is explicit that if only part of this work ships,
   it should be the audit, not the expansion; blanket-filling is
   expansion wearing a structural-fix costume. Rushing that much new
   content risks introducing the exact defect classes (§3's 57
   duplicates, the 91 answer-leak/self-ref flags in the appendix) this
   document exists to reduce, compounding rather than fixing the
   problem.
2. **It is reversible later; shipping it now is not, in spirit.**
   Nothing forecloses filling packs once a content-expansion pass is
   actually commissioned with review capacity. Filling now under audit
   cover forecloses nothing but adds unreviewed surface immediately.
3. **The severity is concentrated, not spread evenly.** Of the 83 short
   packs, 53 are 15 lines (60% of a full pool — thin, not acute) and 27
   are 20 lines (80% of a full pool — barely thin at all). Only the
   **3 ten-line packs** (`esa1p17`, `esa2p15`, `esa2p18`) are the acute
   case §2 describes, where 3
   distractors drawn from a 9-word pool (10 lines minus the correct
   answer) reuse nearly everything. A blanket fill solves a problem that
   is mostly not there to the same degree everywhere it would apply.

**What this decision does NOT defer**: the 3 ten-line packs are flagged
here as the highest-priority candidate for a future, deliberately-scoped
content-expansion pass — not fixed in this document's Phase 1, since
that is still authoring new content under the same review-capacity
constraint as point 1, but worth a session's attention before the other
80 short packs are ever revisited.

---

## 3. Finding 2 — 57 cross-pack duplicate prompts, and why nobody saw them

`curriculum-consistency.test.ts`'s "no duplicate prompt text across
different packs" gates French at zero and is **report-only for English
and Spanish** — it logs offenders to the console instead of failing.

**Vitest intercepts that console output. It has never printed.**

```
bun x vitest run src/data/curriculum-consistency.test.ts
  46/46 passed, silence

bun x vitest run src/data/curriculum-consistency.test.ts --disableConsoleIntercept
  en: 7 cross-pack duplicate prompt groups (not gated):
  es: 57 cross-pack duplicate prompt groups (not gated):
```

Confirmed independently by computing the same metric outside the test:
**en 7, fr 0, es 57.**

So the check has been producing real findings and discarding them since
it was written. A session reasonably read the silence as "zero" — and
"no output" is indistinguishable from "nothing measured."

This is the nastiest member of the family `docs/BACKLOG.md` tracks: not
a test that cannot fail, but one that **finds the defect and throws it
away**. It does not merely withhold confidence; it manufactures it.

### 3.1 Fix the mechanism first

Replace the report-only branch with an assertion against a recorded
baseline:

```ts
const BASELINE: Record<string, number> = { en: 9, fr: 0, es: 57 };
expect(crossPackDupes.length, crossPackDupes.join("\n")).toBe(BASELINE[name]);
```

**`en` is 9, not the 7 the raw scan prints, and the difference is a
second bug to fix in the same commit.** `packId` is derived as
`question.id.replace(/q\d+$/, "")`, which yields `""` for a
hand-written question whose id is bare (`q7`). That collapses every
such question into one pseudo-pack, and duplicates inside it stop
looking cross-pack. Measured: **171 English questions have an empty
packId**; falling back to the unit id raises English from 7 to 9.

**Spanish is unaffected — zero Spanish questions have an empty packId,
and `es` is 57 both before and after.** French is 0 either way. So fix
the derivation because it is wrong, not because it moves your number;
it moves only English's, which is their baseline to carry.

(The `(undefined)` answers in the printed output are a reporting
artifact of how the message extracts an answer per question type, not a
data defect. Worth fixing so real findings stop looking like noise.)

The number then lives in the file, falls as duplicates are fixed, and
**fails loudly when anyone adds a new one.** Lower `es` in the same
commit that fixes the duplicates, never separately.

**You own this change.** The English session has the same problem for
their 7 and has been told to rebase onto your fix rather than edit the
same block. Land it early and tell them.

### 3.2 The 57 split two ways, and the split is the whole job

**40 are true repeats** — identical prompt, identical answer, two
packs. `sol`/`sol`, `escuela`/`escuela`, `farmacia`/`farmacia`,
`sea como sea`/`sea como sea`, and grammar drills like
`yo ___ (ser) estudiante.` producing `soy`/`soy`. Delete one side,
prefer keeping the occurrence at the lower CEFR level, and **replace it
with a new line so the pack does not shrink** (§4).

**17 are contradictory** — same prompt, _different_ accepted answers.
These are the ones that mark a correct learner wrong, and they are not
deletions, they are prompts that need disambiguating:

| Prompt                        | Answers                                           | Why it is wrong                          |
| ----------------------------- | ------------------------------------------------- | ---------------------------------------- |
| `"happy"`                     | feliz / contento                                  | both correct, different nuance           |
| `"fish"`                      | pez / pescado                                     | live animal vs. food — _different words_ |
| `"teacher"`                   | maestro / profesor                                | primary vs. secondary                    |
| `"nurse"`                     | enfermero / enfermera                             | **gender**                               |
| `"near"`                      | cerca de / cerca                                  | preposition vs. adverb                   |
| `"prescription"`              | receta / receta médica                            | one is a superset                        |
| `"deadline"`                  | fecha límite / plazo                              | both standard                            |
| `"evidence"`                  | prueba / evidencia                                | register                                 |
| `"in other words"`            | es decir / dicho de otra manera                   | register                                 |
| `"even though"`               | aun cuando / aunque                               | both standard                            |
| `"on the other hand"`         | por otro lado / por otra parte / por otro lado    | **three** packs                          |
| `"notwithstanding"`           | pese a / no obstante lo anterior                  | register                                 |
| `"all things considered"`     | considerando todo / considerando todo lo anterior | one is a superset                        |
| `"by the same token"`         | de igual manera / de igual modo                   | free variation                           |
| `no tener pelos en la lengua` | to speak bluntly / to not mince words             | same gloss, two wordings                 |
| `to show (basic: mostrar)`    | evidenciar / revelar                              | genuinely different verbs                |
| `yo ___ (hacer) mi tarea.`    | hago / he hecho                                   | **two tenses, no tense cue**             |

The last is the clearest defect: the prompt gives no way to know
whether present or present-perfect is wanted.

**Fix by making the prompt specific** (`"nurse (female)"`,
`"fish (as food)"`, `"teacher (primary school)"`), or by accepting both
wordings where the question type supports it. Deleting one side of a
contradictory pair discards correct content and is the wrong move.

They spread evenly across all five levels (A1 42, A2 40, B1 44, B2 50,
C1 54 pack-references), so this is systemic, not one bad batch.

---

## 4. The id-stability rule, which has no guard for Spanish

Question ids are **index-derived**. Inserting or removing a line inside
a pack repoints every later id in that pack, and those ids are what
learners' saved review items reference. Repointing them silently
reassigns real people's spaced-repetition history.

**Appending is safe. Inserting is not. Deleting is not.**

This matters more for Spanish than it did for French, because
**`.audit-baseline/spanish-ids.json` does not exist.** There is no
snapshot to diff against, so today an insertion is not merely dangerous
— it is undetectable.

**This is the first task of Phase 1, before any content edit.**

1. Generate `.audit-baseline/spanish-ids.json` the same way
   `french-ids.json` was generated, and commit it on its own.
2. After every content change, regenerate and **diff it, confirming
   insertions only** — zero removals, zero repoints.
3. When §3.2 requires removing a duplicate line, **append a replacement
   rather than deleting in place**, so the pack keeps its length and
   later ids keep their positions.

Point 3 is the one that is easy to get wrong while feeling careful.

---

## 5. Finding 3 — Spanish distractors get no ordering at all

`orderDistractorCandidates` and its part-of-speech ranking live in
`src/lib/distractor-affinity.ts`, are used only by English's
`lesson-bank.ts`, and depend on `compromise`, an English-only NLP
library. Spanish and French compile through `bank-engine.ts`, which
orders only `listening` candidates (by content-word overlap) and
otherwise returns the raw hashed walk.

So every Spanish `mc` distractor is drawn with **no regard for word
class** — the exact defect English just spent phase 6 fixing for one
pack (#117, `a1p15`, 23 of 25 questions giving the answer away).

Spanish is more exposed than English was: 65% of its questions are
`mc`, and 83 packs have undersized pools.

**This is a Phase 1 finding to measure and report, not to fix yet.**
Porting POS ranking needs a Spanish morphology decision that mirrors
French's open one, and that decision is not yours to make unilaterally.
What you _can_ do, and should:

- Write a Spanish equivalent of `english-distractor-quality.test.ts`
  that **counts** cross-class distractors, reported by assertion
  against a recorded baseline (§3.1) — never by console output.
- Read `distractor-affinity.ts`'s comment about untagged candidates
  before proposing anything. An absent tag is a _promotion_, not an
  abstention; a change that removes tags makes content worse while
  looking conservative. That cost the English session 43 degraded
  questions across 11 packs.

---

## 6. Phase 2 — the three missing question types

Cheap now, and deliberately so. `bank-engine.ts:28` already declares
`"pair" | "cloze" | "listening" | "speak" | "translate"`, so the
generator work French did is inherited free. Runtime is course-agnostic:
grading dispatches on `question.type`, `grade-translation.ts` takes a
`course`, `LOCALES` already maps `es` to `es-ES`, and both players plus
the iOS decoder render by type.

Target, matching English and French exactly: **5 packs per type, 25
lines each, 5 lessons per pack** — +15 packs, +75 lessons, +375
questions.

### 6.1 What Spanish needs that is genuinely new

`spoken-answer-es.ts`, in **all three ports**, with mirrored vectors and
the Deno step wired into `ci.yml` in the same PR:

```
src/lib/spoken-answer-es.ts
supabase/functions/grade-review/spoken-answer-es.ts
ios/.../LearnWithAlphonsoKit/SpokenAnswerES.swift
```

Build it as a sibling module selected by course, exactly as
`spoken-answer-fr.ts` was — not as a flag on the English one, whose
rules (`'s` to `is`, `n't`, `'ll`) are actively wrong for Spanish.

Spanish is **easier than French here**, and the reasons are worth
knowing: no elision, no liaison, and orthography that is nearly
phonemic. The real hazards are different:

- **Seseo / ceceo.** `casa`/`caza`, `cocer`/`coser` merge for most of
  the Spanish-speaking world. STT output depends on the recogniser's
  dialect model, not on the learner's correctness.
- **b and v are the same phoneme.** `tubo`/`tuvo`, `bello`/`vello`. A
  transcript may render either.
- **ll and y (yeísmo).** Regional, and merged for most speakers.
- **h is silent.** `hola`/`ola`, `hecho`/`echo`.
- **Written accents carry meaning** — `si`/`sí`, `tu`/`tú`, `el`/`él`,
  `esta`/`está`. Reuse French's NFD fold _verbatim_; do not rewrite it.
  But note the asymmetry: accents are semantic in Spanish more often
  than in French, so folding them is right for STT comparison and wrong
  for the written `translate` type.
- **Numbers**: `un`/`una` is also an article — the same bare-word hazard
  that produced English's 44.8%-tagged-Verb disaster. Map only where
  unambiguous.

**Author `speak` content against the real normaliser.** A line that
does not round-trip through `matchesSpokenAnswer` does not ship.

### 6.2 Content hazards per type

- **`translate` first.** Register forks harder than French: `tú` /
  `usted` / `vos`, and `vosotros` / `ustedes` splits Spain from Latin
  America on the plural. **Pick one variety, state it in the spec, and
  hold it** — French only had `tu`/`vous`. Gender agreement applies as
  it did for French (_cansado_ / _cansada_).
- **`listening` second.** Minimal pairs are the good exercise here, and
  Spanish supplies excellent ones: `pero`/`perro` (tap vs. trill),
  `caro`/`carro`, `pesa`/`besa`, `cala`/`cara`. Better than
  near-identical sentences, and phonetically objective.
- **`speak` last**, after §6.1 works.

---

## 7. Sequencing

Ship each as its own PR. Do not bundle.

1. **`spanish-ids.json` baseline** (§4). Alone, no content changes.
2. **Duplicate-check mechanism** (§3.1). Alone, and tell the English
   session the moment it lands.
3. **The 40 true repeats** (§3.2), baseline `es` lowered in the same
   commit.
4. **The 17 contradictory prompts** (§3.2). Separate from 3 because it
   is authoring judgement rather than deletion, and deserves its own
   review.
5. **Short-pack decision** (§2) — either the fill, or a documented
   acceptance.
6. **Distractor-quality measurement** (§5). Reported by assertion.
7. **Phase 2**, in the order of §6: generator check, `translate`,
   `listening`, `speak`.

Steps 1 and 2 are prerequisites for everything after them. Steps 3–6
can be reordered if something argues for it; say so if you reorder.

---

## 8. Verification

The full gate set before every PR:

```bash
bun run lint          # 0 errors
bunx tsc --noEmit
bun run test          # maxWorkers is pinned since #116, so a starved
                      # green summary is no longer possible
bun run build         # only this catches TanStack import-protection
```

…and for anything touching `ios/LearnWithAlphonso/Sources/`, **wait for
`ios-app-build` on the PR.** The `LearnWithAlphonsoKit` suite is not
evidence about the app target; PR #115 shipped 285/285 kit-green with
the app not compiling.

Plus, specific to this work:

- **Re-baseline `spanish-ids.json` and diff it** before every content
  commit. Insertions only.
- **Regenerate iOS bundles** with `bun scripts/export-ios-content.ts`,
  never by hand. `curriculum-es.json` is exported and CI fails on drift.
- **Mutation-test every guard you add, on the axis it claims to
  guard.** Break the property deliberately, confirm red, revert,
  confirm green. A guard that cannot fail is worse than none, and this
  repo has produced five distinct flavours of that defect in two days.
- **Never report console output as a finding.** §3 is why.

---

## 9. Non-goals

- **Porting POS distractor ranking.** Blocked on the Spanish morphology
  decision (§5). Measure it; do not fix it.
- **`reorder`.** Vestigial — one question in English, zero in French.
- **Closing the lesson-count gap beyond the §2 decision.** 508 to 650 is
  the short-pack fill; going past English's 609 is a separate call.
- **Native-speaker review.** Still outstanding for French, still not an
  agent task, and this work enlarges the surface it will cover.
- **English's 7 duplicates.** Theirs. You own only the mechanism.

---

## 10. The honest risk

Phase 2 adds ~375 Spanish questions no native speaker has reviewed, on
top of 2,540 that no native speaker has reviewed, in a course learners
can already select. That is the same debt French carries, one course
wider.

The audit half of this work (§§2–5) _reduces_ risk — it fixes content
that is demonstrably wrong today, including 17 questions that mark
correct learners incorrect. The expansion half increases it. If only
part of this ships, **ship the audit.**

Confidence order within Phase 2 is the same as French's: `translate`
most defensible, `listening` next, `speak` least — with the added
caveat that the variety decision in §6.2 affects all three and is
harder to reverse than any single line.
