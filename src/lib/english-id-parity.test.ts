import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { collectEnglishIds, diffIds, packLineStats } from "./english-id-parity";

describe("collectEnglishIds", () => {
  it("returns sorted, unique lessonId:questionId keys", () => {
    const ids = collectEnglishIds();
    expect(ids.length).toBeGreaterThan(2000);
    expect([...new Set(ids)].length).toBe(ids.length);
    expect([...ids].sort()).toEqual(ids);
  });
});

describe("diffIds", () => {
  it("reports no drift for identical id sets", () => {
    expect(diffIds(["a:1", "b:2"], ["a:1", "b:2"])).toEqual({ added: [], removed: [] });
  });

  it("reports drift when a line add shifts ids (Review Focus #1)", () => {
    const baseline = ["p1:q0", "p1:q1", "p1:q2"];
    const current = ["p1:q0", "p1:q1", "p1:q2", "p1:q3"];
    expect(diffIds(baseline, current)).toEqual({ added: ["p1:q3"], removed: [] });
  });

  it("reports drift when a line removal drops ids", () => {
    expect(diffIds(["p1:q0", "p1:q1"], ["p1:q0"])).toEqual({ added: [], removed: ["p1:q1"] });
  });
});

describe("packLineStats", () => {
  it("counts lines per pack and flags malformed ones (Review Focus #3)", () => {
    const stats = packLineStats();
    const packIds = Object.keys(stats);
    expect(packIds).toContain("a1p1");
    expect(stats["a1p1"]!.lines).toBeGreaterThan(0);
    // A stray extra "|" silently drops content in packQuestions' split.
    for (const [packId, s] of Object.entries(stats)) {
      expect(s.malformed, `pack ${packId} has malformed lines`).toEqual([]);
    }
  });
});

describe("id parity against committed baseline", () => {
  it("has not added or removed any question id", () => {
    const baselinePath = path.resolve(
      import.meta.dirname,
      "../../.audit-baseline/english-ids.json",
    );
    const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8")) as string[];
    const { added, removed } = diffIds(baseline, collectEnglishIds());
    expect({ added, removed }).toEqual({ added: [], removed: [] });
  });
});
