/**
 * Hand-labelled word classes for packs whose answer pool mixes classes.
 *
 * Multiple-choice distractors are drawn from a pack's own pool of answers and
 * ranked by part-of-speech affinity (`src/lib/distractor-affinity.ts`), using
 * tags that `scripts/gen-answer-pos.ts` reads from each answer's own cloze
 * sentence. A "pair" pack line has no sentence, so its answers were untagged and
 * the ranking layer had nothing to rank by. Measured consequence in a1p15
 * "Shapes & Sizes", which mixes shape nouns with size adjectives: 23 of its 25
 * questions offered a distractor from the other class, and "is a perfect cube
 * shape" offered [cube, huge, narrow, average] -- three of four from the wrong
 * class, answerable with no geometry at all.
 *
 * ## Why only mixed packs are listed
 *
 * Because a uniform pool cannot produce a cross-class distractor. Every candidate
 * in a1p1 "Plurals" is a plural noun, so no tag could change which one is
 * offered: ranking is relative WITHIN the pool, and a class shared by every
 * candidate expresses no preference at all.
 *
 * Worth stating, because the first version of this file did the opposite. It read
 * each pair pack's prompt template as a declaration of its answers' class ("Which
 * verb goes with ...?" cannot be answered by a noun) and tagged 530 lines across
 * 22 uniform packs. That table was inert BY CONSTRUCTION -- a uniform tag over a
 * pool leaves every candidate ranked equally, exactly as no tags would -- while
 * its side effects were real: those tags collided with sentence evidence, the
 * agree-or-drop rule discarded 12 words, and discarding is not neutral (below).
 * Measured net effect: 43 questions degraded across 11 packs, 0 improved, to fix
 * 16 in one. The packs that need labels are precisely the ones no template-level
 * claim could have described.
 *
 * ## Why these are overrides rather than entries in ANSWER_POS
 *
 * A hand label is ground truth, and `ANSWER_POS` drops any word its sources
 * disagree about. Putting labels there lets a tagger's reading discard one -- and
 * an absent tag is NOT an absent preference: `rank()` resolves an untagged
 * candidate to the answer's own class, so a word with no tag is offered as though
 * it were a perfect match. Dropping a tag promotes the word.
 *
 * Scoping also lets two true things coexist: `light` is a noun in a1p18 ("bright
 * light") and an adjective in a1p15 ("is not heavy"). Corpus-wide, that conflict
 * discarded `light` entirely and promoted it into pools where it is
 * ungrammatical -- it was offered as a preposition in 8 of c1p20's questions.
 *
 * The corpus-wide agree-or-drop rule is deliberately left alone for TAGGER
 * evidence, where it does a second job: a word this tagger reads inconsistently
 * is a word it is probably reading wrongly somewhere. Scoping the whole map per
 * pack was tried, and it tagged `coins` a Verb from a1p11's "Can I pay in ___
 * instead of cash?", promoting it into that pack's verb slot. The corpus-wide
 * check had been masking that error.
 *
 * ## Why hand labels and not a tagger
 *
 * Both automated routes were measured against a 45-word hand-labelled sample and
 * both fail in ways that would do damage:
 *
 *   - Bare-word tagging (89%) calls `square`, `circle`, `cube`, `rock` and `eyes`
 *     verbs. This failure already shipped here once: an earlier map tagged 44.8%
 *     of the bank Verb and the ranking layer promoted nouns into verb slots --
 *     the exact defect it exists to remove -- while every downstream test stayed
 *     green.
 *   - A synthetic sentence frame does not read a word's class, it IMPOSES one.
 *     `It is X.` scores 93% and is wrong on every verb it sees (`catch`,
 *     `ascertain`, `assist` -> Noun); `They X.` scores 64% and turns 16 of this
 *     corpus's nouns into verbs. A frame's accuracy is a fact about the frame's
 *     syntax and the sample's composition, not about the data.
 *
 * On this pack a tagger gets three of 25 wrong: `towering` and `oversized` are
 * participial adjectives it reads as verbs, and `oval` is a shape noun it reads
 * as an adjective.
 *
 * ## Adding a pack here
 *
 * Label EVERY single-word answer in the pool, not the ones that look wrong. A
 * half-labelled mixed pack is worse than an unlabelled one: the labelled half
 * gets a preference, the unlabelled half is treated as same-class-as-anything,
 * and the gaps become the distractors that get promoted. `pair-pack-class.test.ts`
 * enforces this.
 */
export const HAND_LABELLED_PACKS: Record<string, Record<string, string>> = {
  // a1p15 "Shapes & Sizes" -- the content audit's one deferred defect. Its log
  // entry diagnosed the cause correctly ("its answers appear only in 'pair'
  // lines, which carry no sentence, so they are deliberately left untagged and no
  // preference is expressed") but proposed a pack split as the remedy, which is
  // why it was declined and stayed open: splitting adds or removes lines,
  // question ids are index-derived (`${pack.id}q${i}`), and every user's saved
  // review items are keyed on `lessonId:questionId`. Labelling here changes no
  // line, so no id moves.
  a1p15: {
    triangle: "Noun",
    square: "Noun",
    circle: "Noun",
    rectangle: "Noun",
    pentagon: "Noun",
    hexagon: "Noun",
    oval: "Noun",
    octagon: "Noun",
    cube: "Noun",
    sphere: "Noun",
    cone: "Noun",
    cylinder: "Noun",
    huge: "Adjective",
    tiny: "Adjective",
    thin: "Adjective",
    thick: "Adjective",
    long: "Adjective",
    short: "Adjective",
    towering: "Adjective",
    narrow: "Adjective",
    broad: "Adjective",
    light: "Adjective",
    heavy: "Adjective",
    average: "Adjective",
    oversized: "Adjective",
  },
};

/**
 * Every pair pack whose pool mixes word classes, and what was decided about it.
 *
 * Read off the content by hand. Its purpose is to force the decision to be
 * explicit for each one rather than leave a pack silently unlabelled --
 * `pair-pack-class.test.ts` fails on a mixed pack that appears in neither this
 * list nor `HAND_LABELLED_PACKS`.
 *
 * `b2p2` is mixed and deliberately stays unlabelled: its cross-class choices ARE
 * the exercise (affect/effect, its/it's, principle/principal). Labelling it would
 * demote exactly the distractors that make it a real question.
 */
export const MIXED_POOL_PACKS: Record<string, "labelled" | "deliberately-unlabelled"> = {
  a1p15: "labelled", // shape nouns + size adjectives
  b1p5: "deliberately-unlabelled", // mostly nouns, but holds "agree"; "touch"/"work" read either way
  b2p2: "deliberately-unlabelled", // cross-class BY DESIGN: affect/effect, its/it's
  b1p1: "deliberately-unlabelled", // gloss phrases, nearly all multi-word
  c1p1: "deliberately-unlabelled", // gloss phrases
  c1p18: "deliberately-unlabelled", // adjectives ("unemployed") alongside nouns ("prison")
};
