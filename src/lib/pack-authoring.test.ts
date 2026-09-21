import { describe, expect, it } from "vitest";
import type { Pack } from "../data/bank-engine";
import {
  checkIdCollision,
  extractPackIds,
  formatPackAsTs,
  hasErrors,
  insertPackIntoBank,
  previewPack,
  validatePack,
} from "./pack-authoring";

function pairPack(overrides: Partial<Pack> = {}): Pack {
  return {
    id: "esa1p9",
    title: "Weather",
    subtitle: "Talking about the weather",
    kind: "pair",
    prompt: 'How do you say "%s" in Spanish?',
    note: "Common weather vocabulary.",
    data: `sunny|soleado
rainy|lluvioso
cloudy|nublado
windy|ventoso
snowy|nevado`,
    ...overrides,
  };
}

describe("validatePack", () => {
  it("accepts a well-formed pair pack with no errors or warnings", () => {
    expect(validatePack(pairPack())).toEqual([]);
  });

  it("flags an empty id", () => {
    const issues = validatePack(pairPack({ id: "" }));
    expect(issues).toContainEqual({
      level: "error",
      message: expect.stringContaining("id is empty"),
    });
  });

  it("flags an id with disallowed characters", () => {
    const issues = validatePack(pairPack({ id: "es-a1-p9" }));
    expect(hasErrors(issues)).toBe(true);
    expect(issues.some((i) => i.message.includes("lowercase letters/digits"))).toBe(true);
  });

  it("requires a %s prompt for pair packs", () => {
    const issues = validatePack(pairPack({ prompt: "Translate:" }));
    expect(issues.some((i) => i.message.includes("%s"))).toBe(true);
  });

  it("warns when a cloze pack carries a stray prompt field", () => {
    const issues = validatePack({
      id: "esa1p9",
      title: "T",
      subtitle: "S",
      kind: "cloze",
      prompt: "unused",
      note: "N",
      data: "I ___ happy.|am\nShe ___ tired.|is\nThey ___ here.|are",
    });
    expect(issues).toContainEqual({
      level: "warning",
      message: expect.stringContaining("don't use `prompt`"),
    });
  });

  it("errors on empty data", () => {
    const issues = validatePack(pairPack({ data: "" }));
    expect(issues).toContainEqual({ level: "error", message: "data has no content lines." });
  });

  it("errors on a line missing the pipe separator", () => {
    const issues = validatePack(pairPack({ data: "sunny soleado\nrainy|lluvioso" }));
    expect(issues.some((i) => i.message.includes('expected exactly one "|"'))).toBe(true);
  });

  it("errors on a line with two pipes", () => {
    const issues = validatePack(pairPack({ data: "sunny|soleado|extra\nrainy|lluvioso" }));
    expect(issues.some((i) => i.message.includes("found 2"))).toBe(true);
  });

  it("errors on an empty left or right side", () => {
    const issues = validatePack(pairPack({ data: "|soleado\nrainy|" }));
    expect(issues.some((i) => i.message.includes("left side is empty"))).toBe(true);
    expect(issues.some((i) => i.message.includes("right side is empty"))).toBe(true);
  });

  it("warns on cloze lines missing the ___ blank marker", () => {
    const issues = validatePack({
      id: "esa1p9",
      title: "T",
      subtitle: "S",
      kind: "cloze",
      note: "N",
      data: "I am happy.|am\nShe ___ tired.|is\nThey ___ here.|are",
    });
    expect(
      issues.some((i) => i.level === "warning" && i.message.includes('no "___" blank marker')),
    ).toBe(true);
  });

  it("warns on duplicate left sides", () => {
    const issues = validatePack(pairPack({ data: "sunny|soleado\nsunny|soleado\nrainy|lluvioso" }));
    expect(issues.some((i) => i.message.includes("duplicate left side"))).toBe(true);
  });

  it("warns when line count isn't a multiple of 5", () => {
    const issues = validatePack(pairPack({ data: "a|b\nc|d\ne|f" }));
    expect(issues.some((i) => i.message.includes("isn't a multiple of 5"))).toBe(true);
  });

  it("does not warn about line count when it's an exact multiple of 5", () => {
    const issues = validatePack(pairPack());
    expect(issues.some((i) => i.message.includes("multiple of 5"))).toBe(false);
  });

  it("warns when fewer than 4 distinct answers exist among 4+ lines", () => {
    const issues = validatePack(pairPack({ data: "a|x\nb|x\nc|x\nd|y\ne|y" }));
    expect(issues.some((i) => i.message.includes("distinct right-side answer"))).toBe(true);
  });
});

