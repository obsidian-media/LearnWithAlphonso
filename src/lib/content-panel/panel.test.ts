import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  BATCH_SIZE,
  FLAGGED,
  batchMessage,
  batches,
  clearCut,
  MODEL_FAMILY,
  callCost,
  combine,
  estimateCost,
  parseVerdicts,
  placementItems,
  samplePanelItems,
  summaryMarkdown,
  type Verdict,
} from "./panel";

// No network here: the reviewers' replies are written out below as the models would send them.

const ok = (key: string, confidence = 0.9): Verdict => ({ key, verdict: "ok", confidence });
const bad = (key: string, confidence = 0.9): Verdict => ({
  key,
  verdict: "defect",
  category: "grammar",
  problem: "p",
  fix: "f",
  confidence,
});

describe("the sample", () => {
  for (const lang of ["fr", "es"] as const) {
    const items = samplePanelItems(lang, "20261106");
    it(`${lang}: about 150 items from lessons, campaigns and placement, no key twice`, () => {
      expect(items.length).toBeGreaterThanOrEqual(140);
      expect(items.length).toBeLessThanOrEqual(160);
      expect(new Set(items.map((i) => i.key)).size).toBe(items.length);
      for (const s of ["lesson", "campaign", "placement"])
        expect(items.filter((i) => i.source === s).length, s).toBeGreaterThan(10);
      expect(items.every((i) => i.lang === lang)).toBe(true);
    });
    it(`${lang}: every item an earlier PR flagged exists and is in the sample`, () => {
      const keys = new Set(placementItems(lang).map((i) => i.key));
      for (const k of Object.keys(FLAGGED[lang])) {
        expect(keys.has(k), `${k} no longer exists`).toBe(true);
        expect(items.some((i) => i.key === k && i.flagged)).toBe(true);
      }
    });
    it(`${lang}: the same seed gives the same sample, another seed a different one`, () => {
      expect(samplePanelItems(lang, "20261106").map((i) => i.key)).toEqual(items.map((i) => i.key));
      expect(samplePanelItems(lang, "other").map((i) => i.key)).not.toEqual(
        items.map((i) => i.key),
      );
    });
    it(`${lang}: lesson items show the key the learner is marked against`, () => {
      for (const it of items.filter((i) => i.source !== "campaign"))
        expect(/KEY: |accepted answers: |say aloud: /.test(it.text), it.key).toBe(true);
    });
  }

  it("the first run is estimated well under the US$5 cap at above-list prices", () => {
    const work = (["fr", "es"] as const).flatMap((lang) =>
      batches(samplePanelItems(lang, "20261106"), BATCH_SIZE).map((batch) => ({ lang, batch })),
    );
    const claude = estimateCost(work, { prompt: 3, completion: 15 });
    const mistral = estimateCost(work, { prompt: 2, completion: 6 });
    expect((claude.usd + mistral.usd) * 1.5).toBeLessThan(5);
  });

  it("batches keep one source per batch and every item once", () => {
    const items = samplePanelItems("fr", "20261106");
    const bs = batches(items, BATCH_SIZE);
    expect(bs.flat().length).toBe(items.length);
    for (const b of bs) expect(new Set(b.map((i) => i.source)).size).toBe(1);
    expect(batchMessage(bs[0]!)).toContain(`### key: ${bs[0]![0]!.key}`);
  });
});

describe("reading a reviewer's reply", () => {
  const keys = ["fr:lesson:a", "fr:lesson:b"];

  it("reads JSON inside a code fence and clamps confidence", () => {
    const reply =
      'Here you go:\n```json\n{"items":[{"key":"fr:lesson:a","verdict":"ok","confidence":1.4},' +
      '{"key":"fr:lesson:b","verdict":"defect","category":"register","problem":"tu then vous {x}","fix":"vous","confidence":0.8}]}\n```';
    const { verdicts, errors } = parseVerdicts(reply, keys);
    expect(errors).toEqual([]);
    expect(verdicts[0]).toEqual({ key: "fr:lesson:a", verdict: "ok", confidence: 1 });
    expect(verdicts[1]).toMatchObject({ verdict: "defect", category: "register", fix: "vous" });
  });

  it("never turns a missing, repeated, foreign or garbled entry into an ok", () => {
    const reply = JSON.stringify({
      items: [
        { key: "fr:lesson:a", verdict: "fine", confidence: 0.9 },
        { key: "fr:lesson:z", verdict: "ok", confidence: 0.9 },
      ],
    });
    const { verdicts, errors } = parseVerdicts(reply, keys);
    expect(verdicts).toEqual([]);
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('verdict "fine"'),
        expect.stringContaining("unexpected key"),
        "missing fr:lesson:a",
        "missing fr:lesson:b",
      ]),
    );
    const twice = JSON.stringify({ items: [ok("fr:lesson:a"), bad("fr:lesson:a")] });
    expect(parseVerdicts(twice, keys).verdicts).toHaveLength(1);
    expect(parseVerdicts(twice, keys).errors).toContain("repeated key fr:lesson:a");
  });

  it("reports a reply with no JSON at all", () => {
    expect(parseVerdicts("I cannot help with that.", keys).errors).toEqual([
      "no JSON object in the reply",
    ]);
  });

  it("files an unknown category under other", () => {
    const reply = JSON.stringify({
      items: [{ key: "fr:lesson:a", verdict: "defect", category: "vibes", confidence: 0.6 }],
    });
    expect(parseVerdicts(reply, ["fr:lesson:a"]).verdicts[0]!.category).toBe("other");
  });
});

