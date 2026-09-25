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

### 3.1 The mechanism is fixed — shipped in #121, not by this session

**Status update, 2026-09-25: done, superseding everything below this
line in this subsection.** This subsection originally assigned the
mechanism fix to the Spanish session, on the assumption stated at the
time ("You own this change... the English session has been told to
rebase onto your fix"). In practice the English session shipped it
first, in the same PR that also fixed all 8 of its own genuine
duplicates (#121, merged `d660a53`) — coordinated directly with this
session rather than duplicated, confirmed by diff review before
deferring to it. Recorded here so a future reader doesn't go looking
for a Spanish-owned version of this mechanism that was never built.

What actually shipped, in `curriculum-consistency.test.ts`:

```ts
const CROSS_PACK_DUPLICATE_BASELINE: Record<string, number> = {
  en: 0,
  fr: 0,
  es: 57,
};
```

**`en` is 0, not the 7 the raw scan first printed or the 9 an
intermediate correction recorded.** The full progression, kept because
each step is a real, distinct bug: `packId` was derived as
`question.id.replace(/q\d+$/, "")`, which yields `""` for a
hand-written question whose id is bare (`q7`) — collapsing every such
question into one pseudo-pack and hiding duplicates _between_
hand-written units. Falling back to the unit id took English from 7 to
9 (171 English questions had an empty `packId`; zero French or Spanish
questions did, so this bug never affected `es`'s count). #121 then
fixed all 9 English groups in the same PR — 8 genuine duplicates
(content fixed, one line each, no id moved) and 1 instructional-prompt
false positive ("Choose the correct question.", material in the
choices, same shape as `listening`/`speak`'s existing special case,
now excluded via an explicit `INSTRUCTIONAL_PROMPTS` set rather than by
tolerating a non-zero count) — landing `en` at 0.

**`es` is unmoved at 57 throughout this entire progression** — the
`packId` bug never touched it, and no Spanish content has been fixed
yet. It is this session's baseline to lower, per §3.2/§7 step 3–4, the
same way English's just went from 57-shaped to 0.

(The `INSTRUCTIONAL_PROMPTS` exemption has a real sharp edge, worth
carrying forward into Spanish's triage: it only works because it swaps
the dedup key to `prompt :: answer`, so a prompt-and-answer match still
groups and still counts. A same-prompt-different-answer pair like
`"happy"` → feliz/contento does **not** qualify for the exemption even
though it superficially resembles one — that is content, and the fix is
content, not an allowlist entry. §3.2's own table already gets this
right; the distinction is worth stating explicitly for whoever executes
the triage.)

### 3.2 The 57 split two ways, and the split is the whole job

**40 are true repeats — fixed 2026-09-25 (step 3).** Identical prompt,
identical answer, two packs. `sol`/`sol`, `escuela`/`escuela`,
`farmacia`/`farmacia`, `sea como sea`/`sea como sea`, and grammar
drills like `yo ___ (ser) estudiante.` producing `soy`/`soy`. Each was
kept at the lower-CEFR-level occurrence (tie-broken by lower pack
number) and the higher-level occurrence **replaced with a new,
verified-non-colliding line, never deleted** (§4) — 1:1, so no id
moved. Caught one self-inflicted collision during the fix: a first
verification pass used `^word|` as a shell grep pattern, which only
matches a pack's second-and-later lines (a pack's first data line is on
the same physical line as `` data: ` ``, so `^` never anchors there) —
silently missing collisions against any pack's first line. Re-verified
every replacement against the real compiled question list afterward
(not the flawed pattern) and found exactly one real miss (`valley`,
collided with `esb1p23`'s first line), fixed. `CROSS_PACK_DUPLICATE_BASELINE.es`
is now 17. No Spanish prompt qualified for `INSTRUCTIONAL_PROMPTS` —
all 57 were genuine content, not instructions in disguise.

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

**Fixed 2026-09-25 (step 4).** All 17 disambiguated by editing the
English prompt text in place — no answer changed, no side dropped, no
id moved. `CROSS_PACK_DUPLICATE_BASELINE.es` is now 0. Two entries
needed judgement beyond the table above, worth recording:

- `"on the other hand"` (the three-pack case) turned out to be a mixed
  group: two of its three occurrences shared not just the prompt but
  the _answer_ too (`por otro lado`, in `esb1p4` and `esb2p26`) — a
  true repeat hiding inside what the overall group classified as
  "contradictory" because the third occurrence (`esb2p4`, `por otra
parte`) had a different answer. Fixed by disambiguating all three
  distinctly rather than assuming the two-answer classification meant
  only one edit was needed.
- `no tener pelos en la lengua` was the one entry where "disambiguate
  the prompt" didn't fit — both occurrences were the _same Spanish
  idiom_ under two English glosses meaning the same thing, not two
  valid interpretations. Tagging the prompt (`"(bluntly)"` on a fixed
  idiom) would have been nonsensical. Treated as a step-3-shaped fix
  instead: the C1 occurrence's idiom was replaced with a different one
  (`irse de la lengua`, "to let something slip") rather than
  disambiguated, since the B1 "everyday sayings" pack is the more
  natural home for the original and duplicating one idiom under two
  glosses isn't a nuance worth preserving twice.

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

**Measured 2026-09-25 (step 6) — `src/data/spanish-distractor-quality.test.ts`.**
No POS tagger, no morphology library, no ranking change. Spanish has no
`answer-pos.ts` equivalent to measure "class" with, so this measures
the narrower, mechanically-derivable signal §8.1's original hypothesis
was actually about: for `cloze` lines whose parenthetical hint is a
genuine verb infinitive (`"Yo ___ (hacer) mi tarea."`, matched by
ending in `-ar`/`-er`/`-ir`, reflexive included — no external tool, the
hint is already in the content), is a distractor drawn from a line
testing the _same_ verb or a _different_ one?

| Metric                                           | Count | Share of resolvable |
| ------------------------------------------------ | ----- | ------------------- |
| Verb-hinted mc/fill questions measured           | 645   | —                   |
| Distractors from the same verb (`sameVerb`)      | 84    | 5.0%                |
| Distractors from a different verb (`crossVerb`)  | 1,611 | **95.0%**           |
| Unresolved (candidate's source line untraceable) | 103   | —                   |

**95% of resolvable distractors in Spanish's verb-conjugation cloze
questions come from a different verb than the one asked about.**
Confirms §8.1's hypothesis directly rather than leaving it inferred:
these questions overwhelmingly test "recognize this conjugated word,"
not "conjugate this verb correctly." Mutation-tested (narrowed the
infinitive regex to drop reflexive verbs, confirmed the count moved
from 645 to 592, reverted) so this baseline is confirmed able to catch
drift, not just able to pass once.

**Still not fixed, per this section's own instruction** — the fix
(generate a line's distractors from its own verb's other forms, the
same generative-not-tagging architecture French's own spike
recommended) needs the Spanish morphology decision from this same
section, which remains open and is not this session's to make.

**Correction to what "the fix" means — this is not a ranking problem,
and porting `orderDistractorCandidates` would not fix it.** A Spanish
conjugation pack holds one form each of several _different_ verbs
(`hablar` → `hablo`, `comer` → `como`, `tener` → `tengo`, ...), not
several forms of the _same_ verb. So a cross-verb distractor isn't the
ranking misbehaving — the pool contains almost no same-verb
alternatives to rank in the first place. This is unlike English's
`a1p15` (#117), where both word classes were genuinely present in the
pool and 25 hand labels were enough to reorder them into a working
question; here there is nothing to reorder, because the candidates a
ranking layer would need to promote mostly don't exist in the pool at
all. Porting the ranking layer onto this pool would compile, pass
review, and change nothing measurable.

The defect is real — `Yo ___ (hablar) español.` with choices
`[hablo, como, tengo, estoy]` is answerable by matching the stem alone,
testing recognition rather than conjugation, exactly the opposite of
what the pack's own note claims to teach. But the fix is **structural**,
not a ranking port: either generate same-verb distractors (which needs
the conjugation/morphology data this section has already said is not
this session's decision), or restructure conjugation packs to drill one
verb across several persons so the pool actually contains same-verb
alternatives to draw from. Both are their own scoped pieces of future
work — recorded here so the next reader reaches for one of those, not
for `orderDistractorCandidates`.

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

  **Decision (2026-09-25): standard Latin American Spanish — `tú` /
  `usted` / `ustedes` for all plural (no `vosotros`, no `vos`).** Not a
  preference call — measured against the existing bank first:
  `grep -c` on `lesson-bank-es.ts` finds `tú` 34 times, `usted` 9,
  `ustedes` 10, and **`vosotros` zero, `vos` zero**. The existing 2,540
  questions are already written in this variety, unanimously on the
  plural question (`vosotros` never appears) — adopting anything else
  for Phase 2 would introduce the first Spain/Latin-America split into a
  bank that currently has none, and would need to justify overriding
  2,540 already-shipped questions rather than 375 new ones. This also
  matches the majority-speaker variety (Latin America over Spain by
  population) and the convention most mainstream language-learning
  products default to, but neither of those is why it was chosen — the
  bank's own existing content is. Gender agreement applies as it did for
  French (_cansado_ / _cansada_).

- **`listening` second.** Minimal pairs are the good exercise here, and
  Spanish supplies excellent ones: `pero`/`perro` (tap vs. trill),
  `caro`/`carro`, `pesa`/`besa`, `cala`/`cara`. Better than
  near-identical sentences, and phonetically objective.
- **`speak` last**, after §6.1 works.

---

## 7. Sequencing

Ship each as its own PR. Do not bundle.

1. **`spanish-ids.json` baseline** (§4). Alone, no content changes. Done
   2026-09-25 (PR #122).
2. **Duplicate-check mechanism** (§3.1). Done 2026-09-25 by the English
   session (PR #121), shipped ahead of and instead of this session's own
   version — see §3.1's status note.
3. **The 40 true repeats** (§3.2), baseline `es` lowered in the same
   commit. Done 2026-09-25 — `CROSS_PACK_DUPLICATE_BASELINE.es` is 17.
4. **The 17 contradictory prompts** (§3.2). Separate from 3 because it
   is authoring judgement rather than deletion, and deserves its own
   review. Done 2026-09-25 — `CROSS_PACK_DUPLICATE_BASELINE.es` is 0.
5. **Short-pack decision** (§2) — either the fill, or a documented
   acceptance. Done 2026-09-25: accept and document (see §2's recorded
   decision).
6. **Distractor-quality measurement** (§5). Reported by assertion. Done
   2026-09-25 — 95.0% of resolvable cloze distractors are cross-verb.
   Measured, not fixed; the fix is still gated on the open morphology
   decision, and is structural rather than a ranking port (see §5).
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

---

## Appendix: folded in from the superseded 2026-09-24 draft

The account owner's instruction on superseding was to fold in "detail
this one lacks," not to re-measure everything independently. Everything
below was measured in the superseded draft and re-verified here as
still true against `6366f59` before folding; nothing here contradicts
§§1–10 above, and none of it changes any figure already stated there.

### A.1 A fourth measured candidate set: `audit-scan.ts`'s answer-leak / self-ref flags

Separate from and additional to §3's 57 duplicate-prompt groups. Run
2026-09-24 via `scripts/dump-english-questions.ts es` then
`scripts/audit-scan.ts es` (both already course-generalised, no code
change needed — confirmed by running them, not by reading the type
signature):

| Level     | Questions | answer-leak | self-ref | pos | dup-clue |
| --------- | --------- | ----------- | -------- | --- | -------- |
| A1        | 500       | 6           | 1        | 0   | 0        |
| A2        | 505       | 19          | 2        | 0   | 0        |
| B1        | 520       | 21          | 7        | 0   | 0        |
| B2        | 510       | 8           | 9        | 0   | 0        |
| C1        | 505       | 18          | 0        | 0   | 0        |
| placement | 45        | 2           | 0        | 0   | 0        |
| **Total** | **2,585** | **74**      | **19**   | 0   | 0        |

`pos` and `dup-clue` are correctly 0 everywhere — `pos` only runs for
`course === "en"`, and `dup-clue`'s English-only stopword gate (added
after it false-flagged ~15,000 French lines during the French audit) is
already in place. None of these 93 flags (74 + 19) has been triaged by
a human. **§7's sequencing does not currently include a step for this**
— it belongs alongside step 3/4 (both are "known-check found candidates,
needs human triage") and should be folded into whichever of those steps
picks it up, or added as its own step, rather than silently dropped.
`audit-scan.ts` is a triage tool, not a judge, same caveat as English's
and French's own use of it.

This also covers `placement-es.ts` (45 questions, 2 answer-leak flags)
— the superseded draft left "is placement in scope" as an open
question; this table answers "it has at least 2 flagged candidates,"
which argues for including it rather than deferring the question
further.

### A.2 Encoding baseline: 11 distinct non-ASCII characters

Scanned `lesson-bank-es.ts` byte-level, not assumed: `¡ ¿ É á é í ñ ó ú
ü →`. The arrow is the vocab-card `term → gloss` convention English and
French both use. `curriculum-consistency.test.ts` has a French-only
test ("every known accented/typographic character still appears
somewhere in the bank") guarding against an entire character class
silently disappearing (e.g. an export step stripping diacritics) — no
Spanish equivalent exists yet. Worth adding with this 11-character list
as part of whichever §7 step touches `curriculum-consistency.test.ts`
(steps 2–4 all do).

### A.3 Morphology decision (§5) — additional method detail

§5 correctly says a Spanish morphology decision is not the agent's to
make unilaterally and should only be measured, not fixed. Two points
from the superseded draft's more detailed framing of _how_ that decision
should eventually be evaluated, once someone is authorized to make it —
carried forward as context, not as new instruction:

- **Whatever candidate library is proposed must be spike-verified
  against a known-correct conjugation table across every mood/tense the
  bank's cloze packs actually use** — not just the present tense. This
  is exactly the gap French's own spike had to close after an initial,
  insufficient present-only pass (`docs/superpowers/french-distractor-quality-evidence.md`
  §8.5.4).
- **Generative, not tagging** — produce a line's distractors from its
  own hinted verb, not by tagging a pool. This sidesteps the bare-word
  hazard entirely (§5's own point about untagged candidates being a
  promotion, not an abstention) rather than mitigating it after the
  fact.
- Watch for **caller-side agreement gotchas**, the class of bug French's
  `agreeNumber` gap was — a library can conjugate correctly and still
  produce a wrong answer if the integration doesn't pass every argument
  it needs (gender _and_ number, for instance). This is a test to write
  once a library is chosen, not a property to assume.
