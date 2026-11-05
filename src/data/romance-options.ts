// Wrong options for the hand-authored French and Spanish A1/A2 packs.
//
// Why this exists: the pack engine fills a question's wrong options from the other answers of the
// same pack, with no look at what the answer IS. A measurement of 60 random A1/A2 questions per
// language (PR body) found the same defects again and again: a colour offered as the French word
// for "jacket", a noun offered for "to sing", "prochaine / style / noir" offered for a blank that
// wants an adjective of size, two options that both translate the English ("parfois" and "de temps
// à autre" for "sometimes"), and Negation lines where "pas", "plus" and "jamais" all fit.
//
// Three mechanisms, all deterministic and all limited to the A1/A2 packs:
//  1. WORD CLASS (pair packs). A wrong option must be the same kind of word as the answer: a verb
//     for "to ...", a noun for a noun, a phrase for a phrase. `optionClass` reads it off the
//     gloss and the answer; PACK_CLASS_LABELS says it by hand for the few packs whose single
//     words mix nouns and adjectives (Spanish has no article to tell nouns apart).
//  2. NO SECOND ANSWER (pair packs). A wrong option may not contain the answer or sit inside it
//     ("où" / "où est", "cajero" / "cajero automático"), and may not be a synonym the pack also
//     teaches (SYNONYM_GROUPS, ANSWER_BANS).
//  3. AUTHORED OPTIONS (cloze packs). A fill-in sentence takes its three wrong options from
//     ROMANCE_CLOZE (src/data/romance-cloze-options.ts), written for that sentence, with a short
//     English clue where more than one answer would fit.

export type OptionClass = "verb" | "noun" | "sentence" | "word" | "adj" | "day" | "month";

/** The packs these rules apply to: A1 and A2, hand-authored or generated ("fra1p3", "esa2p15", "frga2p1"). */
export const ROMANCE_A1A2 = /^(fr|es)g?a[12]p\d+$/;

const norm = (s: string) => s.toLowerCase().replace(/[’]/g, "'").trim();

/** Lower-case word tokens, apostrophes split ("l'addition" -> l, addition). */
export function optionTokens(s: string): string[] {
  return norm(s)
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(" ")
    .filter(Boolean);
}

/** True when the token sequence of one option sits whole inside the other (either way round). */
export function optionsOverlap(a: string, b: string): boolean {
  const x = optionTokens(a);
  const y = optionTokens(b);
  if (!x.length || !y.length) return false;
  const [s, l] = x.length <= y.length ? [x, y] : [y, x];
  for (let i = 0; i + s.length <= l.length; i++) if (s.every((t, k) => l[i + k] === t)) return true;
  return false;
}

/**
 * Options that translate the same English, so offering one as the wrong option for the other
 * leaves two right answers. Lower case, as in the pack.
 */
export const SYNONYM_GROUPS: string[][] = [
  // French
  ["parfois", "de temps en temps", "de temps à autre", "occasionnellement"],
  ["souvent", "fréquemment", "régulièrement"],
  ["rarement", "peu souvent", "presque jamais"],
  ["tous les jours", "quotidiennement", "chaque jour"],
  ["toutes les semaines", "chaque semaine", "une fois par semaine"],
  ["tous les mois", "chaque mois"],
  ["toujours", "constamment", "presque toujours"],
  ["récemment", "dernièrement"],
  ["dans", "à l'intérieur de"],
  ["près de", "à côté de"],
  ["l'épouse", "la femme"],
  // Spanish
  ["a veces", "de vez en cuando"],
  ["mucho", "muchos"],
  ["poco", "pocos"],
  ["algunos", "varios"],
  ["casi", "aproximadamente"],
  ["completamente", "totalmente"],
  ["durante", "por"],
];

/**
 * Directional bans: option -> answers it must not appear beside. "vieux" is the natural opposite
 * of "neuf" too, so it may not be a wrong option there (the pack's own answer is "usé").
 */
export const ANSWER_BANS: Record<string, string[]> = {
  usé: ["vieux"],
  quoi: ["quel", "qu'est-ce que", "qu'est-ce qui"],
  quel: ["lequel", "lesquels", "quelle heure", "quel âge"],
};