describe("combining the two reviewers", () => {
  const keys = ["k1", "k2", "k3", "k4", "k5"];
  const a = [bad("k1"), ok("k2"), bad("k3"), ok("k4", 0.5), bad("k5", 0.5)];
  const b = [bad("k1"), ok("k2"), ok("k3")];
  const c = combine(keys, a, b);

  it("sorts every item into exactly one outcome", () => {
    expect(c.bothDefect.map((d) => d.key)).toEqual(["k1"]);
    expect(c.bothOk).toEqual(["k2"]);
    expect(c.disagree.map((d) => d.key)).toEqual(["k3"]);
    expect(c.missing).toEqual(["k4", "k5"]);
  });

  it("calls a defect clear-cut only when both are confident", () => {
    const d = combine(["x", "y"], [bad("x"), bad("y", 0.6)], [bad("x", 0.7), bad("y")]);
    expect(clearCut(d).map((x) => x.key)).toEqual(["x"]);
  });

  it("writes a summary with the counts, the agreed list and the disagreements", () => {
    const md = summaryMarkdown({
      date: "2026-11-06",
      seed: "s",
      reviewers: [
        { label: "Claude", model: "anthropic/x", providers: ["Anthropic"] },
        { label: "Mistral", model: "mistralai/y", providers: ["Mistral"] },
      ],
      itemsByLang: { fr: 3, es: 2 },
      combined: combine(
        ["k1", "k3"],
        [{ ...bad("k1"), problem: "a | b" }, bad("k3")],
        [bad("k1"), ok("k3")],
      ),
      costUsd: 1.234,
      textOf: () => "",
    });
    expect(md).toContain("| Both say defect | 1 |");
    expect(md).toContain("| Disagree | 1 |");
    expect(md).toContain("US$1.23");
    expect(md).toContain("served by Anthropic");
    expect(md).toContain("a \\| b");
    expect(md).toContain("| `fr:lesson:k3`".replace("fr:lesson:", ""));
  });
});

describe("cost and model choice", () => {
  it("counts a BYOK call (reported $0) at the model's list price, so the cap still trips", () => {
    const price = { prompt: 2, completion: 10 };
    expect(callCost({ cost: 0, prompt_tokens: 1_000_000, completion_tokens: 100_000 }, price)).toBe(
      3,
    );
    expect(callCost({ cost: 5, prompt_tokens: 10, completion_tokens: 10 }, price)).toBe(5);
    expect(callCost(undefined, price)).toBe(0);
    expect(
      callCost(
        {
          cost: 0,
          prompt_tokens: 1,
          completion_tokens: 1,
          cost_details: { upstream_inference_cost: 0.5 },
        },
        price,
      ),
    ).toBe(0.5);
  });
  it("auto picks Claude Sonnet and Mistral Large ids, not variants or other sizes", () => {
    expect(MODEL_FAMILY.claude.test("anthropic/claude-sonnet-5.5")).toBe(true);
    expect(MODEL_FAMILY.claude.test("anthropic/claude-sonnet-5.5:batch")).toBe(false);
    expect(MODEL_FAMILY.claude.test("anthropic/claude-opus-5.5")).toBe(false);
    expect(MODEL_FAMILY.mistral.test("mistralai/mistral-large-4-0")).toBe(true);
    expect(MODEL_FAMILY.mistral.test("mistralai/mistral-large-2512")).toBe(true);
    expect(MODEL_FAMILY.mistral.test("mistralai/mistral-medium-3-5")).toBe(false);
  });
});

describe("key handling in the runner", () => {
  const root = path.resolve(import.meta.dirname, "../../..");
  const runner = fs.readFileSync(path.join(root, "scripts/content-panel/run.ts"), "utf8");

  it("reads the key from the environment only", () => {
    expect(runner).toContain("process.env.OPENROUTER_API_KEY");
    expect(runner).not.toMatch(/readFileSync\([^)]*key/i);
    expect(runner).not.toMatch(/Credentials|api_key\.txt/i);
  });

  it("never prints or writes the key", () => {
    for (const line of runner
      .split("\n")
      .filter((l) => /console\.|writeFileSync|log\.push/.test(l)))
      expect(line, line).not.toMatch(/\bkey\b(?!s\b)(?![:=])|\$\{key\}/);
  });

  it("is not pinned to a provider, so the owner's BYOK keys are used when set", () => {
    expect(runner).not.toMatch(/\bonly\s*:/);
    expect(runner).not.toMatch(/allow_fallbacks/);
  });
});
