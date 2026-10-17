import type { EnglishVerb, Noun, Person, Six, Use } from "./romance";

/**
 * French authority tables for the generative templates. Hand-written and
 * hand-verified; french-verbs + french-verbs-lefff are a SECOND source that
 * has to agree (see fr-data.test.ts), never the source of these strings.
 * Nothing in this file is copied from the Lefff lexicon.
 */

export type FrVerb = {
  inf: string;
  aux: "avoir" | "etre";
  /** True only for verbs the library also reports as always taking être. */
  alwaysEtre?: true;
  /** Dual-auxiliary verb used with être ONLY (intransitive): never given an object. */
  intransitiveOnly?: "etre";
  present: Six;
  /** Every other accepted spelling per person (e.g. paie/paye). Empty here. */
  presentAlt?: Partial<Record<Person, string[]>>;
  participle: string;
  /** être verbs: the four agreeing participles, written out. */
  pcEtre?: { ms: string; fs: string; mp: string; fp: string };
  /** Required when the infinitive starts with a vowel, h, y or w. */
  elides?: boolean;
  en: EnglishVerb;
  /** avoir verbs: the hand-written meaning allowlist. */
  uses?: Use[];
  /** être verbs: which relation the place phrase takes, and where it is natural. */
  places?: { rel: "to" | "at" | "from"; keys: string[]; enRel?: "to" | "at" | "from" };
};

export const FR_AVOIR_PRESENT: Six = ["ai", "as", "a", "avons", "avez", "ont"];
export const FR_ETRE_PRESENT: Six = ["suis", "es", "est", "sommes", "êtes", "sont"];

