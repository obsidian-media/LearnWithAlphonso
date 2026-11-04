import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { curriculum, type Unit } from "./curriculum";
import { curriculumEs } from "./curriculum-es";
import { curriculumFr } from "./curriculum-fr";

// The Learn list shows a level's units under "Unit N" labels. Each level counts from 1 on its own, in the order
// the units appear: English C1 once read "Unit 9, Unit 2, Unit 3" because its hand-written unit was numbered
// across every level while the generated ones counted within the level.
function eyebrowsByLevel(units: { level: string; eyebrow: string }[]) {
  const by: Record<string, string[]> = {};
  for (const u of units) (by[u.level] ??= []).push(u.eyebrow);
  return by;
}

function expectSequential(units: { level: string; eyebrow: string }[]) {
  for (const [level, eyebrows] of Object.entries(eyebrowsByLevel(units))) {
    expect({ level, eyebrows }).toEqual({
      level,
      eyebrows: eyebrows.map((_, i) => `Unit ${i + 1}`),
    });
  }
}

describe("unit numbering", () => {
  it.each([
    ["en", curriculum],
    ["fr", curriculumFr],
    ["es", curriculumEs],
  ] as [string, Unit[]][])("every %s level numbers its units 1..n in order", (_c, units) => {
    expectSequential(units);
  });

  it.each([
    "ios/LearnWithAlphonso/Resources/curriculum-en.json",
    "ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/Resources/curriculum-en.json",
  ])("the shipped %s numbers each level 1..n", (path) => {
    const bundle = JSON.parse(readFileSync(path, "utf8"));
    expectSequential(bundle.units ?? bundle);
  });
});
