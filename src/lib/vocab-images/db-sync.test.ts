import { describe, expect, it } from "vitest";
import { MIN_ROWS, planVocabImageSync } from "./db-sync";

const rows = Array.from({ length: MIN_ROWS }, (_, i) => ({
  term: `t${String(i).padStart(3, "0")}`,
  url: "u",
  alt: "a",
  credit: "c",
}));

describe("planVocabImageSync", () => {
  it("upserts every row and deletes exactly the stale terms", () => {
    const plan = planVocabImageSync({ terms: ["t000", "stale-b", "stale-a"], total: 3 }, rows);
    expect(plan.upserts).toHaveLength(MIN_ROWS);
    expect(plan.deletes).toEqual(["stale-a", "stale-b"]);
  });

  it("deletes nothing when the table already matches", () => {
    expect(
      planVocabImageSync({ terms: rows.map((r) => r.term), total: MIN_ROWS }, rows).deletes,
    ).toEqual([]);
  });

  it("refuses a sync that saw a truncated table (unpaginated read)", () => {
    expect(() => planVocabImageSync({ terms: Array(1000).fill("x"), total: 2315 }, rows)).toThrow(
      /paginate/,
    );
  });

  it("refuses to shrink the table to almost nothing", () => {
    expect(() => planVocabImageSync({ terms: [], total: 0 }, rows.slice(0, 5))).toThrow(/refusing/);
  });
});
