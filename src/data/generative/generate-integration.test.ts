import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { proposeVocabForTopic } from "../../lib/generative-vocab.server";
import { expandTemplate } from "./expand";
import { TEMPLATES } from "./templates";
import { packQuestions, type Pack } from "../bank-engine";

/**
 * Full pipeline test (mocked LLM, real `compromise` compilation) --
 * reuses the same invariants curriculum-consistency.test.ts enforces
 * across every hand-authored/AI-drafted course, as the acceptance gate
 * for generated content too (design doc's Testing section: "reusing
 * that scan as the acceptance gate for generated content, not writing
 * a parallel one").
 */
const CANDIDATES = [
  { word: "coffee", pos: "noun" },
  { word: "school", pos: "noun" },
  { word: "walk", pos: "verb" },
  { word: "run", pos: "verb" },
];

const originalFetch = global.fetch;
beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({ choices: [{ message: { content: JSON.stringify(CANDIDATES) } }] }),
      { status: 200 },
    ),
  );
});
afterEach(() => {
  global.fetch = originalFetch;
});

describe("full generate pipeline", () => {
  it("produces a pack whose questions have no out-of-range answers, duplicate choices, or bank mismatches", async () => {
    const template = TEMPLATES.find((t) => t.id === "svo-present")!;
    const proposal = await proposeVocabForTopic({
      topic: "daily routines",
      posTypes: ["noun", "verb"],
      level: "A1",
      existingVocab: [],
      nvidiaApiKey: "test-key",
      nvidiaModel: "test-model",
    });
    expect(proposal.accepted.length).toBeGreaterThan(0);

    const lines = expandTemplate({
      template,
      vocab: proposal.merged,
      packId: "integrationtest1",
      targetCount: 20,
    });
    expect(lines.length).toBeGreaterThan(0);

    const pack: Pack = {
      id: "integrationtest1",
      title: "Daily Routines",
      subtitle: "Generated",
      kind: "cloze",
      note: "test",
      data: lines.join("\n"),
    };

    const questions = packQuestions(pack);
    expect(questions.length).toBe(lines.length);
    for (const q of questions) {
      if (q.type === "mc") {
        expect(q.answer).toBeGreaterThanOrEqual(0);
        expect(q.answer).toBeLessThan(q.choices.length);
        const normalized = q.choices.map((c) => c.trim().toLowerCase());
        expect(new Set(normalized).size).toBe(normalized.length);
      }
      if (q.type === "fill") {
        expect(q.bank.map((b) => b.toLowerCase())).toContain(q.answer.toLowerCase());
      }
    }
  });

  it("returns an empty pipeline result gracefully when the LLM proposes nothing usable", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: "[]" } }] }), {
        status: 200,
      }),
    );
    const template = TEMPLATES.find((t) => t.id === "svo-present")!;
    const proposal = await proposeVocabForTopic({
      topic: "obscure topic",
      posTypes: ["noun", "verb"],
      level: "A1",
      existingVocab: [],
      nvidiaApiKey: "test-key",
      nvidiaModel: "test-model",
    });
    expect(proposal.accepted).toEqual([]);

    const lines = expandTemplate({
      template,
      vocab: proposal.merged,
      packId: "integrationtest2",
      targetCount: 20,
    });
    expect(lines).toEqual([]);
  });
});
