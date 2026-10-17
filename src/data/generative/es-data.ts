import type { EnglishVerb, Noun, Person, Six, Use } from "./romance";

/**
 * Spanish authority tables for the generative templates. Hand-written; the
 * spanish-verbs library is a rule-based fork of "conjugator" and is only a
 * tripwire (see es-data.test.ts and the design doc, section 2.3).
 * Persons: 0 yo, 1 tú, 2 él/ella, 3 nosotros, 4 vosotros (never rendered:
 * the course uses ustedes), 5 ellos/ellas/ustedes.
 */

export type EsVerb = {
  inf: string;
  present: Six;
  presentAlt?: Partial<Record<Person, string[]>>;
  /** Absent when the library gets the preterite wrong: the verb is then not used in it. */
  preterite?: Six;
  /** Tenses this verb may be used in; defaults to both. */
  tenses?: ("present" | "preterite")[];
  en: EnglishVerb;
  uses: Use[];
};

export const ES_VERBS: EsVerb[] = [
  {
    inf: "comer",
    present: ["como", "comes", "come", "comemos", "coméis", "comen"],
    preterite: ["comí", "comiste", "comió", "comimos", "comisteis", "comieron"],
    en: { base: "eat", third: "eats", past: "ate" },
    uses: [
      {
        cls: "food-count",
        kinds: ["indefinite"],
        // a whole onion or lemon is not something one eats
        nouns: ["manzana", "naranja", "pera", "plátano", "tomate", "zanahoria"],
      },
      { cls: "food-mass", kinds: ["bare"] },
    ],
  },
  {
    inf: "preparar",
    present: ["preparo", "preparas", "prepara", "preparamos", "preparáis", "preparan"],
    preterite: ["preparé", "preparaste", "preparó", "preparamos", "preparasteis", "prepararon"],
    en: { base: "prepare", third: "prepares", past: "prepared" },
    uses: [{ cls: "food-mass", kinds: ["bare"] }],
  },
  {
    inf: "beber",
    present: ["bebo", "bebes", "bebe", "bebemos", "bebéis", "beben"],
    preterite: ["bebí", "bebiste", "bebió", "bebimos", "bebisteis", "bebieron"],
    en: { base: "drink", third: "drinks", past: "drank" },
    uses: [{ cls: "drink", kinds: ["bare"] }],
  },
  {
    inf: "tomar",
    present: ["tomo", "tomas", "toma", "tomamos", "tomáis", "toman"],
    preterite: ["tomé", "tomaste", "tomó", "tomamos", "tomasteis", "tomaron"],
    en: { base: "have", third: "has", past: "had" },
    uses: [{ cls: "drink", kinds: ["bare"] }],
  },
  {
    inf: "comprar",
    present: ["compro", "compras", "compra", "compramos", "compráis", "compran"],
    preterite: ["compré", "compraste", "compró", "compramos", "comprasteis", "compraron"],
    en: { base: "buy", third: "buys", past: "bought" },
    uses: [
      { cls: "clothing", kinds: ["indefinite"] },
      { cls: "school-object", kinds: ["indefinite"] },
      { cls: "household-object", kinds: ["indefinite"] },
    ],
  },
  {
    inf: "buscar",
    present: ["busco", "buscas", "busca", "buscamos", "buscáis", "buscan"],
    preterite: ["busqué", "buscaste", "buscó", "buscamos", "buscasteis", "buscaron"],
    en: { base: "look for", third: "looks for", past: "looked for" },
    uses: [
      { cls: "clothing", kinds: ["definite"] },
      { cls: "school-object", kinds: ["definite"] },
      { cls: "household-object", kinds: ["definite"] },
    ],
  },
  {
    inf: "ver",
    present: ["veo", "ves", "ve", "vemos", "veis", "ven"],
    preterite: ["vi", "viste", "vio", "vimos", "visteis", "vieron"],
    en: { base: "see", third: "sees", past: "saw" },
    // Animals are indefinite only: a definite animal object invites the personal "a".
    uses: [{ cls: "animal", kinds: ["indefinite"] }],
  },
  {
    inf: "mirar",
    present: ["miro", "miras", "mira", "miramos", "miráis", "miran"],
    preterite: ["miré", "miraste", "miró", "miramos", "mirasteis", "miraron"],
    en: { base: "watch", third: "watches", past: "watched" },
    uses: [{ cls: "animal", kinds: ["indefinite"] }],
  },
  {
    inf: "leer",
    present: ["leo", "lees", "lee", "leemos", "leéis", "leen"],
    // No preterite: the library drops the accents and the y (leyó, leyeron).
    en: { base: "read", third: "reads", past: "read" },
    uses: [{ cls: "readable", kinds: ["indefinite", "definite"] }],
  },
  {
    inf: "abrir",
    present: ["abro", "abres", "abre", "abrimos", "abrís", "abren"],
    preterite: ["abrí", "abriste", "abrió", "abrimos", "abristeis", "abrieron"],
    en: { base: "open", third: "opens", past: "opened" },
    uses: [{ cls: "openable", kinds: ["definite"] }],
  },
  {
    inf: "tener",
    present: ["tengo", "tienes", "tiene", "tenemos", "tenéis", "tienen"],
    preterite: ["tuve", "tuviste", "tuvo", "tuvimos", "tuvisteis", "tuvieron"],
    // The preterite of tener and querer changes meaning (tuve = I got, quise = I tried), so
    // "Ayer, yo quise un perro" would be wrong: neither is used in the preterite.
    tenses: ["present"],
    en: { base: "have", third: "has", past: "had" },
    uses: [
      {
        cls: "animal",
        kinds: ["indefinite"],
        nouns: ["perro", "gato", "caballo", "conejo", "pájaro"],
      },
      { cls: "household-object", kinds: ["indefinite"] },
      { cls: "school-object", kinds: ["indefinite"] },
    ],
  },
  {
    inf: "querer",
    present: ["quiero", "quieres", "quiere", "queremos", "queréis", "quieren"],
    preterite: ["quise", "quisiste", "quiso", "quisimos", "quisisteis", "quisieron"],
    // The preterite of tener and querer changes meaning (tuve = I got, quise = I tried), so
    // "Ayer, yo quise un perro" would be wrong: neither is used in the preterite.
    tenses: ["present"],
    en: { base: "want", third: "wants", past: "wanted" },
    uses: [
      {
        cls: "animal",
        kinds: ["indefinite"],
        nouns: ["perro", "gato", "caballo", "conejo", "pájaro"],
      },
      { cls: "household-object", kinds: ["indefinite"] },
      { cls: "school-object", kinds: ["indefinite"] },
    ],
  },
];

