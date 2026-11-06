import type { Course } from "@/data/courses";

/**
 * A mouth shape of the talking Alphonso. `closed` draws no mouth layer (the base art already shows the closed
 * mouth); every other value is one `mouth-*.webp` layer.
 *
 * This file, lipsync.ts, machine.ts and idle.ts are a port of the iOS Kit's Avatar*.swift. The two must agree
 * exactly: shared/avatar-parity.json holds inputs and expected outputs that the Swift, TypeScript and Kotlin tests
 * all check.
 */
export type Viseme = "closed" | "half" | "talk" | "ah" | "oh" | "ee" | "fv";

export const VISEMES: readonly Viseme[] = ["closed", "half", "talk", "ah", "oh", "ee", "fv"];

function shapeOf(c: string): Viseme {
  switch (c) {
    case "a":
    case "á":
    case "à":
    case "â":
    case "ä":
    case "ã":
      return "ah";
    case "e":
    case "é":
    case "è":
    case "ê":
    case "ë":
    case "i":
    case "í":
    case "ì":
    case "î":
    case "ï":
    case "y":
      return "ee";
    case "o":
    case "ó":
    case "ò":
    case "ô":
    case "ö":
    case "u":
    case "ú":
    case "ù":
    case "û":
    case "ü":
      return "oh";
    case "f":
    case "v":
      return "fv";
    case "m":
    case "b":
    case "p":
      return "closed";
    case "t":
    case "d":
    case "n":
    case "l":
    case "s":
    case "z":
    case "r":
      return "talk";
    default:
      return "half";
  }
}

function isVowel(c: string): boolean {
  const s = shapeOf(c);
  return s === "ah" || s === "ee" || s === "oh";
}

const LETTER = /^\p{L}$/u;

/** Letters of a word, lower-cased, composed (so "e" + an accent is one letter, as in Swift's Character). */
export function lettersOf(word: string): string[] {
  return [...word.toLowerCase().normalize("NFC")].filter((c) => LETTER.test(c));
}

/**
 * The shapes for one word, in order, never the same shape twice in a row. Anything that is not a letter is ignored,
 * so punctuation and digits produce nothing.
 */
export function visemeSequence(word: string, course: Course): Viseme[] {
  const letters = lettersOf(word);
  // A final "e" after a consonant is silent in English and (mostly) French: "face", "être".
  if (course !== "es" && letters.length > 3 && letters[letters.length - 1] === "e") {
    const before = letters[letters.length - 2];
    if (!isVowel(before)) letters.pop();
  }
  const out: Viseme[] = [];
  const add = (shape: Viseme) => {
    if (out[out.length - 1] !== shape) out.push(shape);
  };
  let i = 0;
  while (i < letters.length) {
    const c = letters[i];
    const next = i + 1 < letters.length ? letters[i + 1] : undefined;
    const afterNext = i + 2 < letters.length ? letters[i + 2] : undefined;
    if (c === "o" && next === "u") {
      add("oh");
      i += 2;
      continue;
    }
    if (c === "o" && next === "o" && course === "en") {
      add("oh");
      i += 2;
      continue;
    }
    if (c === "p" && next === "h" && course !== "es") {
      add("fv");
      i += 2;
      continue;
    }
    // "que", "qui" (and Spanish "gue", "gui"): the u is silent.
    if (
      next === "u" &&
      afterNext !== undefined &&
      "eéèêií".includes(afterNext) &&
      ((c === "q" && course !== "en") || (c === "g" && course === "es"))
    ) {
      add("half");
      i += 2;
      continue;
    }
    if (c === "h" && course !== "en") {
      i += 1;
      continue;
    }
    add(shapeOf(c));
    i += 1;
  }
  return out;
}
