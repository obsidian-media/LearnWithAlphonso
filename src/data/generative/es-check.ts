import { typographyDefects } from "./romance";

/**
 * Independent surface checker for a COMPLETED Spanish sentence (blank filled
 * with one choice). Contractions are the one agreement-adjacent rule that
 * lives in the surface text: "a el" and "de el" are always written "al" and
 * "del".
 */
export function esDefects(sentence: string): string[] {
  const defects = [...typographyDefects(sentence)];
  for (const m of sentence.matchAll(/(^|[^\p{L}])(a|de)\s+el(?![\p{L}])/giu))
    defects.push(`missing contraction "${m[2]} el"`);
  if (/[¿¡]/.test(sentence)) defects.push("inverted marks are not used in statements");
  return defects;
}
