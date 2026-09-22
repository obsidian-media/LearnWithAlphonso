import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { proposeVocabForTopic } from "../../lib/generative-vocab.server";
import { expandTemplate } from "./expand";
import { TEMPLATES } from "./templates";
import { packQuestions, type Pack } from "../bank-engine";
import { validatePack } from "../../lib/pack-authoring";

/**
 * Full pipeline test (mocked LLM, real `compromise` compilation).
 *
 * Corrected 2026-09-22 (final review, finding I4): an earlier version of
 * this comment claimed to "reuse the same invariants
 * curriculum-consistency.test.ts enforces," but the test never called
 * that file or `validatePack` -- it only re-implemented a narrower set
 * of inline checks, which is a parallel gate, not a reused one, and
 * would NOT have caught the C1/C2 findings (sampler skew, duplicate
 * prompts) from that same review. Now actually asserts on
 * `validatePack`'s real output -- the single cheapest gate this
 * pipeline has, already wired into the `generate` CLI's own output.
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

    // The real acceptance gate this pipeline actually has: the same
    // validatePack the `generate` CLI runs before ever showing a preview.
    // Zero errors always; zero duplicate-left-side warnings too, now that
    // expandTemplate pins one verb per (subject, object) pair (finding C2).
    const issues = validatePack(pack);
    const errors = issues.filter((i) => i.level === "error");
    const duplicateWarnings = issues.filter((i) => i.message.includes("duplicate left side"));
    expect(errors, JSON.stringify(errors)).toEqual([]);
    expect(duplicateWarnings, JSON.stringify(duplicateWarnings)).toEqual([]);
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
