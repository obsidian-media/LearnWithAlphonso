# French distractor-quality evidence (for the section 8.3 decision)

> **Status: evidence only. No implementation.** This document exists to give
> the account owner what's needed to decide spec section 8.3 — whether to
> adopt a French morphology/POS source, and if so which one. It does not
> implement a ranking layer, does not modify `bank-engine.ts`, and does not
> add any dependency to this repo's `package.json`. If a source is adopted,
> ranking belongs in `bank-engine.ts` (spec section 2.2) — it fixes French
> and Spanish at once, and does not require consolidating English's own
> generator onto the shared engine first.
>
> Spec: `docs/superpowers/specs/2026-09-24-french-content-audit-design.md`
> section 8.3. Companion: `docs/superpowers/french-content-audit-log.md`
> (phase 1, structural — already complete, not re-opened by this document).
> This is explicitly **not** phase 2 and **not** expansion (new packs,
> listening, speaking) — both stay out of scope per the spec's own
> instruction not to mix phase 1 and section 8.3 work in one session, and
> per the account owner's expansion gate below.

## 0. The account owner's answer to spec section 12, question 1

**French is meant to reach parity with English.** This unblocks planning for
listening/speaking content and further pack expansion, but does not start
that work — it's recorded here for the record and reflected in the spec's
open-questions section; the work itself is a separate initiative gated on
its own kickoff, not something this document begins.

---

## 1. Cloze pack classification (all 42 packs)

**Method**: every cloze pack's raw `data` was read in full (not sampled) and
each line's answer classified by grammatical function. A pack is:

- **single-verb** — every line conjugates the *same* verb (a full paradigm
  drill across persons/tenses).
- **mixed-verb** — every line's answer is a verb form, but different lines
  test different verbs.
- **single-class, non-verb** — every line's answer is the same non-verb
  grammatical category (a closed set: pronouns, prepositions, negation
  particles, etc.), not verbs at all.
- **mixed-class** — the pack's answer pool spans genuinely different word
  classes (nouns, verbs, adjectives, adverbs mixed together) — this is the
  category the English overhaul's ranking layer specifically exists to fix
  (spec section 2.1).

