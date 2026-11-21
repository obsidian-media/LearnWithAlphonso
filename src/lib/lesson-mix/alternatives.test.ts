import { describe, expect, it } from "vitest";
import type { ReviewItem } from "../content-review/inventory";
import { altsUser, dedupeWordings, mergeAlternatives, parseAlts } from "./alternatives";
import { translateGate, type GateContext } from "./gates";

const ctx: GateContext = {
  course: "fr",
  level: "A2",
  existing: { listening: new Set(), speak: new Set(), translate: new Set() },
};
const base = {
  prompt: "Say that you ate a big salad yesterday.",
  acceptableAnswers: ["J'ai mangé une grande salade hier.", "Hier, j'ai mangé une grande salade."],
  explanation:
    '"J\'ai mangé une grande salade hier." uses the passé composé with "avoir" for a finished action.',
};
const check = (answers: string[]) =>
  translateGate({ ...base, acceptableAnswers: answers }, ctx).problems;
const item = (id: string): ReviewItem =>
  ({
    id,
    course: "fr",
    kind: "question",
    level: "A2",
    data: base,
    text: "",
  }) as unknown as ReviewItem;
const chunk = { customId: "alt-fr-0", course: "fr" as const, items: [item("a"), item("b")] };

describe("mergeAlternatives", () => {
  it("adds a new wording, appended after the canonical ones", () => {
    const r = mergeAlternatives(base, ["J'ai mangé une grosse salade hier."], check);
    expect(r.added).toEqual(["J'ai mangé une grosse salade hier."]);
    expect(r.translate.acceptableAnswers[0]).toBe(base.acceptableAnswers[0]);
    expect(r.translate.acceptableAnswers).toHaveLength(3);
  });
  it("drops a wording the grader would already match (accent, case, punctuation)", () => {
    const r = mergeAlternatives(base, ["j'ai mange une grande salade hier"], check);
    expect(r.added).toEqual([]);
    expect(r.rejected).toHaveLength(1);
  });
  it("drops a wording that breaks a gate, keeps the good ones", () => {
    const r = mergeAlternatives(
      base,
      [
        "I ate the salad with the sauce and the bread",
        "J'ai mangé une salade énorme hier.",
        "Je mange une salade(e) hier.",
      ],
      check,
    );
    expect(r.added).toEqual(["J'ai mangé une salade énorme hier."]);
    expect(r.rejected).toHaveLength(2);
  });
  it("never passes the cap on wordings", () => {
    const many = [
      "alpha",
      "bravo",
      "charlie",
      "delta",
      "echo",
      "foxtrot",
      "golf",
      "hotel",
      "india",
      "juliet",
      "kilo",
      "lima",
    ].map((w) => `J'ai mangé une salade ${w} hier.`);
    expect(
      mergeAlternatives(base, many, check).translate.acceptableAnswers.length,
    ).toBeLessThanOrEqual(9);
  });
});

describe("dedupeWordings", () => {
  it("drops the contraction twin, keeps the first and the order", () => {
    const t = {
      ...base,
      acceptableAnswers: ["What is your name?", "What's your name?", "Who are you called?"],
    };
    expect(dedupeWordings(t).acceptableAnswers).toEqual([
      "What is your name?",
      "Who are you called?",
    ]);
    expect(dedupeWordings(base)).toBe(base);
  });
});

describe("parseAlts", () => {
  it("maps keys to ids and reports a missing key", () => {
    const r = parseAlts(chunk, 'x {"items":[{"key":"i1","add":["A b c.", 3, " "]}]}');
    expect(r.adds).toEqual({ a: ["A b c."] });
    expect(r.missing).toEqual(["b"]);
  });
  it("treats garbage as everything missing", () => {
    expect(parseAlts(chunk, "no json").missing).toEqual(["a", "b"]);
  });
  it("shows the model the prompt and the listed wordings", () => {
    const u = altsUser(chunk);
    expect(u).toContain("key: i2");
    expect(u).toContain("a big salad");
    expect(u).toContain("grande salade");
  });
});
