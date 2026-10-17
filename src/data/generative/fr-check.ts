import { FR_H_FLAGS, frElidesIn } from "./fr-compile";
import { typographyDefects } from "./romance";

/**
 * Independent surface checker for a COMPLETED French sentence (blank filled
 * with one choice). It does not share code with the compiler's noun-phrase
 * builder: it reads the finished text and asks whether the elision and
 * contraction a native writer would apply are present.
 */
// The next word is a lookahead so "de l'yaourt" yields both "de l" and "l'yaourt".
const ELIDING = /(?<![\p{L}'’])(je|le|la|de|j|l|d)(['’]|\s+)(?=(\p{L}[\p{L}-]*))/giu;
const CONTRACTION = /(^|[^\p{L}])(à|de)\s+(le|les)(?![\p{L}])/giu;
const SPLIT_CONTRACTED = /(^|[^\p{L}])(du|au)\s+(\p{L}[\p{L}-]*)/giu;

export function frDefects(
  sentence: string,
  flags: ReadonlyMap<string, boolean> = FR_H_FLAGS,
): string[] {
  const defects = [...typographyDefects(sentence)];

  for (const m of sentence.matchAll(ELIDING)) {
    const [, article, sep, next] = m;
    const elided = sep === "'" || sep === "’";
    // "de la" + vowel: the matcher sees "la" + noun, which is the same rule.
    const should = frElidesIn(next!, flags);
    if (should === undefined) {
      defects.push(`unflagged h/y/w word "${next}"`);
      continue;
    }
    const lower = article!.toLowerCase();
    // "l" and "d" and "j" only ever appear elided; "le/la/de/je" only apart.
    if (!elided && should) defects.push(`missing elision before "${next}" ("${lower} ${next}")`);
    if (elided && !should) defects.push(`elision before aspirated or consonant "${next}"`);
  }

  for (const m of sentence.matchAll(CONTRACTION))
    defects.push(`missing contraction "${m[2]} ${m[3]}"`);

  for (const m of sentence.matchAll(SPLIT_CONTRACTED)) {
    const should = frElidesIn(m[3]!, flags);
    if (should === true) defects.push(`"${m[2]} ${m[3]}" needs l' (vowel or mute h)`);
  }
  return defects;
}
