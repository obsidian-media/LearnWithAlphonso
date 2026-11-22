// Words a learner cannot tell apart by ear, per course. A listening question whose wrong option
// differs from the answer only by such a pair has two correct answers (docs/CONTENT-PLAYBOOK.md).
// English reuses the existing gate (question-variety-gate.ts soundsAlike); French and Spanish are here.

import type { Course } from "../../data/course-meta";
import { HOMOPHONES, soundKey } from "../../data/question-variety-gate";

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/[^a-zñ' ]/g, "");

/** Words of a sentence, lower case, punctuation removed, accents KEPT (they matter for display, not for sound). */
export const wordsIn = (s: string): string[] =>
  s
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/[^\p{L}\p{N}' -]/gu, " ")
    .replace(/-/g, " ")
    .split(/\s+/)
    .filter(Boolean);

// ---- French --------------------------------------------------------------------------------------

/** Spelled differently, said the same (accents folded before the lookup). */
const FR_GROUPS: string[][] = [
  ["est", "et", "ai", "ait", "aie", "ais", "hait"],
  ["a", "as", "ha"],
  ["sa", "ca", "sas"],
  ["ces", "ses", "c'est", "s'est", "sais", "sait", "se", "ce"],
  ["son", "sont"],
  ["on", "ont", "hon"],
  ["mes", "mais", "met", "mets", "mai"],
  ["ma", "mas"],
  ["la", "las"],
  ["les", "lait", "lais", "laid", "lez"],
  ["vert", "verre", "vers", "ver", "vair"],
  ["sang", "sans", "cent", "sent", "sens", "s'en", "c'en"],
  ["tant", "temps", "tend", "tends", "t'en"],
  ["pain", "pin", "peint", "peins"],
  ["mer", "mere", "maire"],
  ["saint", "sain", "sein", "seing"],
  ["cour", "cours", "court", "curt"],
  ["chant", "champ", "chants", "champs"],
  ["foi", "fois", "foie"],
  ["quand", "quant", "camp", "kan"],
  ["tes", "thes", "tais", "tait", "te"],
  ["ni", "nie", "nid", "nis"],
  ["peu", "peux", "peut"],
  ["haut", "eau", "o", "os", "au", "aux", "oh"],
  ["l'a", "la", "l'as"],
  ["quel", "quelle", "quels", "quelles", "qu'elle", "qu'elles"],
];

/** A rough French spoken form: silent final letters and the verb endings said the same are folded. */
export function frSoundKey(word: string): string {
  let w = word
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/(er|ez|é|ée|ées|és)$/u, "é")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z']/g, "");
  if (w.length > 4) w = w.replace(/ent$/, "e");
  w = w.replace(/(es|e|s|x|t|d|z)+$/, "");
  w = w
    .replace(/^h/, "")
    .replace(/ph/g, "f")
    .replace(/qu/g, "k")
    .replace(/c(?=[eiy])/g, "s");
  w = w.replace(/(.)\1+/g, "$1");
  return w;
}

export function frSoundsAlike(a: string, b: string): boolean {
  const x = fold(a);
  const y = fold(b);
  if (x === y) return a.toLowerCase() !== b.toLowerCase(); // only an accent apart: said the same
  if (FR_GROUPS.some((g) => g.includes(x) && g.includes(y))) return true;
  const kx = frSoundKey(a);
  const ky = frSoundKey(b);
  return kx.length > 0 && kx === ky;
}

// ---- Spanish -------------------------------------------------------------------------------------

/**
 * A Spanish spoken form under seseo, yeísmo and the b/v merger, with the silent h dropped
 * (docs/CONTENT-PLAYBOOK.md section 2: Latin American Spanish). Accents are folded (a tilde moves the
 * stress but a listener cannot rely on it: él/el, tú/tu, sí/si).
 */
export function esSoundKey(word: string): string {
  // Placeholders are upper case (the word is lower-cased first): N is the consonant ñ, C is "ch".
  let w = word.toLowerCase().replace(/ñ/g, "N").normalize("NFD").replace(/[̀-ͯ]/g, "");
  w = w
    .replace(/ch/g, "C")
    .replace(/h/g, "")
    .replace(/ll/g, "y")
    .replace(/[vw]/g, "b")
    .replace(/z/g, "s")
    .replace(/c(?=[ei])/g, "s")
    .replace(/qu(?=[ei])/g, "k")
    .replace(/c/g, "k")
    .replace(/g(?=[ei])/g, "j")
    .replace(/gu(?=[ei])/g, "g")
    .replace(/x/g, "ks")
    .replace(/^y$/, "i")
    .replace(/([^r])\1+/g, "$1");
  return w;
}

export function esSoundsAlike(a: string, b: string): boolean {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  if (x === y) return false;
  return esSoundKey(x) === esSoundKey(y);
}

// ---- Public ----------------------------------------------------------------------------------------

export function wordsSoundAlike(course: Course, a: string, b: string): boolean {
  if (course === "fr") return frSoundsAlike(a, b);
  if (course === "es") return esSoundsAlike(a, b);
  return enSoundsAlike(a, b);
}

/**
 * English: said the same. Narrower than question-variety-gate's soundsAlike, which also rejects words
 * one or two letters apart (a spelling check); a heard difference like works/walks is a fair distractor.
 */
export function enSoundsAlike(a: string, b: string): boolean {
  const x = a.toLowerCase().replace(/[^a-z']/g, "");
  const y = b.toLowerCase().replace(/[^a-z']/g, "");
  if (!x || !y || x === y) return false;
  if (HOMOPHONES.some((g) => g.includes(x) && g.includes(y))) return true;
  return soundKey(x) === soundKey(y);
}

/**
 * The word pairs that make a wrong option a second correct answer: the options have the same number
 * of words and, at each position where they differ, the two words sound alike. Sentences of different
 * length are not compared position by position (the listening gate asks for equal length anyway).
 */
export function homophonePairs(course: Course, answer: string, wrong: string): [string, string][] {
  const a = wordsIn(answer);
  const w = wordsIn(wrong);
  const out: [string, string][] = [];
  if (a.length !== w.length) return out;
  a.forEach((x, i) => {
    const y = w[i]!;
    if (x !== y && wordsSoundAlike(course, x, y)) out.push([x, y]);
  });
  return out;
}