export const FR_VERBS: FrVerb[] = [
  {
    inf: "manger",
    aux: "avoir",
    present: ["mange", "manges", "mange", "mangeons", "mangez", "mangent"],
    participle: "mangé",
    en: { base: "eat", third: "eats", past: "ate" },
    uses: [
      // "le fruit" / "le légume" read as generic nouns; only the indefinite is natural.
      {
        cls: "food-count",
        kinds: ["indefinite", "definite"],
        nouns: ["pomme", "banane", "orange", "gâteau", "œuf"],
      },
      { cls: "food-count", kinds: ["indefinite"], nouns: ["fruit"] },
      // "un légume" is not how anyone says it: the plural is.
      { cls: "food-count", kinds: ["indefinite"], nouns: ["légume"], pluralIndefinite: true },
      // "du beurre" on its own is odd as something one eats.
      { cls: "food-mass", kinds: ["partitive"], except: ["beurre"] },
    ],
  },
  {
    inf: "cuisiner",
    aux: "avoir",
    present: ["cuisine", "cuisines", "cuisine", "cuisinons", "cuisinez", "cuisinent"],
    participle: "cuisiné",
    en: { base: "cook", third: "cooks", past: "cooked" },
    uses: [
      { cls: "food-mass", kinds: ["partitive"], except: ["beurre"] },
      { cls: "food-count", kinds: ["indefinite"], nouns: ["œuf", "gâteau"] },
    ],
  },
  {
    inf: "boire",
    aux: "avoir",
    present: ["bois", "bois", "boit", "buvons", "buvez", "boivent"],
    participle: "bu",
    en: { base: "drink", third: "drinks", past: "drank" },
    uses: [{ cls: "drink", kinds: ["partitive"] }],
  },
  {
    inf: "prendre",
    aux: "avoir",
    present: ["prends", "prends", "prend", "prenons", "prenez", "prennent"],
    participle: "pris",
    en: { base: "have", third: "has", past: "had" },
    uses: [{ cls: "drink", kinds: ["partitive"] }],
  },
  {
    inf: "porter",
    aux: "avoir",
    present: ["porte", "portes", "porte", "portons", "portez", "portent"],
    participle: "porté",
    en: { base: "wear", third: "wears", past: "wore" },
    uses: [{ cls: "clothing", kinds: ["indefinite", "definite"] }],
  },
  {
    inf: "mettre",
    aux: "avoir",
    present: ["mets", "mets", "met", "mettons", "mettez", "mettent"],
    participle: "mis",
    en: { base: "put on", third: "puts on", past: "put on" },
    // The ONLY class mettre accepts: "mettre le pain" is a different verb sense.
    uses: [{ cls: "clothing", kinds: ["indefinite", "definite"] }],
  },
  {
    inf: "acheter",
    aux: "avoir",
    elides: true,
    present: ["achète", "achètes", "achète", "achetons", "achetez", "achètent"],
    participle: "acheté",
    en: { base: "buy", third: "buys", past: "bought" },
    uses: [
      { cls: "clothing", kinds: ["indefinite", "definite"] },
      { cls: "school-object", kinds: ["indefinite", "definite"] },
      // A key is something one is given, not something one buys.
      { cls: "household-object", kinds: ["indefinite", "definite"], except: ["clé"] },
      { cls: "readable", kinds: ["indefinite", "definite"] },
    ],
  },
  {
    inf: "ouvrir",
    aux: "avoir",
    elides: true,
    present: ["ouvre", "ouvres", "ouvre", "ouvrons", "ouvrez", "ouvrent"],
    participle: "ouvert",
    en: { base: "open", third: "opens", past: "opened" },
    uses: [{ cls: "openable", kinds: ["definite"] }],
  },
  {
    inf: "voir",
    aux: "avoir",
    present: ["vois", "vois", "voit", "voyons", "voyez", "voient"],
    participle: "vu",
    en: { base: "see", third: "sees", past: "saw" },
    uses: [{ cls: "watchable", kinds: ["indefinite", "definite"] }],
  },
  {
    inf: "regarder",
    aux: "avoir",
    present: ["regarde", "regardes", "regarde", "regardons", "regardez", "regardent"],
    participle: "regardé",
    en: { base: "watch", third: "watches", past: "watched" },
    uses: [{ cls: "watchable", kinds: ["indefinite", "definite"] }],
  },
  {
    inf: "lire",
    aux: "avoir",
    present: ["lis", "lis", "lit", "lisons", "lisez", "lisent"],
    participle: "lu",
    en: { base: "read", third: "reads", past: "read" },
    uses: [{ cls: "readable", kinds: ["indefinite", "definite"] }],
  },
  {
    inf: "choisir",
    aux: "avoir",
    present: ["choisis", "choisis", "choisit", "choisissons", "choisissez", "choisissent"],
    participle: "choisi",
    en: { base: "choose", third: "chooses", past: "chose" },
    uses: [
      { cls: "readable", kinds: ["indefinite", "definite"] },
      { cls: "school-object", kinds: ["indefinite", "definite"] },
    ],
  },
  // --- être verbs (passé composé only) ---
  {
    inf: "aller",
    aux: "etre",
    alwaysEtre: true,
    elides: true,
    present: ["vais", "vas", "va", "allons", "allez", "vont"],
    participle: "allé",
    pcEtre: { ms: "est allé", fs: "est allée", mp: "sont allés", fp: "sont allées" },
    en: { base: "go", third: "goes", past: "went" },
    places: {
      rel: "to",
      keys: [
        "école",
        "marché",
        "magasin",
        "supermarché",
        "bibliothèque",
        "parc",
        "gare",
        "cinéma",
        "théâtre",
        "aéroport",
      ],
    },
  },
  {
    inf: "venir",
    aux: "etre",
    alwaysEtre: true,
    present: ["viens", "viens", "vient", "venons", "venez", "viennent"],
    participle: "venu",
    pcEtre: { ms: "est venu", fs: "est venue", mp: "sont venus", fp: "sont venues" },
    en: { base: "come", third: "comes", past: "came" },
    places: {
      rel: "from",
      keys: ["école", "marché", "magasin", "supermarché", "bibliothèque", "parc", "gare"],
    },
  },
  {
    inf: "arriver",
    aux: "etre",
    alwaysEtre: true,
    elides: true,
    present: ["arrive", "arrives", "arrive", "arrivons", "arrivez", "arrivent"],
    participle: "arrivé",
    pcEtre: { ms: "est arrivé", fs: "est arrivée", mp: "sont arrivés", fp: "sont arrivées" },
    en: { base: "arrive", third: "arrives", past: "arrived" },
    places: {
      rel: "to",
      // English says "arrived at the station", not "arrived to".
      enRel: "at",
      keys: ["gare", "aéroport", "école", "bibliothèque", "magasin", "supermarché", "parc"],
    },
  },
  {
    inf: "rester",
    aux: "etre",
    alwaysEtre: true,
    present: ["reste", "restes", "reste", "restons", "restez", "restent"],
    participle: "resté",
    pcEtre: { ms: "est resté", fs: "est restée", mp: "sont restés", fp: "sont restées" },
    en: { base: "stay", third: "stays", past: "stayed" },
    places: { rel: "at", keys: ["maison", "école", "bibliothèque", "parc"] },
  },
  {
    inf: "rentrer",
    aux: "etre",
    // The library's getAux says AVOIR for rentrer: it is dual-auxiliary.
    intransitiveOnly: "etre",
    present: ["rentre", "rentres", "rentre", "rentrons", "rentrez", "rentrent"],
    participle: "rentré",
    pcEtre: { ms: "est rentré", fs: "est rentrée", mp: "sont rentrés", fp: "sont rentrées" },
    en: { base: "return", third: "returns", past: "returned" },
    places: { rel: "to", keys: ["maison", "école"] },
  },
];