function n(
  key: string,
  gender: "m" | "f",
  classes: Noun["classes"],
  src: string,
  en: string,
  evidence: "corpus" | "wiktionary",
  extra: Partial<Noun> = {},
): Noun {
  return {
    key,
    gender,
    number: "s",
    count: true,
    classes,
    src,
    en,
    genderEvidence: evidence,
    ...extra,
  };
}
const C = "corpus" as const;
const W = "wiktionary" as const;

/**
 * Every noun beginning with a, á, ha or há carries an explicit stressedA flag
 * (here: only the ones we chose, all false). Stress is not computable from
 * spelling, so the test fails if the flag is missing, and any `true` noun is
 * excluded from generation.
 */
export const ES_NOUNS: Noun[] = [
  // food (count)
  n("manzana", "f", ["food-count"], "esa1p21", "apple", C),
  n("naranja", "f", ["food-count"], "esa1p21", "orange", W),
  n("pera", "f", ["food-count"], "esa1p21", "pear", W),
  n("plátano", "m", ["food-count"], "esa1p21", "banana", W),
  n("limón", "m", ["food-count"], "esa1p21", "lemon", C),
  n("tomate", "m", ["food-count"], "esa1p21", "tomato", W),
  n("zanahoria", "f", ["food-count"], "esa1p21", "carrot", W),
  n("cebolla", "f", ["food-count"], "esa1p21", "onion", C),
  // food (mass)
  n("pan", "m", ["food-mass"], "esa2p1", "bread", C, { count: false }),
  n("arroz", "m", ["food-mass"], "esa2p1", "rice", C, { count: false, stressedA: false }),
  n("pollo", "m", ["food-mass"], "esa2p1", "chicken", C, { count: false }),
  n("fruta", "f", ["food-mass"], "esa2p1", "fruit", W, { count: false }),
  // drink (mass)
  n("leche", "f", ["drink"], "esa2p1", "milk", C, { count: false }),
  n("café", "m", ["drink"], "esa2p1", "coffee", C, { count: false }),
  n("té", "m", ["drink"], "esa2p26", "tea", C, { count: false }),
  // clothing
  n("camisa", "f", ["clothing"], "esa1p12", "shirt", W),
  n("camiseta", "f", ["clothing"], "esa1p12", "t-shirt", W),
  n("falda", "f", ["clothing"], "esa1p12", "skirt", W),
  n("chaqueta", "f", ["clothing"], "esa1p12", "jacket", W),
  n("vestido", "m", ["clothing"], "esa1p12", "dress", W),
  n("abrigo", "m", ["clothing"], "esa1p12", "coat", W, { stressedA: false }),
  n("sombrero", "m", ["clothing"], "esa1p12", "hat", W),
  n("bufanda", "f", ["clothing"], "esa1p12", "scarf", W),
  n("zapatos", "m", ["clothing"], "esa1p12", "shoes", C, { number: "p" }),
  n("calcetines", "m", ["clothing"], "esa1p12", "socks", W, { number: "p" }),
  n("guantes", "m", ["clothing"], "esa1p12", "gloves", W, { number: "p" }),
  n("pantalones", "m", ["clothing"], "esa1p12", "trousers", W, { number: "p" }),
  // animals
  n("perro", "m", ["animal"], "esa1p10", "dog", C),
  n("gato", "m", ["animal"], "esa1p10", "cat", C),
  n("caballo", "m", ["animal"], "esa1p10", "horse", W),
  n("vaca", "f", ["animal"], "esa1p10", "cow", W),
  n("conejo", "m", ["animal"], "esa1p10", "rabbit", W),
  n("pájaro", "m", ["animal"], "esa1p10", "bird", W),
  n("pato", "m", ["animal"], "esa1p10", "duck", W),
  n("mono", "m", ["animal"], "esa1p10", "monkey", W),
  n("elefante", "m", ["animal"], "esa1p10", "elephant", W),
  n("tigre", "m", ["animal"], "esa1p10", "tiger", W),
  n("oso", "m", ["animal"], "esa1p10", "bear", W),
  n("serpiente", "f", ["animal"], "esa1p10", "snake", W),
  n("rana", "f", ["animal"], "esa1p10", "frog", W),
  n("tortuga", "f", ["animal"], "esa1p10", "turtle", W),
  // school and reading
  n("libro", "m", ["school-object", "readable", "openable"], "esa1p7", "book", C),
  n("cuaderno", "m", ["school-object", "openable"], "esa1p13", "notebook", W),
  n("lápiz", "m", ["school-object"], "esa1p13", "pencil", W),
  n("bolígrafo", "m", ["school-object"], "esa1p7", "pen", W),
  n("mochila", "f", ["school-object", "openable"], "esa1p13", "backpack", W),
  n("regla", "f", ["school-object"], "esa1p13", "ruler", W),
  n("goma", "f", ["school-object"], "esa1p13", "eraser", W),
  n("tijeras", "f", ["school-object"], "esa1p13", "scissors", W, { number: "p" }),
  n("periódico", "m", ["readable"], "esb2p17", "newspaper", C),
  n("revista", "f", ["readable"], "esa2p28", "magazine", C),
  // the home
  n("mesa", "f", ["household-object"], "esa1p7", "table", C),
  n("silla", "f", ["household-object"], "esa1p7", "chair", W),
  n("cama", "f", ["household-object"], "esa1p7", "bed", W),
  n("lámpara", "f", ["household-object"], "esa1p7", "lamp", W),
  n("espejo", "m", ["household-object"], "esa1p7", "mirror", W),
  n("llave", "f", ["household-object"], "esa1p7", "key", W),
  n("reloj", "m", ["household-object"], "esa1p7", "clock", W),
  n("puerta", "f", ["openable"], "esa1p7", "door", C),
  n("ventana", "f", ["openable"], "esa1p7", "window", C),
];
