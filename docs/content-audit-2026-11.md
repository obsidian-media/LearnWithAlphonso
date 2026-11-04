# English lesson content audit, 2026-11

Measured on the English bank at main e4660169: 609 lessons, 3,096 questions,
2,631 derived vocabulary cards. Counts come from the built course, not from the
pack source. **This is a point-in-time audit; the tables below are the "before".**
What has been done since is in "Status" at the end of this file (updated 2026-11-04).

## Numbers first

| Defect                                                                                        | Before                                                                                           | After this branch       |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------- |
| (a) cloze questions where a wrong answer also makes a correct sentence, found by the detector | 119 distractors in 82 of 2,249 cloze questions (3.6%)                                            | 0                       |
| (a) the same, by hand-sampling 60 random A1/A2 cloze questions                                | about 18 of 60 (roughly 30%)                                                                     | not fixed, see below    |
| (b) cards whose "meaning" is the quiz explanation                                             | 2,631 of 2,631 (1,615 are the literal "X is correct here. ..." template)                         | 0 (meaning is empty)    |
| (b) cards whose "example" is the quiz prompt, not a sentence                                  | 1,327 of 2,631 (469 "Plural of ... -> x" style, 858 "___ ... -> x" with the blank still showing) | 0                       |
| (b) cards with a real example sentence                                                        | 1,304                                                                                            | 1,751                   |
| (c) lessons where every question is the same pick-the-word format                             | 533 of 609 (88%); 121 of 137 at A1                                                               | not fixed, planned      |
| (d) cards with no picture                                                                     | 2,354 of 2,631 (89.5%)                                                                           | owned by the photo pass |

## (a) Wrong answers that are not wrong

Cause: a cloze pack draws its distractors from the other answers of the same
pack. Packs mix words freely, so a distractor often fits the blank.

Five real examples the detector found (answer, then the distractor that also works):

1. "They ___ at home." are / study ("They study at home.")
2. "We ___ breakfast together." have / had
3. "He ___ not eat meat." does / did
4. "___ I open the window, please?" may / can, could
5. "The cat is sitting ___ the table." under / behind, beneath

The detector (`src/data/also-correct.ts`) is grammar families, not a parser:
be/do/have forms that agree with the subject when nothing fixes the tense;
interchangeable modals; a lexical verb in a "be" slot before an adverbial;
place prepositions before a definite object. It is deliberately skipped for tag
questions and where a past or future cue fixes the form.

What it cannot see is meaning. The 60-question hand sample found, besides the
cases above, mostly these:

1. "I ___ to the cinema yesterday." went / got, arrived
2. "The journey was as ___ as we expected." long / warm
3. "We ___ breakfast together as a family." eat / have
4. "The ATM is ___ the entrance." inside / opposite, outside
5. "The ___ are in aisle five." snacks / eggs

These need a human or a model reading each sentence. About 500 to 700 cloze
questions are likely affected (30% of 2,249; the sample is 60, so treat that as
roughly 20% to 40%). The fix for them is not a different distractor but a clue in
the sentence, or a distractor from a different word class. See the plan.

## (b) Derived vocabulary cards

The cards are derived from the quiz. A question carries no gloss of its word, only
an explanation of why the answer was right, so the old card printed that
explanation as the word's meaning. Its example was the quiz prompt with an arrow.

At the time of this audit the fix was: meaning empty, and the example a real sentence only when the question
is a cloze sentence with the answer put back in (since superseded by authored meanings, see Status). A quiz stem such as
"Plural of "baby": ___" or "Which word completes ... ?" gives no example.
Cards with a real example: 1,751 of 2,631 in English; French 1,117 of 2,565;
Spanish 975 of 2,575.

The picture key is unchanged (lowercased answer term into the image map).

The clients were changed to hide an empty meaning or example line (web, iOS and Android). For English the line is no longer empty, see Status.

## (c) One template

Question formats across the English bank: cloze pick-the-word 2,249 (73%),
pair pick-the-word 469 (15%), listening 126, speak 125, translate 125,
reorder 1, image matching 1. Listening, speaking and translating exist only as
whole lessons of their own (75 of 609 lessons), never mixed into a grammar lesson.
"To Be & Present Simple 1" is five cloze questions. 430 lessons use one format,
178 use two, one lesson uses five.