export type FrPlace = {
  key: string;
  src: string;
  /** Every phrase is written out in full, never composed from a preposition rule. */
  forms: { to?: string; from?: string; at?: string };
  en: { to: string; from: string; at: string };
  elides: boolean;
};

export const FR_PLACES: FrPlace[] = [
  {
    key: "maison",
    src: "fra1p7",
    forms: { to: "à la maison", from: "de la maison", at: "à la maison" },
    en: { to: "home", from: "from home", at: "at home" },
    elides: false,
  },
  {
    key: "école",
    src: "frb1p14",
    forms: { to: "à l'école", from: "de l'école", at: "à l'école" },
    en: { to: "to school", from: "from school", at: "at school" },
    elides: true,
  },
  {
    key: "marché",
    src: "fra1p14",
    forms: { to: "au marché", from: "du marché" },
    en: { to: "to the market", from: "from the market", at: "at the market" },
    elides: false,
  },
  {
    key: "magasin",
    src: "fra1p14",
    forms: { to: "au magasin", from: "du magasin" },
    en: { to: "to the shop", from: "from the shop", at: "at the shop" },
    elides: false,
  },
  {
    key: "supermarché",
    src: "fra1p14",
    forms: { to: "au supermarché", from: "du supermarché" },
    en: { to: "to the supermarket", from: "from the supermarket", at: "at the supermarket" },
    elides: false,
  },
  {
    key: "bibliothèque",
    src: "fra2p20",
    forms: { to: "à la bibliothèque", from: "de la bibliothèque", at: "à la bibliothèque" },
    en: { to: "to the library", from: "from the library", at: "at the library" },
    elides: false,
  },
  {
    key: "parc",
    src: "fra2p20",
    forms: { to: "au parc", from: "du parc", at: "au parc" },
    en: { to: "to the park", from: "from the park", at: "at the park" },
    elides: false,
  },
  {
    key: "gare",
    src: "fra1p20",
    forms: { to: "à la gare", from: "de la gare" },
    en: { to: "to the station", from: "from the station", at: "at the station" },
    elides: false,
  },
  {
    key: "cinéma",
    src: "fra1p18",
    forms: { to: "au cinéma" },
    en: { to: "to the cinema", from: "from the cinema", at: "at the cinema" },
    elides: false,
  },
  {
    key: "théâtre",
    src: "fra1p18",
    forms: { to: "au théâtre" },
    en: { to: "to the theatre", from: "from the theatre", at: "at the theatre" },
    elides: false,
  },
  {
    key: "aéroport",
    src: "fra1p20",
    forms: { to: "à l'aéroport" },
    en: { to: "to the airport", from: "from the airport", at: "at the airport" },
    elides: true,
  },
];

function n(
  key: string,
  gender: "m" | "f",
  classes: Noun["classes"],
  src: string,
  en: string,
  extra: Partial<Noun> = {},
): Noun {
  return { key, gender, number: "s", count: true, classes, src, en, ...extra };
}
const food = (key: string, g: "m" | "f", en: string, extra: Partial<Noun> = {}) =>
  n(key, g, ["food-count"], "fra2p2", en, extra);
const mass = (
  key: string,
  g: "m" | "f",
  cls: Noun["classes"],
  en: string,
  extra: Partial<Noun> = {},
) => n(key, g, cls, "fra2p2", en, { count: false, ...extra });
const wear = (key: string, g: "m" | "f", en: string, extra: Partial<Noun> = {}) =>
  n(key, g, ["clothing"], "fra1p4", en, extra);
const beast = (key: string, g: "m" | "f", en: string, extra: Partial<Noun> = {}) =>
  n(key, g, ["animal", "watchable"], "fra1p9", en, extra);
const ride = (key: string, g: "m" | "f", en: string, extra: Partial<Noun> = {}) =>
  n(key, g, ["vehicle", "watchable"], "fra1p20", en, extra);
const home = (key: string, g: "m" | "f", en: string, extra: Partial<Noun> = {}) =>
  n(key, g, ["household-object"], "fra1p7", en, extra);
const school = (
  key: string,
  g: "m" | "f",
  classes: Noun["classes"],
  en: string,
  extra: Partial<Noun> = {},
) => n(key, g, classes, "fra1p16", en, extra);

