import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { fullInventory, inventoryCounts, ITEM_KINDS } from "./inventory";
import { FLAG, flagCounts, withGateFlags } from "./gates";
import { COMMON_CHECKLIST, LANGUAGE_CHECKLIST, rubric } from "./rubric";
import { blindSample, secondOpinionSet, wilson } from "./sampling";
import type { Verdict } from "./review";
import { getCourse } from "../../data/courses";

const items = withGateFlags(fullInventory());

describe("the inventory", () => {
  it("gives every item a unique id", () => {
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
  });

  it("covers every lesson question of every course (none dropped)", () => {
    for (const c of ["en", "fr", "es"] as const) {
      const n = getCourse(c).curriculum.reduce(
        (a, u) => a + u.lessons.reduce((b, l) => b + l.questions.length, 0),
        0,
      );
      expect(items.filter((i) => i.course === c && i.kind === "question")).toHaveLength(n);
    }
  });

  it("has items of every kind in every course", () => {
    const counts = inventoryCounts(items);
    for (const kind of ITEM_KINDS.filter((k) => k !== "question"))
      for (const c of ["en", "fr", "es"] as const)
        expect(counts[kind]?.[c], `${kind} ${c}`).toBeGreaterThan(0);
  });

  it("names a source file that exists for every item", () => {
    const sources = new Set(items.map((i) => i.source.replaceAll("*", "")));
    for (const s of sources) {
      const file = s.endsWith("campaigns.ts") ? "src/data/campaigns.ts" : s;
      expect(fs.existsSync(path.resolve(file)), s).toBe(true);
    }
  });
});

describe("the deterministic flags agree with the gates they mirror", () => {
  const counts = flagCounts(items);
  const total = (f: string) => Object.values(counts[f] ?? {}).reduce((a, b) => a + b, 0);

  it("B1-C1 drill flags match romance-conjugation.test.ts's ratchet (at most 490, now 0)", () => {
    // Round 7 fixed the last three, so the flag may now be zero; the upper bound is what can still fail.
    expect(total(FLAG.drillNonForm)).toBeGreaterThanOrEqual(0);
    expect(total(FLAG.drillNonForm)).toBeLessThanOrEqual(490);
  });

  it("every generic explanation is flagged, and only those", () => {
    const generic = items.filter(
      (i) =>
        i.kind === "question" && /explanation shown after: "[^"]*" is correct here\. /.test(i.text),
    );
    expect(total(FLAG.genericExplanation)).toBe(generic.length);
  });

  it("the two named second-answer items are flagged", () => {
    expect(
      items
        .filter((i) => i.flags?.includes(FLAG.knownSecondAnswer))
        .map((i) => i.id.split("/").pop()),
    ).toEqual(["frc1p19q4", "frc1p19q15"]);
  });
});

describe("the rubric", () => {
  const playbook = fs.readFileSync(path.resolve("docs/CONTENT-PLAYBOOK.md"), "utf8");

  it("is printed word for word in the playbook (authors and reviewers use one checklist)", () => {
    for (const line of [...COMMON_CHECKLIST, ...Object.values(LANGUAGE_CHECKLIST).flat()])
      expect(playbook).toContain(line);
  });

  it("is long enough to be cached (Sonnet 5.5 and Opus 5.5 cache from 512 tokens)", () => {
    // Even at 4 characters a token, the shortest rubric is above 512 tokens.
    for (const c of ["en", "fr", "es"] as const) expect(rubric(c).length / 4).toBeGreaterThan(512);
  });
});

describe("sampling", () => {
  const verdicts = new Map<string, Verdict>(
    items.map((it, i) => [
      it.id,
      { id: it.id, verdict: i % 5 === 0 ? "defect" : "ok", confidence: 0.9 },
    ]),
  );

  it("sends every Claude flag and missing verdict, plus about 10% of the passed items, to Mistral", () => {
    const missingOne = new Map(verdicts);
    missingOne.delete(items[1]!.id);
    const s = secondOpinionSet(items, missingOne, 0.1, "seed");
    const flagged = new Set(s.flagged.map((i) => i.id));
    expect(flagged.has(items[0]!.id)).toBe(true); // a defect
    expect(flagged.has(items[1]!.id)).toBe(true); // no verdict
    const passed = items.length - s.flagged.length;
    expect(Math.abs(s.control.length - passed * 0.1)).toBeLessThanOrEqual(1);
    expect(s.control.every((i) => !flagged.has(i.id))).toBe(true);
  });

  it("a rewrite-class flag alone does not force a second opinion (it is rewritten, then re-reviewed)", () => {
    const generic = items.find(
      (i) =>
        i.flags?.length === 1 &&
        i.flags[0] === FLAG.genericExplanation &&
        verdicts.get(i.id)?.verdict === "ok",
    )!;
    expect(secondOpinionSet(items, verdicts, 0, "s").flagged.some((i) => i.id === generic.id)).toBe(
      false,
    );
  });

  it("the blind sample is 100 per course, seeded, and spread over kinds", () => {
    const a = blindSample(items, 100, "s");
    expect(a).toHaveLength(300);
    expect(blindSample(items, 100, "s").map((i) => i.id)).toEqual(a.map((i) => i.id));
    expect(new Set(a.map((i) => i.kind)).size).toBeGreaterThan(3);
  });

  it("Wilson interval: 9 defects in 300 is 3.0% (1.6% to 5.6%)", () => {
    const w = wilson(9, 300);
    expect(w.rate).toBeCloseTo(0.03, 4);
    expect(w.low).toBeCloseTo(0.0159, 3);
    expect(w.high).toBeCloseTo(0.0561, 3);
  });
});

describe("key safety", () => {
  it("the runner never prints or writes a key", () => {
    const src = fs.readFileSync(path.resolve("scripts/content-review/run.ts"), "utf8");
    const lines = src
      .split("\n")
      .filter((l) => /console\.(log|error|table)|writeFileSync|writeJson\(/.test(l));
    for (const l of lines) expect(l, l).not.toMatch(/\bkey(A|M)?\b(?!s)|API_KEY|apiKey/);
  });

  it("no key file path or local Windows path is committed in the pipeline", () => {
    for (const f of [
      "scripts/content-review/run.ts",
      ...fs.readdirSync("src/lib/content-review").map((x) => `src/lib/content-review/${x}`),
    ]) {
      const src = fs.readFileSync(path.resolve(f), "utf8");
      expect(src, f).not.toMatch(/[A-Z]:[\\/](Credentials|Users)/i);
    }
  });
});
