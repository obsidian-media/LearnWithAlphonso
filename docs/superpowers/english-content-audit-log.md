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
| `a1p15` | pack | Shapes & Sizes | 25 | ☑ | **FIXED 2026-09-24, no split needed.** The diagnosis in the deferred-changes section was right and its remedy was wrong: the pack does mix shape nouns with size adjectives, but the reason distractors crossed classes is that pair-pack answers carried no part-of-speech tag at all, so the ranking layer expressed no preference. Its 25 answers are now hand-labelled in `src/data/pair-answer-class.ts`, which moves no line and shifts no id. Cross-class distractors: **23 of 25 questions -> 0 of 25**, with no other pack in the course affected. |
| `a1p16` | pack | Daily Routine | 25 | ☑ | No issues found. |
| `a1p17` | pack | In the Classroom | 25 | ☑ | No issues found. |
| `a1p18` | pack | Describing Things | 25 | ☑ | No issues found. |
| `a1p19` | pack | At the Supermarket | 25 | ☑ | No issues found. |
| `a1p20` | pack | Transport & Travel Basics | 25 | ☑ | No issues found. |
| `a1p21` | pack | Parts of the Body | 25 | ☑ | No issues found. |
| `a1p22` | pack | Hobbies & Free Time | 25 | ☑ | No issues found. |
| `a1p23` | pack | Listening: Everyday Sentences | 25 | ☑ | NEW in phase 2A (listening type). Sentences are authored in near-identical pairs differing by one word, so the distractor is a genuine mishearing rather than a different topic; 91% of listening questions have a distractor sharing at least half the answer's content words, pinned by a test. Reviewed independently, not self-certified. |
| `a1p24` | pack | Speaking: Everyday Phrases | 25 | ☑ | NEW in phase 2B (speaking type). Every line is the same text twice, so what is shown is exactly what must be said; there are no distractors to audit. Checked instead for the failure modes that are specific to grading a transcript: each phrase is sayable in one breath, and compound numbers and currency are avoided because Deepgram's `smart_format` renders them in a form the normaliser cannot reconcile (number WORDS are handled -- "nine" matches the "9" it transcribes to). |
| `a1p25` | pack | Say It Your Way | 25 | ☑ | NEW in phase 4 (translation type). No distractors to audit: the learner writes the answer. What was checked instead is the thing that decides whether this pack is fair -- every line carries at least three acceptable wordings that are still distinct once NORMALISED (enforced by curriculum-consistency.test.ts; its first version deduped with a bare trim/lowercase, which let contraction pairs like "What's your name?"/"What is your name?" count as two wordings when the matcher sees one -- 12 lines shipped that way and were re-authored), and the prompt describes the idea without containing its own answer (14 lines across b1p23/b2p23/c1p23/a2p23 failed this on the first pass -- either the prompt was the answer with "Say" prefixed, or its grammatical person appeared in no accepted wording, so the most literal correct answer was rejected), so it is a producing exercise rather than a copying one. Phrases avoid the traps the speaking packs documented (compound numbers, ordinals, contracted "has", possessive 's, undisambiguated names), because the same normaliser runs underneath. A valid wording the list misses is caught by the AI grader, which is the fallback, not the plan. |
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
| `a2p22` | pack | Speaking: Getting Things Done | 25 | ☑ | NEW in phase 2B (speaking type). Every line is the same text twice, so what is shown is exactly what must be said; there are no distractors to audit. Checked instead for the failure modes that are specific to grading a transcript: each phrase is sayable in one breath, and compound numbers and currency are avoided because Deepgram's `smart_format` renders them in a form the normaliser cannot reconcile (number WORDS are handled -- "nine" matches the "9" it transcribes to). |
| `a2p23` | pack | Say It Your Way: Getting Things Done | 25 | ☑ | NEW in phase 4 (translation type). No distractors to audit: the learner writes the answer. What was checked instead is the thing that decides whether this pack is fair -- every line carries at least three acceptable wordings that are still distinct once NORMALISED (enforced by curriculum-consistency.test.ts; its first version deduped with a bare trim/lowercase, which let contraction pairs like "What's your name?"/"What is your name?" count as two wordings when the matcher sees one -- 12 lines shipped that way and were re-authored), and the prompt describes the idea without containing its own answer (14 lines across b1p23/b2p23/c1p23/a2p23 failed this on the first pass -- either the prompt was the answer with "Say" prefixed, or its grammatical person appeared in no accepted wording, so the most literal correct answer was rejected), so it is a producing exercise rather than a copying one. Phrases avoid the traps the speaking packs documented (compound numbers, ordinals, contracted "has", possessive 's, undisambiguated names), because the same normaliser runs underneath. A valid wording the list misses is caught by the AI grader, which is the fallback, not the plan. |
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
| `b1p22` | pack | Speaking: Saying What You Think | 25 | ☑ | NEW in phase 2B (speaking type). Every line is the same text twice, so what is shown is exactly what must be said; there are no distractors to audit. Checked instead for the failure modes that are specific to grading a transcript: each phrase is sayable in one breath, and compound numbers and currency are avoided because Deepgram's `smart_format` renders them in a form the normaliser cannot reconcile (number WORDS are handled -- "nine" matches the "9" it transcribes to). |
| `b1p23` | pack | Say It Your Way: Opinions | 25 | ☑ | NEW in phase 4 (translation type). No distractors to audit: the learner writes the answer. What was checked instead is the thing that decides whether this pack is fair -- every line carries at least three acceptable wordings that are still distinct once NORMALISED (enforced by curriculum-consistency.test.ts; its first version deduped with a bare trim/lowercase, which let contraction pairs like "What's your name?"/"What is your name?" count as two wordings when the matcher sees one -- 12 lines shipped that way and were re-authored), and the prompt describes the idea without containing its own answer (14 lines across b1p23/b2p23/c1p23/a2p23 failed this on the first pass -- either the prompt was the answer with "Say" prefixed, or its grammatical person appeared in no accepted wording, so the most literal correct answer was rejected), so it is a producing exercise rather than a copying one. Phrases avoid the traps the speaking packs documented (compound numbers, ordinals, contracted "has", possessive 's, undisambiguated names), because the same normaliser runs underneath. A valid wording the list misses is caught by the AI grader, which is the fallback, not the plan. |
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
| `b2p22` | pack | Speaking: Longer Turns | 25 | ☑ | NEW in phase 2B (speaking type). Every line is the same text twice, so what is shown is exactly what must be said; there are no distractors to audit. Checked instead for the failure modes that are specific to grading a transcript: each phrase is sayable in one breath, and compound numbers and currency are avoided because Deepgram's `smart_format` renders them in a form the normaliser cannot reconcile (number WORDS are handled -- "nine" matches the "9" it transcribes to). |
| `b2p23` | pack | Say It Your Way: Longer Turns | 25 | ☑ | NEW in phase 4 (translation type). No distractors to audit: the learner writes the answer. What was checked instead is the thing that decides whether this pack is fair -- every line carries at least three acceptable wordings that are still distinct once NORMALISED (enforced by curriculum-consistency.test.ts; its first version deduped with a bare trim/lowercase, which let contraction pairs like "What's your name?"/"What is your name?" count as two wordings when the matcher sees one -- 12 lines shipped that way and were re-authored), and the prompt describes the idea without containing its own answer (14 lines across b1p23/b2p23/c1p23/a2p23 failed this on the first pass -- either the prompt was the answer with "Say" prefixed, or its grammatical person appeared in no accepted wording, so the most literal correct answer was rejected), so it is a producing exercise rather than a copying one. Phrases avoid the traps the speaking packs documented (compound numbers, ordinals, contracted "has", possessive 's, undisambiguated names), because the same normaliser runs underneath. A valid wording the list misses is caught by the AI grader, which is the fallback, not the plan. |
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
| `c1p22` | pack | Speaking: Register and Nuance | 25 | ☑ | NEW in phase 2B (speaking type). Every line is the same text twice, so what is shown is exactly what must be said; there are no distractors to audit. Checked instead for the failure modes that are specific to grading a transcript: each phrase is sayable in one breath, and compound numbers and currency are avoided because Deepgram's `smart_format` renders them in a form the normaliser cannot reconcile (number WORDS are handled -- "nine" matches the "9" it transcribes to). |
| `c1p23` | pack | Say It Your Way: Register and Nuance | 25 | ☑ | NEW in phase 4 (translation type). No distractors to audit: the learner writes the answer. What was checked instead is the thing that decides whether this pack is fair -- every line carries at least three acceptable wordings that are still distinct once NORMALISED (enforced by curriculum-consistency.test.ts; its first version deduped with a bare trim/lowercase, which let contraction pairs like "What's your name?"/"What is your name?" count as two wordings when the matcher sees one -- 12 lines shipped that way and were re-authored), and the prompt describes the idea without containing its own answer (14 lines across b1p23/b2p23/c1p23/a2p23 failed this on the first pass -- either the prompt was the answer with "Say" prefixed, or its grammatical person appeared in no accepted wording, so the most literal correct answer was rejected), so it is a producing exercise rather than a copying one. Phrases avoid the traps the speaking packs documented (compound numbers, ordinals, contracted "has", possessive 's, undisambiguated names), because the same normaliser runs underneath. A valid wording the list misses is caught by the AI grader, which is the fallback, not the plan. |
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

**Update 2026-09-24: hand labels for mixed pools.** The paragraphs here describe
the cloze-only map, and it is **unchanged** -- byte-identical. What was added is a
separate per-pack override map holding 25 hand labels for a1p15, the one pack
whose pool genuinely mixes word classes. See the a1p15 entry above for the two
approaches that were tried and withdrawn first.

A third automated route was measured and rejected along the way: dropping the
answer into a synthetic sentence frame so the tagger has context. `It is X.`
scores 93% on a 45-word hand-labelled sample and `They X.` scores 64% -- and the
gap is not quality. `It is X.` puts the word in a nominal slot so every verb
comes back a noun; `They X.` puts it in a verbal slot so 16 of this corpus's
nouns come back verbs. A frame does not read a word's class, it imposes one, and
its accuracy is a fact about the frame's syntax. That is the bare-word trap
wearing a different hat, and it is the thing to remember before reaching for a
frame.

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
the committed id baseline and passes, so no saved review item was repointed.

The baseline has been re-taken twice since, each time for appended content only:
2,721 ids -> 2,846 (phase 2A, listening) -> 2,971 (phase 2B, speaking) ->
3,096 (phase 4, translation). Every
re-baseline was checked to be **insertions only** in the diff before being
committed, which is what makes them safe: ids are index-derived, so appending a
pack cannot move an existing question, while inserting or removing a line
inside one moves every id after it and silently repoints real learners' saved
review items.


## Cross-pack duplicate prompts (2026-09-25)

The audit's coverage table is per-pack, so a sentence appearing in two packs was
never in scope for it. `curriculum-consistency.test.ts` did check for that, and
the check was report-only for English and printed through `console.log`, which
vitest intercepts -- so it held 7 findings while every run showed 46/46 and said
nothing.

**Nine groups, not seven, and eight were real.** The reported count was itself
understated by a second bug: a hand-written question's id is `q7`, so the check's
`id.replace(/q\d+$/, "")` produced `""` and every hand-written question in the
course collapsed into a single pseudo-pack. Duplicates *between* hand-written
units were structurally invisible. Fixing it surfaced two more, one of them the
worst of the set.

A third bug made three of the findings unreadable: the reported answer was
`Array.isArray(choices) ? choices[answer] : String(answer)`, which is wrong for
`listening` (whose `answer` is choice text, not an index) and `translate` (no
`choices` at all). Both printed `(undefined)`, so real duplicates looked like
artifacts of the report.

The eight, and which side gave way:

| duplicate | between | fixed by |
|---|---|---|
| "The meeting is ___ Monday." | u1l3:q7 (hand-written) / a1p4 | a1p4 -> "The exam is ___ 15 March.", which teaches the "on + date" half of its own note that no other line covered |
| "He ___ his teeth twice a day." | u2l1:q4 / a1p16 | a1p16 -> "She ___ her hair before she goes out." |
| "If I ___ rich, I'd travel." | u6l2:q2 / b1p2 | b1p2 -> "If we ___ closer, I'd visit more often." |
| "He complained ___ the noise." | b2p4q17 / b2p7q14 | b2p7 -> "She complained ___ the delay." |
| "The bus leaves at nine." | a1p23 (listening) / a1p24 (speak) | a1p24 -> "Please open the window." a1p23's line is the third member of a deliberate minimal-pair cluster (train/bus, nine/five), so the speaking pack gave way |
| "Apologise for arriving late." | a1p25 (A1 translate) / a2p23 (A2) | a2p23 -> "Apologise for missing the meeting." Its old third wording, "I apologise for arriving late.", was the prompt with "I" prefixed -- a copying exercise |
| "Ask someone to speak more slowly." | a1p25 / a2p23 | a2p23 -> "Ask a neighbour to water your plants while you are away." |
| "Can I pay ___ card?" | u3l2:q6 / u5l1:q4, both hand-written, same answer | u5l1 -> "I paid ___ cash." Its own explanation already named the complementary rule |

The two A2-vs-A1 translate repeats were the most damaging: identical prompts in
the A1 and A2 packs mean an A2 learner is set an A1 task, and neither the level
labels nor the per-pack audit could see it.

Every fix replaces one line in place, so no line count or order changed and no
question id moved (`english-id-parity.test.ts` passes with no re-baselining).

**The mechanism is now a ratchet, not a report.** Each course asserts against a
recorded count -- `{ en: 0, fr: 0, es: 57 }` -- so the number is visible in the
file, has to be lowered deliberately, and a new duplicate fails the run with
every finding in the assertion message. Spanish is held at 57 rather than
silenced; that session owns lowering it.

That last finding -- "Can I pay ___ card?" also existing in `placement.ts` -- was
the thread that led to the section below.

## Placement questions the course also teaches (2026-09-25)

The product decision was made explicitly: **the placement exam must not reuse
lesson questions.** An exam that draws from the pool it places you into measures
recall of that item rather than level, and the error runs one way only -- upward,
because recognising an item can raise a score and never lowers it. A learner
placed a band too high starts on content they cannot do.

Measured across all three courses, comparing placement content against lesson
content (listening on `audioText`, speak on `answer`, everything else on `prompt`,
the same rule `curriculum-consistency.test.ts` uses):

| course | overlapping placement questions |
|---|---|
| en | **25 of 60** |
| fr | 0 of 45 |
| es | 2 of 45 |

**Ten of English's 25 were self-inflicted and recent.** When the exam learned the
`listening` type (phase 5), all ten of its sentences were taken straight out of the
course's own listening packs -- a1p23, a2p21, b1p21, b2p21, c1p21. Every listening
question in the exam was scoring recall of one specific lesson item. The other 15
are older: 13 multiple-choice questions matching hand-written units, and 2
translate prompts matching a2p23 and c1p23 verbatim.

Neither existing check could see any of it, and that is structural rather than
bad luck: `curriculum-consistency.test.ts` compares lesson questions with each
other and never reads the placement pool, while `placement-validity.test.ts`
compares placement questions with each other and never reads the banks. A question
could sit in both sets forever with both suites green.

**All 27 fixes are on the placement side**, because placement ids are not
review-item keys (those are `lessonId:questionId`): rewriting a placement question
changes nothing a learner has scheduled, whereas editing a pack line changes the
content behind an id real users hold review state against. Each replacement keeps
its band and the construct under test, so the exam still measures what it claims.

Worth recording about the Spanish pair: `ep1` was `How do you say "thank you" in
Spanish?`, which is pack `esa1p1`'s own prompt TEMPLATE filled with one of its own
lines. Choosing a different word would collide again the moment that pack covered
it, and two packs share that template, so the question changed form instead. A
placement question built on a pack template is structurally at risk rather than
unluckily colliding.

Two new guards, both gated at zero for all three courses:
`placement-lesson-overlap.test.ts` (placement against the banks) and a
repeats-within-one-pool check added to `placement-validity.test.ts` -- the pool is
sampled three per band, so the same content in two bands can be drawn twice in one
sitting and counted twice. That third pairing had no owner either.

## Deferred structural changes

- **a1p15 "Shapes & Sizes" pack split** -- DECLINED for phase 1, and **no longer
  needed**; see the resolution note after this entry. The pack mixes
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

  **Resolved 2026-09-24 without a split.** The sentence above beginning "Note the
  ranking layer does NOT mitigate this pack" is the real diagnosis and it is
  correct; it was the remedy that was wrong, and it made this look like an
  id-migration problem when it was a tag-coverage problem.
  `scripts/gen-answer-pos.ts` read tags from cloze sentences only, so all 850
  pair lines went untagged and the ranking layer had nothing to rank by. It now
  also takes each pair pack's prompt template as a declaration of the answer's
  class, and a1p15's genuinely two-class pool is hand-labelled per word. No
  pack's `data` changed, so no id moved -- `english-id-parity.test.ts` passes
  with no re-baselining.

  Measured: cross-class distractors in a1p15 fell from **23 of 25** questions to
  **0 of 25**. "is a perfect cube shape" offered [cube, huge, narrow, average] --
  three of four from the wrong class, so no geometry was needed. The 25 questions
  of a1p15 are the **only** questions in the course whose choices changed; the
  corpus-wide tag map is byte-identical to before.

  **Two wrong turns on the way, both caught by review, both worth recording
  because each looked like the careful option.**

  *Reading the prompt template as a declaration of the answer's class.* "Which
  verb goes with ...?" cannot be answered by a noun, so 22 of the 34 pair packs
  can be tagged with no tagger involved. It is true, and it is **inert**: a
  declaration gives every answer in a pool the same class, and ranking is relative
  WITHIN the pool, so a uniformly-tagged pool ranks exactly as an untagged one
  does. The packs where a class could discriminate are precisely the mixed ones no
  template can describe. Meanwhile the declarations collided with sentence
  evidence and the agree-or-drop rule discarded 12 words -- measured net effect
  **43 questions degraded across 11 packs, 0 improved**, to fix 16 in one. It is
  withdrawn.

  *Assuming a dropped tag is a neutral abstention.* It is not, and this is the
  load-bearing fact in this whole area: `orderDistractorCandidates`'s `rank()`
  resolves an untagged candidate to the ANSWER's class, so a word with no tag is
  offered as a perfect distractor. **Dropping a tag promotes the word.** The 12
  discarded words were promoted into pools where they are ungrammatical -- "The
  trend shows a gradual ___ in average income" was offered "remained", and `light`
  was offered as a preposition in 8 of c1p20's questions. The generator printed
  those 12 losses and an earlier version of this entry described them as "the
  conservative rule working".

  What shipped instead: hand labels for mixed pools only, emitted as a **per-pack
  override map** that the corpus-wide map never sees. `light` stays a noun
  corpus-wide (from "Turn off the ___ before you sleep.") and is an adjective
  inside a1p15 ("is not heavy"), both true at once, and no other pack can lose
  anything.

  Two further alternatives were measured and declined. **Demoting untagged
  candidates** below known-same-class ones: 150 of the bank's 2,675 questions have
  fewer than 3 known same-class candidates, so they would draw the same handful of
  distractors on every question -- repetitive choices across 5.6% of the course.
  **Scoping the whole map per pack**, not just the labels: it removes the
  corpus-wide agreement check, which turns out to be doing a second job as an
  accuracy filter -- a word this tagger reads inconsistently is a word it is
  probably reading wrongly somewhere. Tried, and it tagged `coins` a Verb from
  a1p11's "Can I pay in ___ instead of cash?", promoting it into that pack's verb
  slot and breaking two of this audit's own hand-labelled guards.

No pack re-levelling was proposed: no pack was found materially mis-levelled.