export function sameMeaning(a: string, b: string): boolean {
  const x = norm(a);
  const y = norm(b);
  if (SYNONYM_GROUPS.some((g) => g.includes(x) && g.includes(y))) return true;
  return (ANSWER_BANS[x] ?? []).includes(y);
}

/** French packs whose answers start with "le" / "une" without being nouns ("le long de", "une fois"). */
const NO_ARTICLE_CLASS = new Set(["fra1p12", "fra2p13", "fra2p17"]);
/** Packs of prepositions, adverbs and adjectives, where a four-word answer ("à l'intérieur de") is still a single word. */
const PHRASE_AS_WORD = new Set([
  "fra1p12",
  "fra1p19",
  "fra2p13",
  "fra2p17",
  "esa1p19",
  "esa1p26",
  "esa2p15",
  "esa2p24",
  "esa2p25",
]);
const FR_ARTICLE = /^(le|la|les|un|une|des|du) \S|^l['’]\S/i;

/**
 * One letter per line, for the packs whose single words mix classes and have no article to say so
 * (Spanish nouns and adjectives; French days, months and adverbs).
 * n noun, a adjective or adverb, v verb, w anything else (a short phrase), d day, m month.
 */
export const PACK_CLASS_LABELS: Record<string, string> = {
  // days 7, adverbs of time 5, week/month/year, three "in the ..." phrases, early/late
  esa1p6: "dddddddaaaaannnwwwaa",
  // 9 colours, 11 shape nouns, 5 shade adjectives
  esa1p25: "aaaaaaaaannnnnnnnnnnaaaaa",
  // 14 nouns, delicious/hungry/thirsty, three utensils
  esa2p1: "nnnnnnnnnnnnnnaaannn",
  // 11 places, 7 direction words, corner, traffic light
  esa2p3: "nnnnnnnnnnnaaaaaaann",
  // money, price, expensive, cheap, cashier, buy, sell, 7 nouns, free, sale, pay, 3 nouns
  esa2p7: "nnaanvvnnnnnnnanvnnn",
  // nine nouns, sick, healthy, four nouns
  esa2p11: "nnnnnnnnnaannnn",
  // quantity words; "half" and "most" are nouns
  esa1p23: "aaaaaaaaanaaanaaaaaaaaaaa",
  // 14 prepositions and connectors, then 11 adverbs of time
  esa2p25: "wwwwwwwwwwwwwwaaaaaaaaaaa",
  // 12 prepositions and time phrases, 10 adverbs, 3 more prepositions
  fra2p13: "wwwwwwwwwwwwaaaaaaaaaawww",
  // 12 months, spring/summer/autumn/winter, season, calendar, century, decade
  esa2p19: "mmmmmmmmmmmmnnnnnnnn",
  // 7 days, 12 months, 4 seasons, today, tomorrow
  fra1p5: "dddddddmmmmmmmmmmmmnnnnaa",
};

/** The class of a pair line's answer, from its English gloss and the French or Spanish answer. */
export function optionClass(
  packId: string,
  index: number,
  gloss: string,
  answer: string,
): OptionClass {
  const label = PACK_CLASS_LABELS[packId]?.[index];
  if (label)
    return ({ n: "noun", a: "adj", v: "verb", w: "word", d: "day", m: "month" } as const)[
      label as "n" | "a" | "v" | "w" | "d" | "m"
    ];
  if (/^to [a-z]/i.test(gloss)) return "verb";
  if (packId.startsWith("fr") && !NO_ARTICLE_CLASS.has(packId) && FR_ARTICLE.test(answer))
    return "noun";
  // A whole sentence or question (greetings, set phrases) is only offered beside other sentences.
  if (/[?¿…]|\.\.\./.test(answer)) return "sentence";
  if (!PHRASE_AS_WORD.has(packId) && optionTokens(answer).length >= 4) return "sentence";
  return "word";
}

export type Candidate = { text: string; cls: OptionClass };

/**
 * Reviewed same-class wrong options a pack does not teach as an answer, for the packs that hold only
 * two or three verbs: without them a verb question would take its wrong options from nouns.
 */
export const EXTRA_DECOYS: Record<string, { cls: OptionClass; words: string[] }[]> = {
  fra1p5: [{ cls: "adj", words: ["hier", "maintenant", "bientôt", "ce soir"] }],
  fra1p14: [{ cls: "word", words: ["neuf", "pratique", "lourd", "utile"] }],
  fra1p15: [{ cls: "verb", words: ["réserver", "goûter", "servir", "payer"] }],
  fra1p17: [{ cls: "verb", words: ["imprimer", "cliquer", "brancher", "recevoir"] }],
  fra1p20: [{ cls: "verb", words: ["atterrir", "arriver", "garer", "freiner"] }],
  fra2p18: [{ cls: "verb", words: ["jouer", "nager", "courir", "marquer"] }],
  fra2p19: [{ cls: "verb", words: ["licencier", "travailler", "signer", "planifier"] }],
  esa1p6: [
    { cls: "noun", words: ["día", "hora", "minuto"] },
    { cls: "word", words: ["al mediodía", "a medianoche", "de día"] },
  ],
  esa1p23: [{ cls: "noun", words: ["cuarto", "resto", "parte"] }],
  esa2p1: [{ cls: "adj", words: ["picante", "salado", "dulce", "caliente"] }],
  esa2p7: [
    { cls: "verb", words: ["gastar", "cobrar", "ahorrar", "costar"] },
    { cls: "adj", words: ["nuevo", "usado", "pagado"] },
  ],
  esa2p11: [{ cls: "adj", words: ["herido", "cansado", "mareado", "débil"] }],
  esa2p23: [{ cls: "verb", words: ["depositar", "retirar", "firmar", "ahorrar"] }],
};

/** Why a candidate may not be a wrong option for this answer (null: it may). */
export function bannedBecause(answer: string, candidate: string): string | null {
  if (norm(answer) === norm(candidate)) return "same as the answer";
  if (optionsOverlap(answer, candidate)) return "contains or sits inside the answer";
  if (sameMeaning(answer, candidate)) return "means the same as the answer";
  return null;
}

/**
 * Words that are pronounced the same (for most speakers), so a listening question whose choices
 * differ only by such a word cannot be answered by ear: "Ces photos" / "Ses photos", "le pain" /
 * "le pin", and for Latin American Spanish every seseo, b/v and ll/y pair ("cima" / "sima").
 */
export const HOMOPHONE_GROUPS: string[][] = [
  // French
  ["ces", "ses"],
  ["cou", "coup"],
  ["vert", "verre", "vers", "ver"],
  ["pain", "pin"],
  ["mer", "mère", "maire"],
  ["sain", "saint", "sein"],
  ["foie", "fois", "foi"],
  ["ou", "où"],
  ["a", "à"],
  ["sur", "sûr"],
  // Spanish
  ["cima", "sima"],
  ["encausar", "encauzar"],
  ["varón", "barón"],
  ["acechar", "asechar"],
  ["cocer", "coser"],
  ["taza", "tasa"],
  ["casa", "caza"],
  ["rebelarse", "revelarse"],
  ["vaca", "baca"],
  ["tubo", "tuvo"],
  ["votar", "botar"],
  ["haya", "halla"],
  ["hola", "ola"],
  ["sumo", "zumo"],
  ["cebo", "sebo"],
  ["bello", "vello"],
  ["onda", "honda"],
  ["vasto", "basto"],
  ["rayar", "rallar"],
  ["rayara", "rallara"],
  ["pollo", "poyo"],
  ["calló", "cayó"],
];

const HOMOPHONE_OF = new Map<string, number>();
HOMOPHONE_GROUPS.forEach((g, i) => g.forEach((w) => HOMOPHONE_OF.set(w, i)));

/** True when two sentences differ only by words that sound the same: nobody can tell them apart by ear. */
export function homophoneOnly(a: string, b: string): boolean {
  const x = optionTokens(a);
  const y = optionTokens(b);
  if (x.length !== y.length) return false;
  let differs = false;
  for (let i = 0; i < x.length; i++) {
    if (x[i] === y[i]) continue;
    const gx = HOMOPHONE_OF.get(x[i]!);
    if (gx === undefined || gx !== HOMOPHONE_OF.get(y[i]!)) return false;
    differs = true;
  }
  return differs;
}
