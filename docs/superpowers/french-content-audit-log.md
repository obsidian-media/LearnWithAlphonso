# French Content Audit Log (Phase 1 — Structural)

> Scope: the structural axis only (spec
> `docs/superpowers/specs/2026-09-24-french-content-audit-design.md` section 5).
> Distractor quality (section 8) and linguistic correctness (section 11) are
> explicitly **not** covered here — see "What this audit does not cover" below
> before treating a clean row as a quality certification.
>
> Companion: `docs/superpowers/english-content-audit-log.md`, especially its
> "How much 'No issues found' is worth" section — the same caution applies here,
> more so, because this pass never reached the pool-semantics level the English
> audit worked at (that needs the ranking layer blocked in spec section 8).

## Coverage

Every check below enumerates the **full** compiled bank (2,500 curriculum
questions across 100 packs, plus the 45-question placement pool) — this is a
mechanical scan, not a sample, so coverage is 100% by construction for what
each check actually looks at. What each check looks at is narrower than "the
whole question," which is the point of the "What this covers" column.

| # | Check                              | What it covers                                                         | Coverage      | Verdict |
|---|-------------------------------------|--------------------------------------------------------------------------|---------------|---------|
| 1 | Malformed pack lines                | Every raw pack line splits into exactly 2 fields on `\|`                 | 100/100 packs | **Clean.** 0 malformed lines. |
| 2 | Pack line-count consistency         | Every pack has the 25 lines the generator expects                        | 100/100 packs | **Clean.** All 100 packs at exactly 25 lines. |
| 3 | Cross-pack duplicate prompts         | Same compiled prompt text appearing under >1 pack id                     | 2,500/2,500 curriculum questions | **Found 55, fixed 55 (58 line edits).** 0 remaining. |
| 4 | Answer/choice self-reference         | Correct answer, or a wrong choice, already visible in the prompt text    | 2,500/2,500 curriculum + 45/45 placement | **Found 85, fixed 57.** 28 deferred (see below). |
| 5 | Encoding integrity                  | No mojibake/replacement chars; the 18 known non-ASCII chars all survive  | Whole compiled bank + both committed iOS JSON bundles | **Clean.** 0 mojibake/replacement-char instances; all 18 characters present. |

What these checks do **not** claim: check 3 and 4 are pool/prompt-mechanical —
they cannot tell you a French sentence is *ungrammatical*, only that its
prompt collides with another pack's or leaks its own answer. Checks 1, 2 and 5
are purely structural and carry no linguistic judgment at all.

## Method

Tooling generalized from the English audit's English-named tools (spec section
9) rather than forked — `src/lib/english-content-dump.ts` and
`src/lib/english-id-parity.ts` now take a `course: Course` parameter (default
`"en"`, so English's existing behavior and committed baseline are unaffected);
`scripts/snapshot-english-ids.ts`, `scripts/dump-english-questions.ts`, and
`scripts/audit-scan.ts` take an optional course-code CLI argument.

- **Checks 1 and 2** (`packLineStats`, generalized): read raw pack source
  (`BANK_FR`), not compiled output — this is where a malformed line or a short
  pack would actually be visible; compiled output has already absorbed any
  damage by the time it's dumped.
- **Checks 3 and 4** (extended `curriculum-consistency.test.ts` +
  `scripts/audit-scan.ts`): read compiled output (`getCourse("fr")`), because
  that's what a learner actually sees — a raw pack line and its compiled
  question can differ (e.g. a `fill`-type question appends `" ___"` to the
  prompt that an `mc`-type question of the identical line does not; this is
  hash-selected per line, per `bank-engine.ts`'s `packQuestions`, so the two
  duplicate-detection passes below had to normalize trailing `"___"` away —
  the first pass didn't, and silently missed 26 of the real 55 duplicate
  groups until the normalization was added and the scan re-run).
- **`audit-scan.ts`'s `pos` check does not run for French.** It depends on
  `compromise`, an English-only NLP library (spec section 2.1); running it
  against French words would produce confidently wrong tags the same way the
  English pilot's first (bare-word) tag map did, tagging `tax`/`card`/
  `discount` as "Verb" (English audit log, "Systemic finding"). Gated to
  `course === "en"`.
- **`audit-scan.ts`'s `dup-clue` check (near-identical prompts *within* one
  pack) also does not run for French.** Its stop-word list is English-only
  (the/a/an/is/are...); against French text it filters nothing, so nearly
  every prompt pair in a pack shares enough French function words (le/la/de/
  un...) to cross the similarity threshold — a mass false-positive explosion
  (~15,000 spurious flags on first run), not a real finding. Cross-pack exact
  duplicates are covered separately by check 3, which does not depend on a
  stop-word list. Within-pack near-duplicates for French are not covered by
  any check this session — a genuine gap, not a "no issues found."
