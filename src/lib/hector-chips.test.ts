import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { hectorChips } from "./hector-chips";
import type { Course } from "@/data/courses";

type Fixture = {
  cases: {
    name: string;
    input: { course: Course; weakSpot: string | null; streakDays: number };
    chips: { id: string; label: string; message: string }[];
  }[];
};
const fixture = JSON.parse(
  fs.readFileSync(path.resolve(import.meta.dirname, "../../shared/hector-chips.json"), "utf8"),
) as Fixture;

describe("hectorChips (shared/hector-chips.json)", () => {
  for (const c of fixture.cases) {
    it(c.name, () => {
      const got = hectorChips(c.input).map(({ id, label, message }) => ({ id, label, message }));
      expect(got).toEqual(c.chips);
    });
  }

  it("never returns more than four, with unique ids and an icon each", () => {
    for (const c of fixture.cases) {
      const got = hectorChips(c.input);
      expect(got.length).toBeLessThanOrEqual(4);
      expect(new Set(got.map((x) => x.id)).size).toBe(got.length);
      for (const x of got) expect(x.icon).toBeTruthy();
    }
  });
});