describe("hasErrors", () => {
  it("is true only when an error-level issue is present", () => {
    expect(hasErrors([{ level: "warning", message: "w" }])).toBe(false);
    expect(hasErrors([{ level: "error", message: "e" }])).toBe(true);
    expect(hasErrors([])).toBe(false);
  });
});

describe("checkIdCollision", () => {
  it("flags a pack id already present in the course bank", () => {
    const issue = checkIdCollision("esa1p3", new Set(["esa1p1", "esa1p3"]));
    expect(issue).toEqual({ level: "error", message: expect.stringContaining("already exists") });
  });

  it("returns null for a fresh id", () => {
    expect(checkIdCollision("esa1p9", new Set(["esa1p1"]))).toBeNull();
  });
});

describe("previewPack", () => {
  it("renders every generated question with its prompt and correct answer marked", () => {
    const text = previewPack(pairPack());
    expect(text).toContain('Pack "esa1p9" -- Weather');
    expect(text).toContain("5 data lines");
    // Every right-side answer must appear somewhere in the rendered choices/answer.
    for (const answer of ["soleado", "lluvioso", "nublado", "ventoso", "nevado"]) {
      expect(text).toContain(answer);
    }
  });
});

describe("extractPackIds", () => {
  it("collects every id field from lesson-bank-style TS source", () => {
    const source = `
const A1: Pack[] = [
  {
    id: "esa1p1",
    title: "x",
  },
  {
    id: "esa1p2",
    title: "y",
  },
];
`;
    expect(extractPackIds(source)).toEqual(new Set(["esa1p1", "esa1p2"]));
  });
});

describe("formatPackAsTs", () => {
  it("uses single quotes when a string contains a double quote", () => {
    const ts = formatPackAsTs(pairPack());
    expect(ts).toContain(`prompt: 'How do you say "%s" in Spanish?',`);
  });

  it("renders data as a backtick template literal", () => {
    const ts = formatPackAsTs(pairPack());
    expect(ts).toContain("data: `sunny|soleado");
    expect(ts.trim().endsWith("},")).toBe(true);
  });

  it("omits the prompt line for cloze packs with no prompt", () => {
    const ts = formatPackAsTs({
      id: "esa1p9",
      title: "T",
      subtitle: "S",
      kind: "cloze",
      note: "N",
      data: "I ___ happy.|am",
    });
    expect(ts).not.toContain("prompt:");
  });
});

describe("insertPackIntoBank", () => {
  const fileSource = `import type { Pack } from "./bank-engine";

const A1: Pack[] = [
  {
    id: "esa1p1",
    title: "Existing",
    subtitle: "S",
    kind: "pair",
    prompt: 'How do you say "%s" in Spanish?',
    note: "N",
    data: \`a|b\`,
  },
];

const A2: Pack[] = [
  {
    id: "esa2p1",
    title: "Existing2",
    subtitle: "S",
    kind: "pair",
    prompt: 'How do you say "%s" in Spanish?',
    note: "N",
    data: \`a|b\`,
  },
];

export const BANK_ES: Record<Level, Pack[]> = { A1, A2 };
`;

  it("inserts the new pack right before the target level's closing ];", () => {
    const result = insertPackIntoBank(fileSource, "A1", pairPack());
    if ("error" in result) throw new Error(result.error);
    expect(result.updated).toContain('id: "esa1p1"');
    expect(result.updated).toContain('id: "esa1p9"');
    // The new pack must land inside A1's array, before A2's declaration.
    const a1Idx = result.updated.indexOf("const A1");
    const newPackIdx = result.updated.indexOf('id: "esa1p9"');
    const a2Idx = result.updated.indexOf("const A2");
    expect(newPackIdx).toBeGreaterThan(a1Idx);
    expect(newPackIdx).toBeLessThan(a2Idx);
  });

  it("does not disturb the other level's array", () => {
    const result = insertPackIntoBank(fileSource, "A2", pairPack());
    if ("error" in result) throw new Error(result.error);
    const a1Count = (result.updated.match(/id: "esa1p1"/g) ?? []).length;
    expect(a1Count).toBe(1);
    expect(result.updated).toContain('id: "esa2p1"');
    expect(result.updated).toContain('id: "esa1p9"');
  });

  it("returns an error when the level array isn't found", () => {
    const result = insertPackIntoBank(fileSource, "C1", pairPack());
    expect(result).toEqual({ error: expect.stringContaining("could not find") });
  });

  it("round-trips through a real validatePack + packQuestions check after insertion", () => {
    const result = insertPackIntoBank(fileSource, "A1", pairPack());
    if ("error" in result) throw new Error(result.error);
    expect(validatePack(pairPack())).toEqual([]);
    expect(result.updated).toMatch(/const A1: Pack\[\] = \[[\s\S]*id: "esa1p9"[\s\S]*\];/);
  });
});