- **Check 5** was verified two ways: (a) a regex scan for the mojibake byte
  pattern (`Ã` followed by a continuation byte) and the Unicode replacement
  character `U+FFFD` across every question field, all 3 courses, 0 hits; (b)
  confirming all 18 non-ASCII characters found by scanning
  `lesson-bank-fr.ts`'s raw source (`À Ç Ê à â ç è é ê ë î ô ù û œ – — …`) are
  still present in the compiled bank's text after the pack → generator →
  `curriculumFr` pipeline, and separately in both committed
  `ios/**/curriculum-fr.json` copies after `scripts/export-ios-content.ts`.

## Findings detail

### Systemic finding: bare-infinitive hints that equal their own answer

`frb2p19` ("Faire Causatif") and `frb1p20` ("Making Suggestions & Giving
Advice") both use a cloze pattern where the parenthetical hint shows a verb's
infinitive — a convention that works everywhere else in the bank because the
expected answer is a *different* conjugated form. In these two packs, the
grammar point itself requires the bare infinitive (causative `faire` +
infinitive always takes the infinitive; "ne pas ___", "il vaudrait mieux ___",
"je te conseille de ___" etc. all take a bare infinitive too), so the hint and
the answer were identical on every affected line — the question was
answerable by copying the hint, with zero grammar knowledge required.

- **`frb2p19`: 25/25 lines affected (the entire pack).** The causative
  construction is *always* bare-infinitive, so there is no subset of "correct"
  lines here the way there is in `frb1p20`.
- **`frb1p20`: 19/25 lines affected.** The other 6 lines are genuine
  conditional-mood questions ("Si j'étais toi, je ___ (partir) tôt." →
  `partirais`) where the answer already differs from the hint; those were left
  untouched.
- **Fix applied to all 44 lines**: the French-infinitive hint was replaced
  with an English gloss of the same verb (`(prendre)` → `(to take)`), keeping
  the blank position, the sentence, and the answer identical. The pedagogical
  point survives — the learner must still supply the infinitive and would be
  wrong to conjugate it — but the hint no longer spells out the literal answer
  string.

### Systemic finding: pronoun hints that equal their own answer

`frb1p8` ("Object Pronouns") and `frb2p18` ("Double Object Pronouns") hint the
antecedent for a pronoun blank in parentheses. For 1st-person-plural (`nous`)
and the indirect-object form of 3rd-person (`lui`), French uses the *same
word* for the disjunctive pronoun (used in the hint, e.g. "à nous") and the
object pronoun (the answer, "nous") — so those specific hints leaked their own
answer. A parenthetical noun-phrase hint (`(le livre)`, `(les fleurs)`) has
the same problem when its article coincides with the pronoun answer.

- **`frb1p8`: 5 lines fixed.** 4 disjunctive-pronoun leaks (`à lui/elle`→`lui`,
  `à nous`→`nous` ×3) reworded to a concrete referent noun phrase that still
  grammatically requires the same pronoun (`à nous` → `à ma sœur et moi`, `à
  lui/elle` → `à son collègue`). 1 unrelated leak (`tous les jours` collides
  with answer `les`) fixed by swapping to the synonymous `chaque jour`.
- **`frb2p18`: 3 lines fixed**, same pattern (`(le livre)` → `(ce livre)`,
  `(les fleurs)` → `(ces fleurs)`, `(à lui)` → `(à mon collègue)`).
- **1 remaining, deferred**: `frb2p18q12` — a *distractor* (not this
  question's own hint) leaks. See "Deferred: word-class/pool-mixing" below.

### One-off redundant-word collisions (3 lines fixed)

Three isolated cases where the answer word also appeared, unblanked,
elsewhere in the same fixed sentence:

- `fra2p10`: "Avec ___, je viendrai **avec grand plaisir**." (answer
  `plaisir`) → reworded the fixed clause to "Avec ___, je viendrai
  volontiers."
- `frb1p17`: "Ils réussissent ___ finir **à temps**." (answer `à`) →
  reworded to "...finir dans les délais."
- `frc1p10`: "Le juge a prononcé un ___ **de non-lieu**." (answer
  `non-lieu`) — this one was also simply wrong: the correct French idiom is
  "prononcer un non-lieu," not "un [X] de non-lieu." Fixed by dropping the
  erroneous trailing "de non-lieu" clause.

### Placement pool (2 lines fixed, 0 remaining)

`placement-fr.ts` sits outside `questionIndex` and is hand-authored, not
pack-generated, but was scanned the same way (`buildCourseDump("fr")` includes
it separately). Two leaks found and fixed:

- `fp4`: same bare-infinitive-hint pattern as `frb1p20`/`frb2p19` — `(aller)`
  → `(to go)`.
- `fp2b`: 'Choisissez **le** bon article pour "chat":' — the instructional
  wording's own "le" coincided with the correct-article answer `le`. Reworded
  to "Choisissez l'article correct pour...".

### Cross-pack duplicate prompts (55 groups, 58 line edits, 0 remaining)

The first detection pass (comparing compiled prompt text verbatim) found 29
groups. Re-running with trailing-`"___"` normalization (see Method) found 26
more — including a 3-way group (`teacher`) the first pass had split in half
because one of the three occurrences happened to compile as an `mc` question
(no suffix) while the pack detection logic's string comparison missed it. 55
groups total, 3 of them 3-way (`teacher`, `market`, `justice`), giving 58
individual line edits.

- **46 groups were exact duplicates** (same English cue, same French answer,
  in two different packs — e.g. "lawyer" → `l'avocat` in both `fra1p10` and
  `frb2p13`). Fixed by adding a short disambiguating parenthetical to the
  cue text in the later-appearing pack only (e.g. `lawyer` → `lawyer (in
  court)`), leaving the earlier pack's plain cue and both French answers
  untouched.
- **8 groups were genuine synonym/register pairs** — both French answers are
  correct, they just aren't the same word: `teacher` → `le professeur` vs
  `l'enseignant`; `chicken` → `la poule` (hen) vs `le poulet` (chicken as
  food/animal); `driver` → `le chauffeur` (professional) vs `le conducteur`
  (anyone driving); `map` → `la carte` vs `le plan` (street/city plan);
  `schedule` → `l'emploi du temps` (class timetable) vs `l'horaire` (work
  schedule); `happy` → `heureux` vs `content`; `report` → `le rapport` vs `le
  reportage` (news report); `interview` → `l'entretien` (job interview) vs
  `l'interview` (media interview). Fixed the same way — an English-only
  clarifying parenthetical, no French text touched, since choosing "the more
  correct" synonym would be exactly the native-speaker judgment call spec
  section 11 puts out of scope; disambiguating in English sidesteps that
  question entirely rather than answering it.
- **1 group was a genuine tense ambiguity**, not a vocabulary duplicate: "Je
  ___ (aller) au marché." appeared identically in `fra2p1` (present tense,
  answer `vais`) and `frb1p1` (passé composé, answer `suis allé`), with no cue
  in the sentence to tell a learner which tense was wanted. Fixed by
  prefixing the `frb1p1` occurrence with "Hier, " (yesterday) — the same
  disambiguation `placement-fr.ts`'s `fp4` already used for the identical
  sentence before this audit touched it.

## Deferred findings (28 — measured, not fixed)

### Cognates (4) — not a defect

`fra1p2` (`six`→`six`), `fra1p17` (`internet`→`internet`), `frb1p2`
(`intelligent`→`intelligent`), `frb2p13` (`innocent`→`innocent`). The English
cue word and the correct French answer are spelled identically. This is a
property of the language pair (French/English share a large cognate
vocabulary), not a generator bug — there is no rewording that removes the
"leak" without either changing what word is being tested or misrepresenting
the vocabulary. Not fixed, not a false positive either: flagged correctly,
just not actionable.

### Word-class / pool-mixing distractor leaks (24) — blocked on spec section 8

These are the exact defect class the English overhaul's ranking layer
(`src/lib/distractor-affinity.ts`) exists to fix — and confirmed, concretely,
to still be fully present in French (spec section 2.1), because
`bank-engine.ts`'s `pickDistractors` (which `lesson-bank-fr.ts` uses) has no
ranking at all (spec section 2.2). Not fixable by rewording a line: the
distractor pool is drawn mechanically from the pack's own answer set, and the
fix is architectural (rank candidates before picking), not textual.

- **`frb2p17` "Emphatic Structures" (`C'est...qui/que`), 17/25 questions.**
  This pack's entire answer pool cycles through exactly 3 values (`C'est`,
  `que`, `qui`), and by the grammar of a cleft sentence, whichever of the
  three is blanked, at least one of the other two is *necessarily* still
  visible elsewhere in the same sentence — e.g. blank `que` in "C'est ce livre
  ___ je cherche," and the distractor `C'est` is right there in front of the
  blank. This is inherent to testing a 3-way grammatical contrast with a pool
  that only ever contains those 3 values; no per-line rewording fixes it
  without redesigning the pack (e.g. away from a repeating answer set), which
  is out of scope for a structural pass.
- **6 scattered pool/word-class-mixing coincidences**: `fra2p4` ×2 (weather
  vocabulary "aujourd'hui"/"automne" pooled as distractors for adjective/verb
  slots and coincidentally already visible in their own sentences),
  `fra2p11` (verb "envoyer" pooled as a distractor for a noun slot,
  "colis"), `fra2p16` (grammar word "que" pooled as a distractor for a verb
  slot, "partir"), `frb1p8q21` and `frb2p18q12` (a pronoun from elsewhere in
  the same pack's pool coincidentally matches a word already in that specific
  sentence).

**Both categories share one fix path**: a ranking/affinity layer in
`bank-engine.ts`, which is the recommended location precisely because it
fixes French and Spanish at once (spec section 2.2) — but building one needs a
French POS/morphology source, which is the blocked decision in spec section
8.3, shared with `docs/BACKLOG.md` §0.6.2 (extending the generative pipeline
to French/Spanish). Not started this session per spec section 8's explicit
instruction not to mix phase 1 and 8.3 in one session.

## What this audit does not cover

- **Distractor/pool semantic quality** beyond the mechanical leaks above —
  e.g. whether a `pair` pack's pooled wrong answers are *plausible* wrong
  answers for a learner, the axis the English audit spent most of its time
  on. Blocked on spec section 8.3 as described above.
- **Linguistic correctness** — grammar, naturalness, idiom, register beyond
  what a mechanical string check can catch. Spec section 11: not an agent
  task, stays on `docs/BACKLOG.md`'s "Native-speaker review pass on the
  French content bank" until a native speaker is commissioned. Nothing in
  this log should be read as certifying French grammar is correct — only that
  the specific structural failure modes listed in Coverage were checked and
  are clean or fixed.
- **Within-pack near-duplicate prompts** (the `dup-clue` check) for French —
  disabled this session, see Method. A genuine coverage gap, not a "no issues
  found."
- **Spanish** — deliberately out of scope (spec section 11), though every
  piece of tooling generalized this session (`buildCourseDump`,
  `collectCourseIds`, `packLineStats`, and the three CLI scripts) already
  accepts `"es"` and needs no further generalization to run the same 5 checks
  against it.

## Id stability

Every content fix in this pass was a same-line, same-position text
replacement — no `data` line was ever added, removed, or reordered inside a
pack. `.audit-baseline/french-ids.json` (2,500 ids) was snapshotted *before*
any content edit, per spec section 7. After all fixes,
`src/lib/english-id-parity.test.ts`'s `course "fr"` case (generalized from the
English-only version this session) diffs the live bank against that baseline
and asserts `{added: [], removed: []}` — confirmed to hold, and CI-enforced
going forward so a future edit can't silently repoint a learner's saved
review item.

## iOS bundles

Both committed copies (`ios/LearnWithAlphonso/Resources/curriculum-fr.json`,
`ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/Resources/curriculum-fr.json`)
were regenerated via `bun scripts/export-ios-content.ts` after the content
fixes, confirmed byte-for-byte identical to each other, and spot-checked for
accent survival through the export.
