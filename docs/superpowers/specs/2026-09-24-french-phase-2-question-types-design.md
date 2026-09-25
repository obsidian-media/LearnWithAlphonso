# Design: French phase 2 — port the three new question types

> **Status:** not started. Handoff for the session that completed French
> phase 1 and 1.5 (merged in PR #97). Written 2026-09-24 against `main`
> at `6abb5c06`.
>
> **Scope is deliberately not incremental.** This is the full port of
> `listening`, `speak` and `translate` to French at English's scale, plus
> the generator consolidation that makes it possible. Partial delivery is
> worse than not starting: a French course with listening but no speaking
> is a course whose type coverage nobody can explain.
>
> Prerequisite reading:
> `docs/superpowers/specs/2026-09-24-french-content-audit-design.md`
> (phase 1, especially §2.2 on the duplicated generator and §7 on id
> stability — both still govern everything here).

---

## 1. What this delivers

English reached 609 lessons and six question types. French sits at 500
and three. This closes the type gap:

|                       | Now                     | After                                          |
| --------------------- | ----------------------- | ---------------------------------------------- |
| French packs          | 100 (42 cloze, 58 pair) | **115** (+5 listening, +5 speak, +5 translate) |
| French lessons        | 500                     | **575**                                        |
| French questions      | 2,500                   | **2,875**                                      |
| French question types | `mc`, `fill`, `reorder` | **+ `listening`, `speak`, `translate`**        |

Matching English exactly: 5 packs per type, 25 lines each, 5 lessons per
pack.

**This does not close the lesson-count gap** (English 609 vs French
575). That is expansion, a separate decision, and still gated on the
account owner — see §9.

---

## 2. How much is already done — verified, not assumed

Far more than the phase 1 handoff implied. Every item below was checked
in the code on 2026-09-24, not inferred from documentation.

| Capability            | State                | Evidence                                                                                                                            |
| --------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Grading dispatch      | **ready**            | `deriveAnswerCorrectness` switches on `question.type`, never on course                                                              |
| Translation AI grader | **ready**            | `src/routes/api/grade-translation.ts` already takes a `course` param and calls `getCourse(course)`                                  |
| French TTS/STT locale | **ready**            | `LOCALES = { en: "en-US", fr: "fr-FR", es: "es-ES" }`, exposed by `localeForCourse`                                                 |
| Listening audio       | **no assets needed** | `audioText` is spoken at runtime through the Web Speech API; there are no audio files anywhere in this repo                         |
| `translate` AI quota  | **ready**            | `20260926020000_translate_quota_kind.sql` keys on the kind `'translate'`, not on course. **No new migration is needed for French.** |
| Web + iOS players     | **ready**            | both render by question type; the iOS decoder likewise                                                                              |

So the runtime is genuinely course-agnostic. What is missing is the
**generator**, and one genuinely language-specific piece (§4).

---

## 3. The blocker, and where to fix it

```ts
// src/data/bank-engine.ts — what French and Spanish use
kind: "pair" | "cloze";

// src/data/lesson-bank.ts — English's own duplicated generator
cloze | pair | listening | speak | translate;
```

All three new types live **only** in English's duplicated generator,
which `lesson-bank.ts`'s own comment admits "predates the shared engine
and hasn't been consolidated onto it".

**Teach the three kinds to `bank-engine.ts`, not to `lesson-bank-fr.ts`.**

- It is the smaller change: roughly 60 lines of type-specific logic in a
  4,137-line file.
- **Spanish inherits it for free.** Doing it here is the difference
  between this being a French job and it being the second of three
  identical French, Spanish and future-language jobs.
- It starts paying down the duplication `docs/BACKLOG.md` already wants
  removed, without requiring the full English consolidation first.

Do **not** port English's `pickDistractors` while you are in there.
That carries the distractor-affinity ranking, which is English-only and
blocked on the morphology decision from phase 1.5. Consolidating the
generator and adopting the ranking layer are separate changes with
separate gates; keep them separate.

---

## 4. The hard part: French spoken-answer matching

This is the piece with no English analogue to copy, and it is why
`speak` is sequenced last.

`src/lib/spoken-answer.ts` normalises a speech-to-text transcript before
comparison. Its rules are **100% English**:

```
can't  cannot  won't  let's  n't  'll  're  've  'd  's  'm
+ the apostrophe-less spellings STT returns: cant, wont, dont, shes, im …
```

There is not one French rule in it. A French learner saying _j'ai_ whose
transcript reads _j ai_, or _je ai_, fails against every one of those
patterns.

### 4.1 What French needs that English does not

- **Elision** — `j'`, `l'`, `d'`, `c'`, `n'`, `m'`, `t'`, `s'`, `qu'`,
  `jusqu'`. Both the apostrophe form and the space-separated form STT
  produces.
- **Liaison** — audible linking (_les amis_, _nous avons_) that a
  transcript may or may not render, and which has no English counterpart
  in the existing normaliser.
- **Accents** — the existing NFD fold already handles é/è/ê correctly and
  should be reused verbatim. Verify it, do not rewrite it.
- **Number words** — reuse the _approach_, replace the vocabulary. The
  English map is `one → 1`; French needs `un/une → 1`, and `un` is also
  an article, so the same bare-word hazard that produced English's
  44.8%-tagged-Verb disaster applies. Only map where unambiguous.

### 4.2 The three-port rule applies in full

`spoken-answer` exists in **three** implementations:

```
src/lib/spoken-answer.ts                              (source of truth)
supabase/functions/grade-review/spoken-answer.ts      (Deno copy)
ios/.../LearnWithAlphonsoKit/SpokenAnswer.swift       (Swift port)
```

They exist because the player grades a spoken answer and shows the
learner a verdict, and the server then **re-derives** it. Drift means
the learner is told they were right and has the item lapsed anyway —
invisible from either side alone.

Whatever French normalisation you add must land in **all three**, with
**mirrored test vectors**, and the Deno test must be wired into
`ci.yml`'s `deno-tests` job. Phase 3's session did exactly this for
`spoken-answer.ts` — including remembering the CI step, which is the
part people forget and which makes the difference between a parity guard
and a decorative one. Copy that discipline.

### 4.3 Design the French normaliser as its own module

Do not extend the English one with a language flag. Two reasons: the
English rules are actively wrong for French (`'s → is` destroys `c'est`),
and every call site already knows its course. A sibling
`spoken-answer-fr.ts` with the same shape, selected by course, keeps
both readable and keeps English's hard-won trap list intact.

---

## 5. Content authoring, per type

English's packs carry hard-won comments. Read them before writing a
French line — they are a list of things that marked a _perfect_ answer
wrong.

### 5.1 `translate` — do this first

```
prompt: "Write this in French:"
data:   Greet someone in the morning.|Bonjour.;Bonjour à vous.;Salut.
```

Left side **describes the idea**; it must not give the sentence away, or
it is a copying exercise rather than a producing one. Right side is
semicolon-separated acceptable wordings; anything else valid is caught
by the AI grader, which is **the fallback, not the plan**.

French-specific hazards:

- **Register.** `tu` and `vous` are both correct for most prompts. Either
  list both wordings or make the register explicit in the prompt
  ("Greet someone formally"). English has no equivalent fork and its
  packs will not warn you.
- **Gender agreement.** "I am tired" is _je suis fatigué_ or _fatiguée_.
  List both, or avoid gendered adjectives in the prompt set.
- Phase 3's English work found **12 lines whose "three wordings" were
  really two**, because the test deduplicated differently from the
  matcher. Check that your three are three _after_ normalisation.

### 5.2 `listening` — cheapest, no assets

```
prompt: "What did you hear?"
data:   Elle est médecin.|Elle est médecin.
```

Near-identical pairs of similar length and register, so neither length
nor tone gives the answer away. Distractors are the other lines in the
pack, which is what keeps them plausible.

French gives you a sharper version of this than English: minimal pairs
that differ only by a sound English speakers merge — _dessus/dessous_,
_poisson/poison_, _vous/vu_, _ces/ses_. That is a genuinely better
listening exercise than English's near-identical sentences, and it is
available to you for free. Use it.

### 5.3 `speak` — last, and only after §4 works

```
prompt: "Say this aloud:"
data:   Bonjour, comment allez-vous ?|Bonjour, comment allez-vous ?
```

Same text twice: what is shown is what must be said. One breath.

English's pack documents five traps that each marked a perfect utterance
wrong. French adds its own — do not assume the English list transfers:

- **Elision and liaison**, per §4.
- **Numbers**: `un` vs the article, and 70/80/90 (_soixante-dix_,
  _quatre-vingts_) are compound and will not survive `smart_format`.
  Avoid them entirely, as English avoided compound numbers.
- **Final consonants** that STT may or may not render.

**Author speak content against the real normaliser**, not against
intuition. If a line does not round-trip through `matchesSpokenAnswer`,
it does not ship.

---

## 6. Sequencing

Deliberate, and not arbitrary:

1. **Generator consolidation** (`bank-engine.ts`). Pure refactor, no
   content judgement, no language expertise. Everything else depends on
   it, and Spanish inherits it.
2. **`translate`**. Runtime is fully ready; the AI grader already takes a
   course. English↔French pairs are the most tractable content for an
   agent to author defensibly.
3. **`listening`**. No assets, no new matching logic. French minimal
   pairs make the content genuinely good rather than merely present.
4. **`speak`**. Last, because §4 is a prerequisite and it is the only
   part needing a new module across three ports.

Ship each as its own PR. Four merges beat one 6,000-line review, and
this repo has had three consecutive PRs collide on the two lesson
players.

---

## 7. Verification

Non-negotiable gates, all four, before every PR:

```bash
bun run lint          # 1 known warning, 0 errors
bunx tsc --noEmit
bun run test
bun run build         # ONLY this catches TanStack's import-protection
```

Plus, whenever the change touches `ios/LearnWithAlphonso/Sources/`:

**the `LearnWithAlphonsoKit` test suite is not evidence about the app
target.** PR4 shipped with all 285 kit tests green and the app target
not compiling — `TranslateQuestionCard.swift` passed a `course:`
argument to a struct that had no `course` property, the 11th call site
in a sweep of 10. The kit builds fine without the app; only
`ios-app-build` compiles app-target files, and it runs in CI, not
locally (importing SwiftUI fails on a machine with no SDK, which is
exactly why nothing local caught it). So for an iOS change, **wait for
`ios-app-build` on the PR before reporting green** — grepping call
sites for consistency is not a compile.

`bun run build` is listed because phase 4's session shipped a broken
build with `tsc`, lint and tests all green — a `.client.ts` helper was
unbundleable into a server-rendered route, and nothing but the build
exercised that plugin.

Plus, specific to this work:

- **Id stability.** Adding packs is **appending**, which is safe.
  Inserting a line inside an existing pack is not. Re-baseline
  `.audit-baseline/french-ids.json`, and **diff it to confirm insertions
  only** before committing.
- **iOS bundles.** `bun scripts/export-ios-content.ts`, never hand-edit.
  CI fails on stale bundles.
- **Deno parity.** If §4 lands, `deno-tests` must run the new French
  vector file. Add the step to `ci.yml` in the same PR.
- **Mutation-test the parity guards.** Break the French normaliser
  deliberately and confirm the Deno and Swift tests go red. A parity test
  that cannot fail is worse than none — phase 1a of the podcast work lost
  a day to exactly that, with a test that asserted React reuses a DOM
  node, which it always does.

---

## 8. Non-goals

- **The distractor-affinity ranking.** Blocked on the morphology decision
  from phase 1.5. Do not port it while consolidating the generator.
- **Spanish content.** It inherits the generator work automatically; its
  content is its own later job.
- **Expansion beyond type parity.** 575 lessons, not 609. Closing the
  lesson-count gap is a separate decision.
- **Native-speaker review.** Still outstanding, still not an agent task,
  and this work _increases_ the surface it will eventually cover.
- **English's `lesson-bank.ts` consolidation.** Teaching `bank-engine.ts`
  the three kinds does not require migrating English onto it. Leave that
  backlog item alone.

---

## 9. The honest risk

This adds ~375 French questions that no native speaker has reviewed, on
top of 2,500 that no native speaker has reviewed. That is the same risk
already accepted, at a larger scale — not a new category, but worth
stating rather than discovering later.

`translate` is the most defensible of the three (English↔French pairs are
checkable), `listening` next (minimal pairs are phonetically objective),
`speak` the least (register and naturalness are exactly what an agent
cannot self-assess). If only part of this ships, that is the order of
confidence.
