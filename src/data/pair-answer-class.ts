/**
 * What each pair pack's prompt template declares about its answer's word class.
 *
 * Distractors are drawn from a pack's own pool of answers and then ranked by
 * part-of-speech affinity (`src/lib/distractor-affinity.ts`), so an untagged
 * answer gets no ranking at all and the pool's raw order decides. Pair-pack
 * answers were untagged wholesale, because `scripts/gen-answer-pos.ts` reads
 * tags from a cloze line's sentence and a pair line has none. Measured effect:
 * 23 of a1p15's 25 questions offered a distractor from the wrong class -- "is a
 * perfect cube shape" offered [cube, huge, narrow, average], answerable without
 * knowing any geometry.
 *
 * The evidence used here is the template itself, because it is the author's own
 * statement of what the answer is: "Which verb goes with ...?" cannot be
 * answered by a noun. No NLP is involved, which is the point. Both automated
 * alternatives were measured against a 45-word hand-labelled sample and both
 * fail in ways that would do damage:
 *
 *   - **Bare-word tagging** (89% on that sample) calls `square`, `circle`,
 *     `cube`, `rock` and `eyes` verbs. This is the failure that already happened
 *     once here: an earlier map tagged 44.8% of the bank Verb and the ranking
 *     layer promoted nouns into verb slots -- the exact defect it exists to
 *     remove -- while every downstream test stayed green.
 *   - **A synthetic sentence frame** does not read a word's class, it imposes
 *     one. `It is X.` scores 93% and is wrong on every verb it sees (`catch`,
 *     `ascertain`, `assist` -> Noun); `They X.` scores 64% and turns 16 of this
 *     corpus's nouns into verbs. A frame's accuracy is a fact about the frame.
 *
 * `null` means the template declares nothing, and its answers stay untagged --
 * which is the right outcome, not a gap. Absence from this table means the same,
 * so a newly authored pack is never tagged by accident; `pair-pack-class.test.ts`
 * requires every pair template to appear here so the choice is made explicitly.
 */
export const DECLARED_BY_TEMPLATE: Record<string, string | null> = {
  // --- Nouns ---
  'Plural of "%s":': "Noun",
  'Female form of "%s":': "Noun",
  'Someone who "%s" is a…': "Noun",
  'An animal that "%s" is a…': "Noun",
  'Which noun goes with "%s"?': "Noun",
  'The body part "%s" is your…': "Noun",
  'This hobby involves "%s"…': "Noun",
  'Which sport or hobby uses "%s"?': "Noun",
  'Noun form of "%s":': "Noun",
  'The noun form of "%s" is…': "Noun",
  'Complete: "%s ___"': "Noun",
  'Complete the collocation with "%s"…': "Noun",

  // --- Verbs ---
  'Which verb goes with "%s"?': "Verb",
  'Past simple of "%s":': "Verb",
  'Which verb means "%s"?': "Verb",
  // c1p2's answers are all formal verbs (ascertain, obtain, commence). The
  // template would permit a noun in principle; the pack does not contain one,
  // and the coverage test would catch it if that changed.
  'Formal equivalent of "%s":': "Verb",

  // --- Adjectives ---
  // a1p3's pool is 25 adjectives. "Opposite of" would permit any class, so this
  // is a claim about the pack as authored, held by the same test.
  'Opposite of "%s":': "Adjective",
  'Comparative of "%s":': "Adjective",
  'Superlative of "%s":': "Adjective",
  'Which trait means "%s"?': "Adjective",
  'Which word pairs with "%s"?': "Adjective",

  // --- Declares nothing, deliberately ---
  // a1p15 mixes shape nouns with size adjectives. This is the pack the content
  // audit flagged; it is handled per-word in DECLARED_BY_PACK below, because the
  // pool genuinely is two classes and no template-level claim can be honest.
  'Something that "%s" is…': null,
  // b1p5 is mostly nouns but holds "agree", and "touch"/"work" read either way.
  'Which word completes "%s"?': null,
  // b2p2 is cross-class ON PURPOSE -- affect/effect, its/it's, principle/principal.
  // Tagging it would demote exactly the distractors that make it a real question.
  'Which fits: "%s"?': null,
  // c1p18 mixes adjectives ("unemployed") with nouns ("prison").
  'The phrase "%s" is a polite way of saying…': null,

  // Gloss-phrase packs: the answer is a definition, so tagging its first word
  // says nothing at all ("every single time" -> Determiner). Listed as explicit
  // nulls rather than omitted, so the coverage test passes and a future pack
  // using one of these templates is a considered case, not a silent skip.
  '"%s" means:': null,
  'How often does "%s" happen?': null,
  'Someone who is "%s" tends to…': null,
  'The expression "%s" means…': null,
  'The connector "%s" is used to…': null,
  'The phrasal verb "%s" means…': null,
  'The idiom "%s" means…': null,
};

/**
 * Hand-labelled answers for a pack whose pool is genuinely two word classes, so
 * no template-level claim could be honest.
 *
 * a1p15 "Shapes & Sizes" is the one defect the content audit deferred. Its log
 * entry diagnosed the cause correctly -- "its answers appear only in 'pair'
 * lines, which carry no sentence, so they are deliberately left untagged and no
 * preference is expressed" -- but proposed a pack split as the remedy, and that
 * is why it was declined: splitting adds or removes lines, question ids are
 * index-derived (`${pack.id}q${i}`), and every user's saved review items are
 * keyed on `lessonId:questionId`. Labelling the words here changes no line, so
 * no id moves.
 *
 * Labelled by reading the pack, not by any tagger: `towering` and `oversized`
 * are participial adjectives that `compromise` calls verbs, and `oval` is a
 * shape noun it calls an adjective. Three of 25 would be wrong if this were
 * automated.
 *
 * Note `light` does not survive into the map: a1p18 declares it a Noun ("Which
 * noun goes with 'not heavy'") and this pack an Adjective, so the generator's
 * agree-or-drop rule discards it rather than letting one pack win. That is the
 * intended outcome -- it is genuinely both in this corpus.
 */
export const DECLARED_BY_PACK: Record<string, Record<string, string>> = {
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
