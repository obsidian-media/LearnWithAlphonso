import { hash } from "../bank-engine";
import type { Template } from "./templates";
import { PRONOUNS } from "./templates";
import type { VocabEntry } from "./vocab";
import { compileLine, type SlotAssignment } from "./compile";

/**
 * Expands a Template against a vocab pool into every valid slot
 * combination, compiles each into a literal line, then samples down to
 * `targetCount` using bank-engine's seeded hash() -- reproducible given
 * the same packId, not truly random. Matches this codebase's existing
 * pack-generation convention (see bank-engine.ts's own use of hash()
 * for shuffling). Vocab is filtered to the template's own level per
 * slot's required part of speech; pronoun slots always draw from the
 * fixed PRONOUNS list, never the vocab dataset.
 */
export function expandTemplate(params: {
  template: Template;
  vocab: VocabEntry[];
  packId: string;
  targetCount: number;
}): string[] {
  const { template, vocab, packId, targetCount } = params;

  const slotWords: string[][] = template.slots.map((slot) => {
    if (slot.pos === "pronoun") return PRONOUNS.map((p) => p.word);
    return vocab
      .filter((v) => v.pos === slot.pos && v.level === template.level)
      .map((v) => v.word);
  });

  if (slotWords.some((words) => words.length === 0)) return [];

  const combinations: SlotAssignment[] = [];
  function build(i: number, current: SlotAssignment) {
    if (i === template.slots.length) {
      combinations.push({ ...current });
      return;
    }
    const slot = template.slots[i]!;
    for (const word of slotWords[i]!) {
      current[slot.name] = word;
      build(i + 1, current);
    }
  }
  build(0, {});

  const lines = combinations.map((assignment) => compileLine(template, assignment));

  if (lines.length <= targetCount) return lines;

  const indexed = lines.map((line, i) => ({ line, sortKey: hash(`${packId}-${i}`) }));
  indexed.sort((a, b) => a.sortKey - b.sortKey);
  return indexed.slice(0, targetCount).map((x) => x.line);
}
