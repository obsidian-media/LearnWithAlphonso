// The gate's own "is this a form of that verb" check, for romance-conjugation.test.ts and
// scripts/romance-option-audit.ts. It deliberately shares NOTHING with the engine's paradigms
// (romance-conjugation.ts): it decides from the spelling alone (the first consonants of the stem)
// plus a short list of stems that share no consonant with their infinitive (suis / être, fui / ir),
// so a wrong paradigm entry in the engine fails the gate instead of passing silently.

const strip = (s: string) =>
  s.toLowerCase().replace(/[’]/g, "'").normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Consonant skeleton: one letter per sound family (c/qu/z/k, g/j, gu), doubles collapsed. */
function skeleton(word: string): string {
  return strip(word)
    .replace(/qu|gu(?=[ei])/g, (m) => (m === "qu" ? "k" : "g"))
    .replace(/[cz]/g, "k")
    .replace(/j/g, "g")
    .replace(/ñ/g, "n")
    .replace(/[^bdfghklmnprstvwx]/g, "")
    .replace(/(.)\1+/g, "$1");
}

/** Forms whose stem shares no leading consonants with the infinitive, by infinitive. Gate-local. */
const SUPPLETIVE: Record<string, string[]> = {
  être: ["suis", "es", "est", "sommes", "etes", "sont"],
  avoir: ["ai", "as", "a", "avons", "avez", "ont"],
  aller: ["vais", "vas", "va", "vont"],
  faire: ["fais", "fait", "font"],
  vouloir: ["veux", "veut", "veulent"],
  pouvoir: ["peux", "peut", "peuvent"],
  savoir: ["sais", "sait"],
  voir: ["vois", "voit", "voient"],
  boire: ["bois", "boit", "boivent"],
  ser: ["soy", "eres", "es", "somos", "son", "fui", "fuiste", "fue", "fuimos", "fueron"],
  ir: ["voy", "vas", "va", "vamos", "van", "fui", "fuiste", "fue", "fuimos", "fueron"],
  hacer: ["hago", "hice", "hiciste", "hizo", "hicimos", "hicieron"],
  decir: ["digo", "dije", "dijiste", "dijo", "dijimos", "dijeron"],
  querer: ["quise", "quisiste", "quiso", "quisimos", "quisieron"],
  tener: ["tuve", "tuviste", "tuvo", "tuvimos", "tuvieron"],
  poner: ["puse", "pusiste", "puso", "pusimos", "pusieron"],
  saber: ["se"],
};

const CLITIC = /^(me|te|se|nous|vous|nos|os)\s+|^[mts]'/;

/** The infinitive without its reflexive pronoun and its ending: "se lever" -> "lev". */
function root(infinitive: string): string {
  return strip(infinitive)
    .replace(/^(se\s+|s')/, "")
    .replace(/se$/, "")
    .replace(/(er|ir|re|oir|ar)$/, "");
}
const bare = (inf: string) =>
  strip(inf)
    .replace(/^(se\s+|s')/, "")
    .replace(/(ar|er|ir)se$/, "$1");

/** True when the option reads as a form of the infinitive (gate-local, spelling only). */
export function isFormOf(option: string, infinitive: string): boolean {
  const word = strip(option).replace(CLITIC, "").trim();
  if (!word || /\s/.test(word)) return false;
  const supp = SUPPLETIVE[bare(infinitive)] ?? SUPPLETIVE[infinitive.toLowerCase()];
  if (supp?.includes(word)) return true;
  const want = skeleton(root(infinitive)).slice(0, 2);
  return want.length > 0 && skeleton(word).startsWith(want);
}