export const FR_NOUNS: Noun[] = [
  // food (count)
  food("pomme", "f", "apple"),
  food("banane", "f", "banana"),
  food("orange", "f", "orange", { elides: true }),
  food("gâteau", "m", "cake"),
  food("œuf", "m", "egg", { elides: true }),
  food("fruit", "m", "piece of fruit"),
  food("légume", "m", "vegetable"),
  // food (mass)
  mass("pain", "m", ["food-mass"], "bread"),
  mass("fromage", "m", ["food-mass"], "cheese"),
  mass("beurre", "m", ["food-mass"], "butter"),
  mass("riz", "m", ["food-mass"], "rice"),
  mass("viande", "f", ["food-mass"], "meat"),
  mass("soupe", "f", ["food-mass"], "soup"),
  // drink (mass)
  mass("eau", "f", ["drink"], "water", { elides: true }),
  mass("vin", "m", ["drink"], "wine"),
  mass("café", "m", ["drink"], "coffee"),
  mass("thé", "m", ["drink"], "tea"),
  mass("lait", "m", ["drink"], "milk"),
  mass("jus", "m", ["drink"], "juice"),
  // clothing
  wear("chemise", "f", "shirt"),
  wear("pantalon", "m", "pair of trousers"),
  wear("robe", "f", "dress"),
  wear("jupe", "f", "skirt"),
  wear("veste", "f", "jacket"),
  wear("manteau", "m", "coat"),
  wear("chapeau", "m", "hat"),
  wear("écharpe", "f", "scarf", { elides: true }),
  wear("pull", "m", "sweater"),
  wear("ceinture", "f", "belt"),
  wear("chaussures", "f", "shoes", { number: "p" }),
  wear("chaussettes", "f", "socks", { number: "p" }),
  wear("gants", "m", "gloves", { number: "p" }),
  wear("bottes", "f", "boots", { number: "p" }),
  // animals
  beast("chien", "m", "dog"),
  beast("chat", "m", "cat"),
  beast("cheval", "m", "horse"),
  beast("vache", "f", "cow"),
  beast("cochon", "m", "pig"),
  beast("mouton", "m", "sheep"),
  beast("lapin", "m", "rabbit"),
  beast("oiseau", "m", "bird", { elides: true }),
  beast("éléphant", "m", "elephant", { elides: true }),
  beast("lion", "m", "lion"),
  beast("tigre", "m", "tiger"),
  beast("singe", "m", "monkey"),
  beast("loup", "m", "wolf"),
  beast("renard", "m", "fox"),
  beast("canard", "m", "duck"),
  beast("ours", "m", "bear", { elides: true }),
  beast("grenouille", "f", "frog"),
  // vehicles and screens
  ride("voiture", "f", "car"),
  ride("bus", "m", "bus"),
  ride("train", "m", "train"),
  ride("avion", "m", "plane", { elides: true }),
  ride("vélo", "m", "bicycle"),
  ride("moto", "f", "motorcycle"),
  ride("bateau", "m", "boat"),
  ride("camion", "m", "truck"),
  ride("taxi", "m", "taxi"),
  n("télévision", "f", ["watchable"], "fra1p17", "television"),
  // the home
  home("table", "f", "table"),
  home("chaise", "f", "chair"),
  home("lampe", "f", "lamp"),
  home("miroir", "m", "mirror"),
  home("clé", "f", "key"),
  home("lit", "m", "bed"),
  home("canapé", "m", "sofa"),
  home("tapis", "m", "rug"),
  n("porte", "f", ["openable"], "fra1p7", "door"),
  n("fenêtre", "f", ["openable"], "fra1p7", "window"),
  // school and reading
  school("livre", "m", ["school-object", "readable", "openable"], "book"),
  school("cahier", "m", ["school-object", "openable"], "notebook"),
  school("stylo", "m", ["school-object"], "pen"),
  school("crayon", "m", ["school-object"], "pencil"),
  school("gomme", "f", ["school-object"], "eraser"),
  school("règle", "f", ["school-object"], "ruler"),
  school("dictionnaire", "m", ["school-object", "readable", "openable"], "dictionary"),
  school("calculatrice", "f", ["school-object"], "calculator"),
  school("ciseaux", "m", ["school-object"], "scissors", { number: "p" }),
  n("sac", "m", ["school-object", "openable"], "fra1p14", "bag"),
  n("journal", "m", ["readable"], "frb1p13", "newspaper"),
  n("magazine", "m", ["readable"], "frb1p13", "magazine"),
  n("article", "m", ["readable"], "frb1p13", "article", { elides: true }),
];
