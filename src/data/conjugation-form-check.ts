// The gate's own "is this a form of that verb" check, for romance-conjugation.test.ts and
// scripts/romance-option-audit.ts. It deliberately shares NOTHING with the engine's paradigms
// (romance-conjugation.ts): it decides from the spelling alone (the start of the stem, consonants AND
// vowels) plus a short list of stems that share nothing with their infinitive (suis / être, fui / ir),
// so a wrong paradigm entry in the engine fails the gate instead of passing silently.

const strip = (s: string) =>
  s.toLowerCase().replace(/[’]/g, "'").normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * The spelling reduced to what a stem change keeps: one letter per consonant sound family (c/qu/z/k,
 * g/j/gu), doubles collapsed, and each vowel run folded into a, o (u, o, ue: poder -> puedo, pude) or
 * e (e, i, ie: pedir -> pido, querer -> quiero), by the run's first letter (leyó, pidió keep e). The vowels matter: on consonants alone pedir and poder
 * ("pudo"), or prendre and parler ("parlons"), read as the same verb.
 */
function shape(word: string): string {
  return strip(word)
    .replace(/qu|gu(?=[ei])/g, (m) => (m === "qu" ? "k" : "g"))
    .replace(/[cz]/g, "k")
    .replace(/j/g, "g")
    .replace(/[^a-z]/g, "")
    .replace(/[aeiouy]+/g, (run) => (run[0] === "a" ? "a" : /[ou]/.test(run[0]!) ? "o" : "e"))
    .replace(/(.)\1+/g, "$1");
}

/** The start of a stem a form must keep: up to and including its second consonant. */
function stemStart(root: string): string {
  const s = shape(root);
  let consonants = 0;
  for (let i = 0; i < s.length; i++) {
    if (!/[aoe]/.test(s[i]!) && ++consonants === 2) return s.slice(0, i + 1);
  }
  return s;
}

/** Forms whose stem does not start like the infinitive's, by infinitive. Gate-local. */
const SUPPLETIVE: Record<string, string[]> = {
  être: ["suis", "es", "est", "sommes", "etes", "sont"],
  avoir: ["ai", "as", "a", "avons", "avez", "ont"],
  aller: ["vais", "vas", "va", "vont"],
  faire: [
    "fais",
    "fait",
    "font",
    ..."ai,as,a,ons,ez,ont,ais,ait,ions,iez,aient".split(",").map((e) => `fer${e}`),
  ],
  vouloir: ["veux", "veut", "veulent", "veuille", "veuilles", "veuillent"],
  pouvoir: ["peux", "peut", "peuvent"],
  savoir: ["sais", "sait"],
  voir: ["vois", "voit", "voient"],
  boire: ["bois", "boit", "boivent"],
  ser: ["soy", "eres", "es", "somos", "son", "fui", "fuiste", "fue", "fuimos", "fueron"],
  ir: ["voy", "vas", "va", "vamos", "van", "fui", "fuiste", "fue", "fuimos", "fueron"],
  hacer: [
    "hago",
    ..."e,iste,o,imos,ieron,iera,ieras,ieramos,ieran,iese,ieses,iesemos,iesen"
      .split(",")
      .map((e) => (e === "o" ? "hizo" : `hic${e}`)),
  ],
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
  const want = stemStart(root(infinitive));
  return want.length > 0 && shape(word).startsWith(want);
}
