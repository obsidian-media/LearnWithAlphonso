import { describe, expect, it } from "vitest";
import type { ReviewItem } from "./inventory";
import { checkFix, checkFixes, overlayJson } from "./fixes";
import { parseRulings, route } from "./judge";
import { chunk } from "./review";

const item = (
  kind: ReviewItem["kind"],
  data: Record<string, unknown>,
  course: ReviewItem["course"] = "fr",
): ReviewItem => ({
  id: `${course}:${kind}:x/${String(data.id ?? 1)}`,
  course,
  kind,
  level: "A2",
  source: "x",
  text: "t",
  hash: "h",
  data,
});

const mc = item("question", {
  id: "q1",
  type: "mc",
  prompt: "Je ___ (parler) français.",
  choices: ["parles", "parle", "parlons", "parlent"],
  answer: 1,
  explanation: '"parle" is correct here. Present tense.',
});
const fill = item("question", {
  id: "q2",
  type: "fill",
  prompt: "Il ___ là.",
  bank: ["est", "es", "sont"],
  answer: "est",
  explanation: "e",
});
const translate = item("question", {
  id: "q3",
  type: "translate",
  prompt: "Say hi",
  acceptableAnswers: ["Salut", "Bonjour"],
  explanation: "e",
});

describe("what a fix may change", () => {
  it("accepts a new wrong option with the answer kept at its position", () => {
    expect(
      checkFix(mc, {
        id: mc.id,
        reason: "",
        patch: { choices: ["parles", "parle", "parlez", "parlent"] },
      }),
    ).toEqual([]);
  });

  it("refuses moving the answer (the index would point at another word)", () => {
    expect(
      checkFix(mc, {
        id: mc.id,
        reason: "",
        patch: { choices: ["parle", "parles", "parlons", "parlent"] },
      }).join(),
    ).toMatch(/answer changes/);
  });

  it("refuses a changed option count", () => {
    expect(
      checkFix(mc, {
        id: mc.id,
        reason: "",
        patch: { choices: ["parles", "parle", "parlons"] },
      }).join(),
    ).toMatch(/3 entries/);
  });

  it("refuses duplicate options and an option equal to the answer", () => {
    expect(
      checkFix(mc, {
        id: mc.id,
        reason: "",
        patch: { choices: ["parles", "parle", "Parle", "parlent"] },
      }).join(),
    ).toMatch(/same|equals the answer/);
  });

  it("refuses a changed key unless it is a reviewed key change", () => {
    const p = { bank: ["es", "est", "sont"], answer: "es" };
    expect(checkFix(fill, { id: fill.id, reason: "", patch: p }).join()).toMatch(
      /without a reviewed key change/,
    );
    expect(checkFix(fill, { id: fill.id, reason: "", patch: p, keyChange: true })).toEqual([]);
  });

  it("a fill answer must be in its bank", () => {
    expect(
      checkFix(fill, { id: fill.id, reason: "", patch: { bank: ["es", "sont", "suis"] } }).join(),
    ).toMatch(/not among the options/);
  });

  it("keeps exactly one blank", () => {
    expect(
      checkFix(mc, { id: mc.id, reason: "", patch: { prompt: "Je parle français." } }).join(),
    ).toMatch(/0 blanks/);
  });

  it("refuses ids, types and fields that do not exist", () => {
    const why = checkFix(mc, {
      id: mc.id,
      reason: "",
      patch: { id: "q9", type: "fill", level: "C1" },
    }).join();
    expect(why).toMatch(/"id" may not/);
    expect(why).toMatch(/"type" may not/);
  });

  it("an explanation is specific and quotes the answer (save-word spans read the quotes)", () => {
    expect(
      checkFix(mc, {
        id: mc.id,
        reason: "",
        patch: { explanation: '"parle" is correct here. x' },
      }).join(),
    ).toMatch(/generic/);
    expect(
      checkFix(mc, {
        id: mc.id,
        reason: "",
        patch: { explanation: "With je, parler ends in -e." },
      }).join(),
    ).toMatch(/quote the answer/);
    expect(
      checkFix(mc, {
        id: mc.id,
        reason: "",
        patch: { explanation: 'With "je", parler takes "parle".' },
      }),
    ).toEqual([]);
  });

  it("translate: the first accepted answer is the canonical one", () => {
    expect(
      checkFix(translate, {
        id: translate.id,
        reason: "",
        patch: { acceptableAnswers: ["Bonjour", "Salut"] },
      }).join(),
    ).toMatch(/first accepted/);
    expect(
      checkFix(translate, {
        id: translate.id,
        reason: "",
        patch: { acceptableAnswers: ["Salut", "Bonjour", "Coucou"] },
      }),
    ).toEqual([]);
  });

  it("English conversation prompts are frozen; others need the legacy prompt kept", () => {
    const en = item("scenario", { title: "t", blurb: "b", opener: "o", systemPrompt: "s" }, "en");
    expect(checkFix(en, { id: en.id, reason: "", patch: { systemPrompt: "new" } }).join()).toMatch(
      /frozen/,
    );
    const fr = item("scenario", { title: "t", blurb: "b", opener: "o", systemPrompt: "s" }, "fr");
    const r = checkFixes(new Map([[fr.id, fr]]), [
      { id: fr.id, reason: "", patch: { systemPrompt: "nouveau" } },
    ]);
    expect(r.ok[0]?.needsLegacyPrompt).toBe(true);
  });

  it("one fix per item, and unknown ids are refused", () => {
    const r = checkFixes(new Map([[mc.id, mc]]), [
      { id: mc.id, reason: "", patch: { prompt: "Je ___ (parler) bien français." } },
      { id: mc.id, reason: "", patch: { prompt: "Tu ___ (parler)." } },
      { id: "nope", reason: "", patch: { prompt: "x" } },
    ]);
    expect(r.ok).toHaveLength(1);
    expect(r.refused.map((x) => x.why[0])).toEqual([
      "a second fix for the same item",
      "unknown item id",
    ]);
  });

  it("the overlay is sorted by id (stable diffs)", () => {
    const json = overlayJson([
      { id: "fr:b", patch: { prompt: "x" }, reason: "r" },
      { id: "fr:a", patch: { prompt: "y" }, reason: "r" },
    ]);
    expect(Object.keys(JSON.parse(json))).toEqual(["fr:a", "fr:b"]);
  });
});

