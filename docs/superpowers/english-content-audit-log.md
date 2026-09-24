# English Content Audit Log

> Scaffolded by `scripts/init-audit-log.ts`, then filled by hand. DO NOT
> re-run that script against this file -- it regenerates the table from
> scratch and would discard every verdict below. Add new packs as rows by
> hand instead.
>
> Every row must end with a
> verdict before phase 1 can be called done -- including "no issues
> found". Coverage is proved by enumeration, not sampling.
>
> Spec: `docs/superpowers/specs/2026-09-23-english-content-overhaul-design.md`

## Coverage

| Id | Kind | Title | Questions | Audited | Findings |
|---|---|---|---|---|---|
| `a1p1` | pack | Plurals | 25 | ☑ | No issues found. |
| `a1p2` | pack | To Be & Present Simple | 25 | ☑ | No issues found. |
| `a1p3` | pack | Opposites | 25 | ☑ | FIXED BY RANKING LAYER: pool holds both `young` (old|young) and `old` (new|old), so "Opposite of 'old':" could offer "old". The prompt-overlap rule now demotes it. No content edit needed. |
| `a1p4` | pack | Time & Place | 25 | ☑ | No issues found. |
| `a1p5` | pack | Everyday Verbs | 25 | ☑ | No issues found. |
| `a1p6` | pack | Questions | 25 | ☑ | No issues found. |
| `a1p7` | pack | Family & People | 25 | ☑ | No issues found. |
| `a1p8` | pack | Food & Drink | 25 | ☑ | No issues found. |
| `a1p9` | pack | Clothes & Colours | 25 | ☑ | No issues found. |
| `a1p10` | pack | Weather & Seasons | 25 | ☑ | No issues found. |
| `a1p11` | pack | Numbers & Money | 25 | ☑ | DEFECTS FOUND + FIXED: "Can I pay in ___ instead of cash?"->coins had two defensible answers (change/notes are cash) - re-clued to a one-pound coins jar. "Could you ___ this note"->change also accepted "save" - stem now says "for smaller ones". Verb slots additionally had noun distractors; fixed by the ranking layer. |
| `a1p12` | pack | Jobs & Occupations | 25 | ☑ | No issues found. |
| `a1p13` | pack | Animals | 25 | ☑ | FIXED x2: "very large grey animal with tusks"->"elephant seal" re-clued to walrus (the clue described an elephant, already in the pool); turtle/snail clues were near-identical, snail re-clued. |
| `a1p14` | pack | Days, Months & Time | 25 | ☑ | FIXED: answer "flowers" (a Valentine's line) polluted a time-word pool; replaced with a "noon" line. Was producing [January, flowers, time, year]. |
| `a1p15` | pack | Shapes & Sizes | 25 | ☑ | DEFERRED STRUCTURAL: pack deliberately mixes shape nouns with size adjectives, so shape questions can draw adjective distractors. Not fixable in place; needs a pack split. |
| `a1p16` | pack | Daily Routine | 25 | ☑ | No issues found. |
| `a1p17` | pack | In the Classroom | 25 | ☑ | No issues found. |
| `a1p18` | pack | Describing Things | 25 | ☑ | No issues found. |
| `a1p19` | pack | At the Supermarket | 25 | ☑ | No issues found. |
| `a1p20` | pack | Transport & Travel Basics | 25 | ☑ | No issues found. |
| `a1p21` | pack | Parts of the Body | 25 | ☑ | No issues found. |
| `a1p22` | pack | Hobbies & Free Time | 25 | ☑ | No issues found. |
| `a1p23` | pack | Listening: Everyday Sentences | 25 | ☑ | NEW in phase 2A (listening type). Sentences are authored in near-identical pairs differing by one word, so the distractor is a genuine mishearing rather than a different topic; 91% of listening questions have a distractor sharing at least half the answer's content words, pinned by a test. Reviewed independently, not self-certified. |
| `a2p1` | pack | Irregular Past | 25 | ☑ | No issues found. |
| `a2p2` | pack | Talking About the Past | 25 | ☑ | No issues found. |
| `a2p3` | pack | Comparatives | 25 | ☑ | No issues found. |
| `a2p4` | pack | Out & About | 25 | ☑ | No issues found. |
| `a2p5` | pack | How Much, How Many | 25 | ☑ | No issues found. |
| `a2p6` | pack | Future Forms | 25 | ☑ | No issues found. |
| `a2p7` | pack | House & Home | 25 | ☑ | No issues found. |
| `a2p8` | pack | Sport & Hobbies | 25 | ☑ | No issues found. |
| `a2p9` | pack | Body & Health | 25 | ☑ | No issues found. |
| `a2p10` | pack | Superlatives | 25 | ☑ | No issues found. |
| `a2p11` | pack | At the Restaurant | 25 | ☑ | No issues found. |
| `a2p12` | pack | Adverbs of Frequency | 25 | ☑ | No issues found. |
| `a2p13` | pack | Directions & Places in Town | 25 | ☑ | No issues found. |
| `a2p14` | pack | Making Plans | 25 | ☑ | No issues found. |
| `a2p15` | pack | Post Office & Bank | 25 | ☑ | No issues found. |
| `a2p16` | pack | Your Neighbourhood | 25 | ☑ | No issues found. |
| `a2p17` | pack | Prepositions of Place | 25 | ☑ | No issues found. |
| `a2p18` | pack | Past Continuous | 25 | ☑ | No issues found. |
| `a2p19` | pack | Modal Verbs — Ability & Permission | 25 | ☑ | No issues found. |
| `a2p20` | pack | Comparisons — As...As | 25 | ☑ | No issues found. |
| `a2p21` | pack | Listening: Plans & Past Events | 25 | ☑ | NEW in phase 2A (listening type). Sentences are authored in near-identical pairs differing by one word, so the distractor is a genuine mishearing rather than a different topic; 91% of listening questions have a distractor sharing at least half the answer's content words, pinned by a test. Reviewed independently, not self-certified. |
| `b1p1` | pack | Phrasal Verbs | 25 | ☑ | No issues found. |
| `b1p2` | pack | Conditionals | 25 | ☑ | No issues found. |
| `b1p3` | pack | Modal Verbs | 25 | ☑ | No issues found. |
| `b1p4` | pack | Perfect Tenses | 25 | ☑ | No issues found. |
| `b1p5` | pack | Work & Opinions | 25 | ☑ | No issues found. |
| `b1p6` | pack | Relative Clauses | 25 | ☑ | No issues found. |
| `b1p7` | pack | Travel & Tourism | 25 | ☑ | No issues found. |
| `b1p8` | pack | Feelings & Emotions | 25 | ☑ | No issues found. |
| `b1p9` | pack | Money & Shopping | 25 | ☑ | DEFECT FOUND: verb slots were offered nouns from the same pack ("He's ___ into debt" offering debt/spending/refund/guarantee). Fixed by the ranking layer, not by curation - the pool legitimately mixes word classes. |
| `b1p10` | pack | Environment | 25 | ☑ | No issues found. |
| `b1p11` | pack | Education & Learning | 25 | ☑ | No issues found. |
| `b1p12` | pack | Describing Trends | 25 | ☑ | No issues found. |
| `b1p13` | pack | Job Interviews & CVs | 25 | ☑ | No issues found. |
| `b1p14` | pack | Describing People's Character | 25 | ☑ | No issues found. |
| `b1p15` | pack | Used to & Would | 25 | ☑ | No issues found. |
| `b1p16` | pack | Question Tags | 25 | ☑ | No issues found. |
| `b1p17` | pack | Giving Opinions & Agreeing | 25 | ☑ | No issues found. |
| `b1p18` | pack | Health & Fitness | 25 | ☑ | No issues found. |
| `b1p19` | pack | Weather & Natural Events | 25 | ☑ | No issues found. |
| `b1p20` | pack | Describing a Process | 25 | ☑ | No issues found. |
| `b1p21` | pack | Listening: Opinions & Explanations | 25 | ☑ | NEW in phase 2A (listening type). Sentences are authored in near-identical pairs differing by one word, so the distractor is a genuine mishearing rather than a different topic; 91% of listening questions have a distractor sharing at least half the answer's content words, pinned by a test. Reviewed independently, not self-certified. |
| `b2p1` | pack | The Passive | 25 | ☑ | No issues found. |
| `b2p2` | pack | Confusable Words | 25 | ☑ | No issues found. |
| `b2p3` | pack | Linking Ideas | 25 | ☑ | No issues found. |
| `b2p4` | pack | Reported Speech | 25 | ☑ | No issues found. |
| `b2p5` | pack | Strong Collocations | 25 | ☑ | No issues found. |
| `b2p6` | pack | Word Formation | 25 | ☑ | No issues found. |
| `b2p7` | pack | Reporting & Hedging | 25 | ☑ | No issues found. |
| `b2p8` | pack | Collocations | 25 | ☑ | No issues found. |
| `b2p9` | pack | Health & Medicine | 25 | ☑ | No issues found. |
| `b2p10` | pack | Technology & Media | 25 | ☑ | No issues found. |
| `b2p11` | pack | Business & Negotiation | 25 | ☑ | No issues found. |
| `b2p12` | pack | Crime & Law | 25 | ☑ | No issues found. |
| `b2p13` | pack | Politics & Society | 25 | ☑ | No issues found. |
| `b2p14` | pack | Arts & Culture | 25 | ☑ | FIXED x3: generic answers "minutes"/"price"/"month" polluted an arts pool across 11 questions; re-pointed to audience/collection/acclaim. |
| `b2p15` | pack | Idioms & Fixed Expressions | 25 | ☑ | No issues found. |
| `b2p16` | pack | Cause & Effect | 25 | ☑ | No issues found. |
| `b2p17` | pack | Phrasal Verbs II | 25 | ☑ | No issues found. |
| `b2p18` | pack | Mixed Conditionals | 25 | ☑ | No issues found. |
| `b2p19` | pack | Wish & If Only | 25 | ☑ | No issues found. |
| `b2p20` | pack | Food & Cooking | 25 | ☑ | No issues found. |
| `b2p21` | pack | Listening: Reports & Arguments | 25 | ☑ | NEW in phase 2A (listening type). Sentences are authored in near-identical pairs differing by one word, so the distractor is a genuine mishearing rather than a different topic; 91% of listening questions have a distractor sharing at least half the answer's content words, pinned by a test. Reviewed independently, not self-certified. |
| `c1p1` | pack | Idioms | 25 | ☑ | No issues found. |
| `c1p2` | pack | Register | 25 | ☑ | No issues found. |
| `c1p3` | pack | Inversion & Emphasis | 25 | ☑ | No issues found. |
| `c1p4` | pack | Precision Connectors | 25 | ☑ | No issues found. |
| `c1p5` | pack | Academic Verbs | 25 | ☑ | No issues found. |
| `c1p6` | pack | Hedging | 25 | ☑ | No issues found. |
| `c1p7` | pack | Legal & Formal Documents | 25 | ☑ | No issues found. |
| `c1p8` | pack | Nuanced Character & Emotion | 25 | ☑ | No issues found. |
| `c1p9` | pack | Rhetoric & Persuasion | 25 | ☑ | No issues found. |
| `c1p10` | pack | Scientific & Technical Prose | 25 | ☑ | No issues found. |
| `c1p11` | pack | Diplomatic Language | 25 | ☑ | No issues found. |
| `c1p12` | pack | Idiomatic Expressions II | 25 | ☑ | No issues found. |
| `c1p13` | pack | Complex Passive & Causative | 25 | ☑ | No issues found. |
| `c1p14` | pack | Formal Emails & Correspondence | 25 | ☑ | No issues found. |
| `c1p15` | pack | Nominalisation | 25 | ☑ | No issues found. |
| `c1p16` | pack | Cleft Sentences | 25 | ☑ | No issues found. |
| `c1p17` | pack | Collocations with Make, Do, Take & Have | 25 | ☑ | No issues found. |
| `c1p18` | pack | Euphemisms & Indirect Language | 25 | ☑ | No issues found. |
| `c1p19` | pack | Contrast & Concession | 25 | ☑ | No issues found. |
| `c1p20` | pack | Academic Cohesion | 25 | ☑ | No issues found. |
| `c1p21` | pack | Listening: Academic & Professional Register | 25 | ☑ | NEW in phase 2A (listening type). Sentences are authored in near-identical pairs differing by one word, so the distractor is a genuine mishearing rather than a different topic; 91% of listening questions have a distractor sharing at least half the answer's content words, pinned by a test. Reviewed independently, not self-certified. |
| `u1` | hand-written unit | Everyday Basics | 35 | ☑ | No issues found. |
| `u2` | hand-written unit | The Daily Routine | 32 | ☑ | No issues found. |
| `u3` | hand-written unit | Polite Requests | 32 | ☑ | No issues found. |
| `u4` | hand-written unit | Yesterday & Before | 12 | ☑ | No issues found. |
| `u5` | hand-written unit | Out in the World | 12 | ☑ | No issues found. |
| `u6` | hand-written unit | Opinions & Ideas | 12 | ☑ | No issues found. |
| `u7` | hand-written unit | Working Life | 12 | ☑ | No issues found. |
| `u8` | hand-written unit | Nuance & Precision | 12 | ☑ | No issues found. |
| `u9` | hand-written unit | Register & Idiom | 12 | ☑ | No issues found. |
| `placement` | placement pool | Placement test | 45 | ☑ | FIXED x2: p2b was malformed (sentence pasted into choices, 5 choices, real question words all marked wrong) - repaired and guarded by a new test; p2 greeting distractors (What, Give) replaced with wrong-register greetings. |

## Findings detail

### Method

Every pack was reviewed at the POOL level, which is where this bug class lives:
distractors are drawn mechanically from a pack's own set of answers, so an
incoherent pool is what produces incoherent wrong answers. All 102 pools were
read in full, supported by `scripts/audit-scan.ts` (flagging only) and by
spot-checking compiled output from `scripts/dump-english-questions.ts`.
Hand-written units and the placement pool were reviewed directly, since their
choices are authored rather than generated.

### Correction: the phase 2A listening verdicts

The five listening rows were first self-marked with the rationale "answers share
a domain and a similar length within the pack". Whole-branch review measured
that and found the domain half **false** (a1p23 mixed jobs, transport, family,
pets, timetables and food) — and that was the load-bearing half, since it was
the stated reason the distractors were not guessable. Measurement showed the
real figure: **0 of 125** questions had a distractor sharing even half the
answer's content words, i.e. every one was winnable by catching a single word.

The packs were re-authored as minimal pairs and the distractor selection was
changed to rank listening candidates by confusability, taking that to 91%. The
verdicts above now state the measured property rather than an assumed one.

Two process notes worth keeping: a verdict written by the same pass that authored
the content is not a review, and a claim of this kind should be measured before
it is written down.

### How much "No issues found" is worth

Read those rows as "no pool-level or systemic defect found", not as
certification that every question in the pack is perfect. The audit's strength
is pool composition, which is where the reported bug lives and which it covers
exhaustively. Its weakness is per-question semantics.

This limit is measured, not hypothetical: during whole-branch review, two packs
marked clean were spot-checked and both held real two-defensible-answer
defects (both in `a1p11`, now fixed and re-marked). A reviewer should assume
similar defects remain in other packs and treat a "no issues" row as
"unexamined at that depth" rather than "verified clean".

### Systemic finding (applies to every generated pack)

The reported bug has two distinct causes, and pool curation only addresses one:

1. Semantic outliers inside a themed pool (the "flowers in a time pack" case).
   Fixed by curation, per-pack, above.
2. Grammatically impossible distractors. Cloze packs pool every answer
   regardless of word class, so verb slots were offered nouns. This is inherent
   to the format and CANNOT be fixed by curation -- a "Daily Routine" pack
   legitimately holds mixed word classes.

Cause 2 was fixed in code by ranking candidates on part-of-speech affinity and
prompt overlap before they are taken (`src/lib/distractor-affinity.ts`).
Measured across all 1,387 English multiple-choice questions: distractors echoing a
prompt word fell from 12 to **5** (1 multiple-choice, 4 fill banks).

A part-of-speech ratio is also tracked, but it is a smoke test, not evidence of
quality: the ranking layer sorts by the same map the ratio is measured with, so
it can only detect the layer being removed, never a wrong tag. Independent
evidence is the hand-labelled accuracy check in `src/data/answer-pos.test.ts`,
which the first (bare-word) version of the tag map failed at 62%; the current
contextual map scores 88% on that sample.

**A defect was found here during whole-branch review and corrected.** The first
version of the tag map was built by tagging bare words, which `compromise` does
confidently and often wrongly -- it tagged 44.8% of the bank "Verb", including
`tax`, `card`, `discount`, `balance` and `refund`. The ranking layer therefore
promoted those nouns into verb slots, the exact defect it exists to remove, and
the map-relative metric could not see it. Tags are now read from each answer's
own sentence, only where every occurrence agrees; answers seen solely in "pair"
packs are left untagged rather than guessed.

### Hand-written content

The 9 hand-written units (171 questions) were checked and are clean -- 0
structural issues, and their distractors are notably strong ("Nice to ___ you."
offers meet/meat/met/meeting). The defect is specific to generated pack content.

### Id stability

Every content edit replaced a line in place, preserving each pack's line count
and order. `src/lib/english-id-parity.test.ts` compares the live course against
a committed 2,721-id baseline and passes, so no saved review item was repointed.


## Deferred structural changes

- **a1p15 "Shapes & Sizes" pack split** -- DECLINED for phase 1. The pack mixes
  shape nouns (triangle, hexagon) with size adjectives (huge, tiny), so a shape
  question can draw an adjective distractor. Splitting it adds or removes lines,
  which shifts every later question id in the pack and repoints real users'
  saved review items. Note the ranking layer does NOT mitigate this pack: its
  answers appear only in "pair" lines, which carry no sentence, so they are
  deliberately left untagged and no preference is expressed. Live output still
  mixes classes -- "has four equal sides" offers [triangle, square, huge,
  heavy]. The defect is real and remains open; it is deferred because splitting
  the pack shifts ids, not because it is harmless. Revisit as a deliberate,
  migrated content change.

No pack re-levelling was proposed: no pack was found materially mis-levelled.
