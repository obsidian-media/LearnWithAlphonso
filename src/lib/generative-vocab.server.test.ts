import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  parseVocabCandidates,
  proposeVocabCandidates,
  vocabProposalPrompt,
  verifyCandidatePos,
  proposeVocabForTopic,
} from "./generative-vocab.server";

const CANDIDATES = [
  { word: "coffee", pos: "noun" },
  { word: "walk", pos: "verb" },
  { word: "happy", pos: "adjective" },
];

const originalFetch = global.fetch;

beforeEach(() => {
  global.fetch = vi
    .fn()
    .mockResolvedValue(
      new Response(
        JSON.stringify({ choices: [{ message: { content: JSON.stringify(CANDIDATES) } }] }),
        { status: 200 },
      ),
    );
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe("parseVocabCandidates", () => {
  it("parses a well-formed JSON array", () => {
    expect(parseVocabCandidates(JSON.stringify(CANDIDATES))).toEqual(CANDIDATES);
  });

  it("strips markdown code fences before parsing", () => {
    expect(parseVocabCandidates("```json\n" + JSON.stringify(CANDIDATES) + "\n```")).toEqual(
      CANDIDATES,
    );
  });

  it("returns [] for invalid JSON", () => {
    expect(parseVocabCandidates("not json")).toEqual([]);
  });

  it("returns [] when a candidate's pos isn't noun/verb/adjective", () => {
    expect(parseVocabCandidates(JSON.stringify([{ word: "x", pos: "adverb" }]))).toEqual([]);
  });
});

describe("vocabProposalPrompt", () => {
  it("includes the topic and requested parts of speech", () => {
    const prompt = vocabProposalPrompt("daily routines", ["noun", "verb"]);
    expect(prompt).toContain("daily routines");
    expect(prompt).toContain("noun, verb");
  });

  it("explicitly excludes 'be'", () => {
    expect(vocabProposalPrompt("test", ["verb"])).toContain('Do not include "be"');
  });
});

describe("proposeVocabCandidates", () => {
  it("calls NVIDIA NIM and returns parsed candidates", async () => {
    const result = await proposeVocabCandidates({
      topic: "daily routines",
      posTypes: ["noun", "verb", "adjective"],
      nvidiaApiKey: "test-key",
      nvidiaModel: "test-model",
    });
    expect(result).toEqual(CANDIDATES);
  });

  it("returns [] when the API responds with a non-OK status", async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response("", { status: 500 }));
    const result = await proposeVocabCandidates({
      topic: "x",
      posTypes: ["noun"],
      nvidiaApiKey: "k",
      nvidiaModel: "m",
    });
    expect(result).toEqual([]);
  });

  it("returns [] when fetch throws", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("network error"));
    const result = await proposeVocabCandidates({
      topic: "x",
      posTypes: ["noun"],
      nvidiaApiKey: "k",
      nvidiaModel: "m",
    });
    expect(result).toEqual([]);
  });
});

describe("verifyCandidatePos", () => {
  it("accepts a candidate whose claimed POS matches compromise's own tagging", () => {
    expect(verifyCandidatePos({ word: "coffee", pos: "noun" })).toBe(true);
    expect(verifyCandidatePos({ word: "happy", pos: "adjective" })).toBe(true);
    expect(verifyCandidatePos({ word: "walk", pos: "verb" })).toBe(true);
  });

  it("rejects a candidate with a deliberately wrong claimed POS", () => {
    expect(verifyCandidatePos({ word: "coffee", pos: "verb" })).toBe(false);
    expect(verifyCandidatePos({ word: "quickly", pos: "noun" })).toBe(false);
  });
});

describe("proposeVocabForTopic", () => {
  it("merges accepted candidates into the existing vocab and reports rejections", async () => {
    const result = await proposeVocabForTopic({
      topic: "daily routines",
      posTypes: ["noun", "verb", "adjective"],
      level: "A1",
      existingVocab: [],
      nvidiaApiKey: "k",
      nvidiaModel: "m",
    });
    expect(result.accepted).toHaveLength(3);
    expect(result.rejected).toEqual([]);
    expect(result.merged).toHaveLength(3);
    expect(result.merged.find((e) => e.word === "coffee")?.topics).toEqual(["daily routines"]);
  });

  it("excludes 'be' even if the LLM proposes it, reporting it as rejected", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify([{ word: "be", pos: "verb" }]) } }],
        }),
        { status: 200 },
      ),
    );
    const result = await proposeVocabForTopic({
      topic: "x",
      posTypes: ["verb"],
      level: "A1",
      existingVocab: [],
      nvidiaApiKey: "k",
      nvidiaModel: "m",
    });
    expect(result.accepted).toEqual([]);
    expect(result.rejected).toEqual([{ word: "be", pos: "verb" }]);
  });

  it("rejects a candidate that fails the POS cross-check", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify([{ word: "coffee", pos: "verb" }]) } }],
        }),
        { status: 200 },
      ),
    );
    const result = await proposeVocabForTopic({
      topic: "x",
      posTypes: ["verb"],
      level: "A1",
      existingVocab: [],
      nvidiaApiKey: "k",
      nvidiaModel: "m",
    });
    expect(result.accepted).toEqual([]);
    expect(result.rejected).toEqual([{ word: "coffee", pos: "verb" }]);
  });
});