## (d) Cards with no picture

By level (cards, with a photo): A1 638/177, A2 504/77, B1 500/11, B2 486/10,
C1 503/2. Total 277 of 2,631. Most misses are grammar words that cannot be
photographed (would, was, had, is, have, on, were, could) and 245 are phrases of
three or more words. Another agent is running the second photo pass through the
existing pipeline; this audit does not plan it.

## Status (2026-11-04)

**Plan item 1, real meanings and examples: done for all of English A1 to C1** (#366 A1/A2, #369 B1 to C1). Measured on the built course: 2,629 cards (A1 636, A2 503, B1 500, B2 486, C1 504), every one with a meaning and an example; 509 have a photo. Optional `meaning` and `example` are the 3rd and 4th `|` fields of pair/cloze pack lines (and fields on the hand-written A1/A2 questions), bundled to iOS and Android through the existing exports, and held by `src/data/vocab-meanings.test.ts` for every level (meanings up to 8 words, examples up to 10 at A1 to B1 and 12 at B2/C1, vocabulary up to the card's own level, short words matched whole so "on" is not found in "London", no meaning that defines the word with itself, no example that describes the word instead of using it, no example without a meaning). Review of the first A1/A2 version found about 13% defective cards; the second pass fixed them. Packs whose answer is a definition (a2p12, b1p1, b1p14, b2p15 to b2p17, c1p1, c1p12, c1p18) set `termFromLeft`, and a question may carry an optional `term` that names the card word, with no id, option or answer moved; an empty `term` makes no card. French (2,565 cards) and Spanish (2,575) still have no authored meaning.

**Plan item 3 and problem (a), wrong answers that are not wrong:** worked through in #358 (policy `docs/distractor-policy.md`, the CI gate `src/data/distractor-gate.test.ts`, 815 reviewed rewrites in `docs/content-fixes-a1a2-phase1.md`), #363 and #365 (gate holes closed, absurd options replaced). Every gate budget is 0. A teacher-read sample of 60 questions against main measured 25% with problems and 10% with absurd options before #365 and 10% and 2% on its branch, so the gate is a floor, not proof.

**Plan item 2, more question formats (problem c):** not done; the next content branch is `feat/question-variety-a1a2`.

**Plan item 4, pictures (problem d):** the photo passes continue (1,154 live photos across the three courses on 2026-11-04).

## Original plan (items 1, 3 and 4 are done, see Status)

Costs are items and review time. No image credits and no paid API calls are needed
for anything below.

1. Real meanings and examples, A1 then A2: 638 + 504 = 1,142 cards. Draft one short
   gloss and one example sentence per card with a model, in the lesson's own words
   (about 100 tokens each, so around 120,000 output tokens), then a human reads all
   1,142 lines. Store as optional `meaning` and `example` on the pack line (a third
   and fourth `|` field), so cloze cards keep the filled sentence when none is
   authored. B1 to C1 (about 1,500 cards) after A1/A2 prove out.
2. More question formats, A1/A2 first (about 260 lessons). Reorder already exists in
   the app (one question uses it). Every cloze answer is a whole sentence, so a
   reorder can be generated mechanically from 1 cloze sentence per lesson with 3 to 8
   words: about 260 questions, all reviewed. Add 1 listening question per lesson from
   the same sentences (text-to-speech already exists): about 260 more. Translate needs
   two or three accepted wordings each, so author 1 per lesson: about 260.
3. The hand-sample defects in (a): run a model read over the roughly 1,200 A1/A2 cloze
   questions, asking only "does any wrong answer also fit?", then fix each by
   adding a clue to the sentence or swapping the distractor. Expect 300 to 450 fixes
   at A1/A2; the prepositions pack (`a1p4`, `a2p13`, `a2p17`) needs sentence clues,
   because after this branch its wrong answers are time words (during, since, for)
   and the contrast the lesson teaches is gone.
4. Pictures: owned by the second photo pass. No decision needed from this branch.

## Decisions for the owner

Item 1 was approved on 2026-11-04 (#366). The work on (a) went ahead in #358, #363 and #365; whether the preposition packs keep the "place word vs time word" stopgap was not re-checked in this pass.