describe("the judge's rulings", () => {
  const c = chunk([mc, fill], "judge")[0]!;

  it("a fix without a patch is not a ruling (the item stays missing)", () => {
    const r = parseRulings(
      c,
      '{"items":[{"key":"i1","decision":"fix","confidence":0.9},{"key":"i2","decision":"keep","confidence":0.9,"reason":"fine"}]}',
    );
    expect(r.rulings.map((x) => x.decision)).toEqual(["keep"]);
    expect(r.missing).toEqual([mc.id]);
  });

  it("routes: confident fixes are applied, low-confidence and 'owner' go to the owner list", () => {
    const routed = route([
      { id: "a", decision: "fix", confidence: 0.9, reason: "", patch: { prompt: "x" } },
      { id: "b", decision: "fix", confidence: 0.45, reason: "", patch: { prompt: "x" } },
      { id: "c", decision: "owner", confidence: 0.9, reason: "" },
      { id: "d", decision: "keep", confidence: 0.9, reason: "" },
    ]);
    expect(routed.fixes.map((f) => f.id)).toEqual(["a"]);
    expect(routed.owner.map((o) => o.id)).toEqual(["b", "c"]);
    expect(routed.kept).toEqual(["d"]);
  });

  it("a key change is honoured only when the judge also called it a wrong key", () => {
    const routed = route([
      {
        id: "a",
        decision: "fix",
        confidence: 0.9,
        reason: "",
        patch: { answer: "x" },
        keyChange: true,
        category: "naturalness",
      },
      {
        id: "b",
        decision: "fix",
        confidence: 0.9,
        reason: "",
        patch: { answer: "x" },
        keyChange: true,
        category: "wrong-key",
      },
    ]);
    expect(routed.fixes.map((f) => [f.id, f.keyChange ?? false])).toEqual([
      ["a", false],
      ["b", true],
    ]);
  });
});
