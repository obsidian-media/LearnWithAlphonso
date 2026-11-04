# Distractor policy

What a wrong option in a multiple-choice or fill-in question must be. The rules are
enforced by `src/data/distractor-gate.test.ts`, using the slot types and pools in
`src/data/slot-types.ts`.

Why this exists: a learner who sees a nonsense option ("The dog is ___ the door":
into / down / behind / during) feels attacked, and a learner who picks a correct
option marked wrong ("They study at home") stops trusting the app. Both come from
filling options mechanically from other lines of the same pack. A wrong option has
to earn its place.

## The three rules

Every wrong option must be all three:

1. **Same slot.** It is the same kind of thing as the answer and fits the same slot.
   A place preposition for a place slot, a form of the same verb for a tense slot,
   a greeting for a greeting slot. Never a different part of speech, never a motion
   word in a place slot, never a time word in a place slot.
2. **Tempting.** A real learner might pick it: a common learner error, a near form,
   a confusable word. If nobody would ever pick it, it is not a distractor, it is
   filler.
3. **Clearly wrong, because of something in the question.** A bracketed clue, a time
   word, the subject, a picture, or the rest of the sentence rules it out. The
   learner can always explain why it is wrong.

## Two rules that follow

- **No absurd option.** Banned, with the reason: "during" in a place slot (wrong slot),
  "can to" / "cans" (not a form anyone learns, so not tempting), "cheese" in "She is
  wearing a red ___" (wrong slot).
- **No second right answer.** If two members of the slot's pool make a correct
  sentence, the question must disambiguate (below). The also-correct detector
  (`src/data/also-correct.ts`) and the hand-written known-correct list guard this.

## Slot types

Each cloze or multiple-choice question has a slot type, inferred from the prompt and
the answer (`inferSlot`). A slot type has a curated pool of plausible options.

| Slot type          | Pool (examples)                                                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `place-prep`       | in, on, at, under, behind, next to, in front of, between, opposite, above, below, near, beside, inside, outside, against, among |
| `motion-prep`      | into, out of, onto, across, through, along, up, down, over, past, towards, around                                               |
| `time-prep`        | at, on, in, by, for, during, since, until, from, before, after                                                                  |
| `modal`            | can, could, may, might, must, should, would, will, shall and their negatives                                                    |
| `aux`              | be, do and have forms (am, is, are, was, were, do, does, did, has, had ...)                                                     |
| `wh-word`          | what, when, where, why, who, whose, which, how, how much, how many, how often ...                                               |
| `quantifier`       | much, many, few, little, a few, a little, some, any, enough, plenty, several, lots of, no, most ...                             |
| `collocation-verb` | make, do, take, have, get, give, go, spend, pay, catch, play ...                                                                |
| `inflection`       | forms of the same lemma: regularised, participle, mis-spelt, "more"/"most" variants                                             |
| `category:<pack>`  | the other words of the same topic pack (food, clothes, rooms ...)                                                               |

A question whose slot cannot be inferred is **unclassified**. Unclassified questions
are counted and the count may only go down.

## Disambiguating, not removing

When several pool members fit the sentence, keep the plausible options and make the
question choose one, in this order of preference:

1. a short **clue** in brackets: `The cat is ___ the table. (below it)`;
2. a **picture** (`imageKey` on the question), where one exists;
3. a **rewrite** of the sentence that only one option fits.

Do not swap in an absurd word to make the question "work".

## The gate

For every A1/A2 question in the English bank:

- every wrong option is in its slot's pool, or on the reviewed allow-list
  (`DISTRACTOR_ALLOW`, each entry with a reason; it is empty today) or in the pack's reviewed
  extra vocabulary (`src/data/pack-extra-vocab.ts`, same-kind words a pack never teaches);
- no wrong option is also correct (the detector, unless a clue disambiguates);
- a `category:<pack>` question needs a clue or picture, an inflection question needs a time
  anchor, and a reviewed context needs a reason written for that question; all of these budgets
  are 0 and stay 0;
- unit lessons u1-u9 are covered as well as the packs.

The gate is mutation-checked on real examples: "into / down / behind / during" and
"ought / used / can to / can" must fail it.

## How a question is disambiguated in the data

A `QuestionFix` (src/data/question-fixes-a1a2.ts) can carry:

- `prompt`: the prompt with a bracketed clue added;
- `wrong`: replacement wrong options, in order (answer text, answer index and id never change);
- `imageKey`: a reviewed photo from `VOCAB_IMAGES` that shows the answer (multiple choice only);
- `context`: reviewed, the sentence already rules the other options out, so no clue is needed;
- `slot`: a reviewed slot type where inference cannot know it (irregular verb forms).

Hand-authored phrase questions (greetings, replies, set phrases) are `phrase` slots. They
must be listed in `src/data/reviewed-phrases.ts` after someone has read them.

Topic-word clues describe the situation, not the dictionary definition: "(you tap your card)",
not "(a kind of payment)". Wrong options for a topic word are other words of the same topic.