| Category | Count | Packs |
|---|---|---|
| **single-verb** | **1** | `fra2p7` (aller + infinitive, near future — the *same* verb "aller" conjugated across all 6 persons, repeated 4x) |
| **mixed-verb** | **18** | `fra2p1`, `fra2p6`, `fra2p12`, `frb1p1`, `frb1p4`, `frb1p5`, `frb1p6`, `frb1p18`, `frb1p20`, `frb2p1`, `frb2p5`, `frb2p6`, `frb2p7`, `frb2p8`, `frb2p19`, `frc1p6`, `frc1p17`, `frc1p20` |
| **single-class, non-verb** | **8** | `fra2p14` (possessive adjectives), `fra2p15` (negation: pas/jamais/plus/rien/personne), `frb1p7` (relative pronouns: qui/que/où/dont), `frb1p8` (object pronouns), `frb1p9` (y/en), `frb1p17` (à/de), `frb1p19` (depuis/pendant/il y a), `frb2p17` (cleft markers: C'est/qui/que) |
| **mixed-class** | **15** | `fra2p3`, `fra2p4`, `fra2p8`, `fra2p9`, `fra2p10`, `fra2p11`, `fra2p16`, `frb1p3`, `frb2p3`, `frb2p4`, `frb2p18`, `frc1p2`, `frc1p5`, `frc1p10`, `frc1p19` |

**1 + 18 + 8 + 15 = 42.**

### What this distribution means for the fix

Spec section 8.1 poses the question this classification answers: is
French's failure mode single-verb (needs conjugation-variant distractors),
mixed-verb (still needs conjugation-variant distractors, but per-line
rather than pack-wide), or mixed-class (needs word-class discrimination,
the same defect class English's ranking layer fixes)?

**The answer is: mostly neither in isolation.** 19 of 42 packs (1 single-verb
+ 18 mixed-verb, 45%) are pure verb-conjugation packs where every answer is
some form of *some* verb — these need a **generative** fix (produce other
forms of the *correct line's own verb* as distractors), not a classification
fix, because there is no non-verb pool contamination to filter out. 15 of 42
(36%) are genuinely mixed-class and need the classification fix English
built. The remaining 8 (19%) are single-class-but-non-verb packs (pronouns,
prepositions, negation particles) — neither fix directly applies; their risk
is structural collocation, not pool contamination (see `frb2p17` below).

This was corroborated empirically, not just inferred: every mixed-class pack
that also appeared in phase 1's self-ref scan (`fra2p4`, `fra2p8`... — see
`frb2p18`, `fra2p4`×2, `fra2p11`, `fra2p16` in the deferred findings of
`french-content-audit-log.md`) is flagged there for exactly the word-class
pool-mixing pattern this classification predicts. **`frb2p18` "Double Object
Pronouns" is the clearest confirmed case**: its answer pool literally mixes
bare pronouns (`le`, `l'`, `les`, `lui`) with full conjugated verb phrases
(`as dit`, `a envoyés`, `donnerai`...) in one pool — the exact defect class,
concretely present.

**`frb2p17` "Emphatic Structures" is a distinct, worse pattern** that neither
"mixed-class" nor a morphology fix addresses: its single-class pool of only
3 values (`C'est`/`que`/`qui`) means that whichever one is blanked, a cleft
sentence's grammar *guarantees* at least one of the other two is already
visible elsewhere in the same sentence — 17 of its 25 questions are
self-referential for this reason (phase 1's largest single deferred finding).
No distractor-ranking layer fixes this; it needs either a redesigned answer
pool or accepting the defect as structural to the grammar point being
tested. Flagging this explicitly so it isn't assumed solved by whatever
section 8.3 decides.

---

## 2. Self-referential answer/choice ratio, measured

Reconciling terminology first: spec section 6.3 item 4 calls this "answer
appearing in its own prompt," but English's audit log measured something
narrower — **distractors** echoing a prompt word (a1p3's "old"/"old" case),
not the correct answer itself. Phase 1's tooling measures both, as distinct
flag kinds (`answer-leak` vs `self-ref`), because French's biggest finding
(the `frb2p19`/`frb1p20` bare-infinitive-hint pattern, 44 instances) is an
**answer**-leak, a category English's original check never had reason to
look for (no English pack's hint format could equal its own answer the way
a French infinitive hint can equal a French infinitive answer).

| Metric | English (measured in the overhaul) | French (measured this audit) |
|---|---|---|
| Denominator | 1,387 MC questions specifically | 2,500 questions (all types) |
| Before any fix | 12 (distractor-echoes-prompt only) | 85 total (60 answer-leak + 25 self-ref/distractor-leak) |
| After fix | 5 (fixed by the ranking layer) | 28 total (4 answer-leak + 24 self-ref/distractor-leak) |
| What fixed it | Ranking layer (`distractor-affinity.ts`) | **Content edits only** — no ranking layer exists for French |

**The comparable number to English's "12 → 5" is French's self-ref
(distractor-leak) count: 25 → 24, effectively unchanged**, because nothing
in phase 1 touched `bank-engine.ts`'s `pickDistractors` — the one placement
fix that happened to be self-ref-type (`fp4`) was fixed by rewording the
*prompt*, not by ranking. **24 remains the ceiling a ranking layer would
need to address.**

> **Correction, recorded rather than silently edited (2026-09-24).** The
> figure above originally read "~1.0% of questions, close to English's
> pre-fix ~0.9%," dividing 24 by all 2,500 French questions. That's not
> comparable to English's denominator: self-referential distractors can
> only occur where there's a choice/bank pool to draw from, and English's
> 12 was measured across its 1,387 MC questions specifically, not all
> question types. Re-denominated:
>
> | Measure | Value |
> |---|---|
> | 24 ÷ all French questions (2,500) | 0.96% (the original, wrong comparison) |
> | 24 ÷ French MC only (1,303) | 1.84% |
> | English pre-fix: 12 ÷ 1,387 MC | 0.87% |
>
> **Like for like, French is roughly twice English's pre-fix rate** — this
> strengthens the case for a ranking layer, not weakens it.
>
> **A further refinement on top of that correction**, found while verifying
> it: this tool's `choicesOf()` treats a `fill` question's word bank the
> same as an `mc` question's choices (both are "the pool a wrong answer
> could leak from"), so not all 24 flags are actually on MC questions —
> checked directly against the dump: **21 are on `mc`, 3 are on `fill`**.
> The precise MC-only rate is therefore 21/1,303 ≈ 1.61%, not 24/1,303 =
> 1.84%. (English's own original log has the identical imprecision in the
> other direction — its post-fix "5" is stated as "1 multiple-choice, 4
> fill banks," mixed into a count divided by an MC-only denominator — so
> 1.84% is the number that's actually consistent with how English's own
> figure was computed; 1.61% is the more precise MC-only figure. Both are
> reported here rather than picking one silently.)

The 59 (now 4) **answer**-leak instances are a separate, French-specific
phenomenon with no English analog to compare against — the bare-infinitive-
hint pattern is a consequence of how French's cloze hints work, not
something the ranking layer would have caught even if it existed (a ranking
layer ranks *distractors*, and does nothing about a hint matching the
*answer*). That category was fixed by content edits in phase 1 and is not
part of the section 8.3 decision.

---

## 3. Morphology/POS source spike

### 3.1 Candidates researched

| Package | Latest | Last published | License | Approach |
|---|---|---|---|---|
| **`french-verbs`** + **`french-verbs-lefff`** | 5.4.0 / 3.4.0 | 2024-12-27 | Apache-2.0 | **Generative**: `getConjugation(lexicon, infinitive, tense, person)` looks up a known verb and returns the correct form. Backed by Lefff (Lexique des Formes Fléchies du Français), a large-scale academic French morphological lexicon, 7,826 verb entries. |
| `conjugation-fr` | 0.3.4 | 2023-10-24 | **GPL-2.0** | Generative, same style, backed by the Verbiste database. Copyleft license — a real consideration for inclusion in this codebase; flagged, not resolved here. |
| `nlp-js-tools-french` | 1.0.9 | **2017-05-22** | MIT | **Tagging**: tokenize/POS-tag/lemmatize/stem arbitrary French text, the same shape as English's `compromise`. Not touched further — 9+ years since last publish, no evidence of ongoing maintenance. Not recommended on maintenance grounds alone. |
| Stanford POS tagger | — | — | GPL family | Java-based; impractical in this Bun/TS stack without a JVM bridge. Not spiked. |

### 3.2 Spike methodology and results — `french-verbs` + `french-verbs-lefff`

Installed in an isolated scratch project (not this repo's `package.json`).
A known-correct present-tense conjugation table was hand-built for **20
verbs** — more than double the English pilot's 7, per this task's
instruction — spanning regular `-er`/`-ir`/`-re` verbs and the common
irregulars that actually appear in `lesson-bank-fr.ts`'s cloze packs
(`parler`, `manger`, `aimer`, `finir`, `choisir`, `vendre`, `attendre`,
`être`, `avoir`, `aller`, `faire`, `pouvoir`, `vouloir`, `devoir`, `savoir`,
`prendre`, `venir`, `voir`, `dire`, `mettre`), tested across all 6
persons (je/tu/il/nous/vous/ils) = 120 data points.

- **119/120 correct (99.2%)** against the hand-built table. The one
  "mismatch" — `pouvoir`, je-form — is not actually wrong: the library
  returned `puis`, the formal/literary register form, where the table
  expected the standard `peux`; both are correct French, this is a
  register choice not an error.
- **Second-tense spot check (imparfait, 5 verbs × 6 persons = 30 forms):
  30/30 correct.**
- **Failure mode on an unknown verb**: `getConjugation(lexicon,
  "zorbliquer", "PRESENT", 0)` **throws** `"zorbliquer not in dict"` rather
  than guessing. This is the property that actually matters most, per the
  English pilot's own post-mortem: `compromise` tagged 44.8% of the English
  bank "Verb" confidently and wrongly, silently, because it never refuses to
  answer. A conjugation lookup against a fixed lexicon can't do that — it
  either knows the verb or it errors.
- **Coverage against real production vocabulary, not just the hand-picked
  20**: every one of the 117 distinct French verb infinitives actually used
  as cloze-pack hints across `lesson-bank-fr.ts` today was found in the
  Lefff lexicon — **117/117 (100%)**.

### 3.2a Extended to every mood/tense the bank actually uses

The first pass above covered présent and imparfait only. The bank's cloze
packs also exercise futur (`frb1p4`), conditionnel présent (`frb1p6`) and
passé (`frb2p7`), subjonctif présent (`frb2p1`, including the bank's own
`"Il est important que nous ___ (prendre) une décision.|prenions"` line —
verified directly) and passé (`frc1p6`), and plus-que-parfait (`frb2p6`) —
none of which the first pass verified. "100% coverage of 117 infinitives"
is coverage, not correctness; it says the library knows the verbs, not
that it conjugates them correctly in these specific moods. Closed by
re-running the same methodology (hand-built known-correct tables, same
20-verb set — 10 verbs for the three compound tenses, to keep the sample
proportionate) against every remaining tense:

| Tense                                          | Result                  |
| ----------------------------------------------- | ----------------------- |
| Futur simple (20 verbs × 6 persons)             | 120/120                 |
| Conditionnel présent (20 verbs × 6 persons)     | 120/120                 |
| Subjonctif présent (20 verbs × 6 persons)       | 120/120                 |
| Passé composé, avoir-verbs (18 verbs × 6)       | 108/108                 |
| Passé composé, être-verbs (2 verbs × 6)         | 12/12 (see gotcha below) |
| Plus-que-parfait (10 verbs × 6 persons)         | 60/60                   |
| Conditionnel passé (10 verbs × 6 persons)       | 60/60                   |
| Subjonctif passé (10 verbs × 6 persons)         | 60/60                   |
| **Combined with présent/imparfait, all tenses** | **809/810 (99.9%)**     |

**One real gotcha, found in the process — not a footnote.** The first
run of the être-auxiliary passé composé check scored 8/12 (66.7%), not
12/12: requesting `nous`/`ils` with only `agreeGender: "M"` set returned
the **singular** participle (`sommes allé` instead of `sommes allés`) —
a plausible-looking wrong answer, not a thrown error. The library's own
docs are explicit that gender agreement isn't automatic, but say nothing
about number, and number silently defaults to singular unless
`agreeNumber` is also passed. Every mismatch was this one caller-side
omission — passing `agreeNumber: "P"` for the plural persons fixed all
four instantly, and the library's underlying conjugation data was never
wrong. This doesn't reverse the recommendation, but it is a concrete
integration requirement for whoever implements this: **`agreeNumber` must
be derived from the subject and passed explicitly; it will not be
inferred from the person index.** This is a different failure mode than
"fails loudly on an unknown verb" — it's a silent wrong answer on a
*known* verb when the caller under-specifies agreement, and is exactly
the kind of thing spec section 8.3's "must be the sole authority"
requirement should be read to include: the library is authoritative on
conjugation, but the caller is still responsible for telling it who and
how many.

### 3.3 The architectural point this spike surfaces

This is the load-bearing finding, not just the accuracy number: **English's
problem and French's problem are not the same shape, and don't want the same
kind of tool.** English needed to *classify* an already-fixed pool of answer
strings by part of speech (a **tagging** problem — hence `compromise`, and
hence its "tag a bare word out of context" failure mode). For French's 19
verb-conjugation packs (45% of all cloze packs, section 1 above), the
better fix isn't tagging pool members at all — it's **generating** the
correct line's own distractors directly from its own verb (`getConjugation`
for other persons/tenses of the *same* infinitive already named in that
line's `(hint)`), which:

1. Requires no guessing about an existing pool word's identity — the verb is
   already known, because the pack author wrote it in the hint.
2. Produces genuinely "morphological variants of the correct answer," which
   is literally what spec section 8.1 asks for.
3. Sidesteps the "tag a bare word out of context" failure mode entirely,
   because nothing is being tagged — only known infinitives are looked up.

For the 15 mixed-class packs (36%) and the answer-pool-mixing cases found in
phase 1 (`frb2p18`, etc.), a generator alone doesn't help — those need to
tell a pronoun from a verb phrase from a noun, which is a classification
problem. A full POS tagger is one way to do that, but a narrower,
lower-risk option is also visible from this spike: **since Lefff's data is
keyed by infinitive → all conjugated forms, a one-time reverse index (build
a set of every conjugated form Lefff contains, once, at build time) turns
"is this pool word some verb's conjugated form" into a deterministic lookup**
— coarser than full POS tagging (verb vs. not-verb, not noun vs. adjective
vs. preposition), but sufficient to catch the concrete defect actually found
(`frb2p18`'s pronoun/verb-phrase mix, `fra2p11`'s verb pooled into a noun
slot) without adopting a second, less-maintained tagging library. This is a
design option for whoever picks up section 8.3, not a decision made here.

### 3.4 Recommendation (the account owner's call to make)

**Primary**: `french-verbs` + `french-verbs-lefff` — 809/810 (99.9%) across
every mood/tense the bank's cloze packs actually use (§3.2a), 100% coverage
against real production vocabulary, Apache-2.0 (no licensing friction),
actively maintained (published 2024-12-27), and fails loudly (throws)
rather than guessing on an unknown verb. Its one real integration
requirement — `agreeNumber` must be passed explicitly for être-auxiliary
compound tenses, it is not inferred from the person index (§3.2a) — is a
caller-side detail to get right during implementation, not a reason to
reconsider the library. Use it **generatively** in `bank-engine.ts` for
the 19 verb-conjugation cloze packs — produce a line's distractors from
its own hinted verb's other forms, rather than pooling from the pack's
other answers.

**Secondary, needs its own scoping**: the 15 mixed-class packs and any
answer-pool contamination between verb and non-verb answers still need a
classification mechanism. A Lefff-reverse-index verb/non-verb check (see
3.3) is the lowest-risk option surfaced by this spike; a full POS tagger
(none of the researched options are both accurate and maintained) is not
recommended without further evaluation.

**Not recommended**: `conjugation-fr` (GPL-2.0 licensing risk, older/less
maintained), `nlp-js-tools-french` (unmaintained since 2017).

**Explicitly not decided here**: whether to build this, and whether the same
choice should also serve Spanish (`docs/BACKLOG.md` §0.6.2 frames this as
one decision for both languages — this spike did not evaluate a Spanish
equivalent, e.g. whether an analogous Lefff-style lexicon exists for
Spanish; that's a gap for whoever picks up the decision, not resolved here).

---

## 4. What was and wasn't touched

- No file under `src/` or `scripts/` was modified by this work.
- No dependency was added to this repo's `package.json` — the spike ran in
  an isolated scratch project outside the repo.
- `bank-engine.ts`'s `pickDistractors` is unchanged.
- No new pack, lesson, or question was added anywhere.
