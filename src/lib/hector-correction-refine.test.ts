import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { Course } from "@/data/course-meta";
import { refineCorrection } from "./hector-correction-refine";

type Case = {
  name: string;
  course: Course;
  slip: string;
  fix: string;
  expect: { slip: string; fix: string } | null;
};
const fixture = JSON.parse(
  fs.readFileSync(
    path.resolve(import.meta.dirname, "../../shared/hector-correction-refine.json"),
    "utf8",
  ),
) as { cases: Case[] };

describe("refineCorrection (shared/hector-correction-refine.json)", () => {
  for (const c of fixture.cases) {
    it(c.name, () => {
      expect(refineCorrection({ slip: c.slip, fix: c.fix }, c.course)).toEqual(c.expect);
    });
  }

  it("keeps the note unchanged", () => {
    expect(
      refineCorrection({ slip: "She don't like it", fix: "She doesn't like it", note: "n" }, "en"),
    ).toEqual({ slip: "don't", fix: "doesn't", note: "n" });
  });
});
