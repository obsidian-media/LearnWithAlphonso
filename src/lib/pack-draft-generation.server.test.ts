import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { draftPack, draftPackPrompt, parseDraftPack } from "./pack-draft-generation.server";

const DRAFT = {
  title: "Weather",
  subtitle: "Talking about the weather",
  note: "Common weather vocabulary.",
  lines: ["sunny|soleado", "rainy|lluvioso", "cloudy|nublado"],
};

const originalFetch = global.fetch;

beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(DRAFT) } }] }), {
      status: 200,
    }),
  );
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe("parseDraftPack", () => {
  it("parses a well-formed JSON object", () => {
    expect(parseDraftPack(JSON.stringify(DRAFT))).toEqual(DRAFT);
  });

  it("strips markdown code fences before parsing", () => {
    expect(parseDraftPack("```json\n" + JSON.stringify(DRAFT) + "\n```")).toEqual(DRAFT);
  });

  it("returns null for invalid JSON", () => {
    expect(parseDraftPack("not json")).toBeNull();
  });

  it("returns null when the shape doesn't match the schema", () => {
    expect(parseDraftPack(JSON.stringify({ title: "only a title" }))).toBeNull();
  });

  it("returns null when lines has fewer than 3 entries", () => {
    expect(parseDraftPack(JSON.stringify({ ...DRAFT, lines: ["a|b"] }))).toBeNull();
  });
});

describe("draftPackPrompt", () => {
  it("includes the topic, target language, and requested line count", () => {
    const prompt = draftPackPrompt({
      topic: "Weather vocabulary",
      targetLanguage: "Spanish",
      kind: "pair",
      lineCount: 20,
    });
    expect(prompt).toContain("Weather vocabulary");
    expect(prompt).toContain("Spanish");
    expect(prompt).toContain("exactly 20 lines");
  });

  it("describes the cloze line shape differently from pair", () => {
    const cloze = draftPackPrompt({
      topic: "Present tense",
      targetLanguage: "French",
      kind: "cloze",
      lineCount: 10,
    });
    expect(cloze).toContain("___");
  });
});

describe("draftPack", () => {
  function params(overrides: Partial<Parameters<typeof draftPack>[0]> = {}) {
    return {
      topic: "Weather vocabulary",
      targetLanguage: "Spanish",
      kind: "pair" as const,
      lineCount: 3,
      nvidiaApiKey: "test-key",
      nvidiaModel: "test-model",
      ...overrides,
    };
  }

  it("returns the parsed draft on success", async () => {
    const result = await draftPack(params());
    expect(result).toEqual(DRAFT);
  });

  it("throws when the upstream call fails", async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response("error", { status: 500 }));
    await expect(draftPack(params())).rejects.toThrow(/NVIDIA NIM request failed/);
  });

  it("throws when fetch itself throws", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("network down"));
    await expect(draftPack(params())).rejects.toThrow("network down");
  });

  it("throws with the raw content when the response doesn't parse into a usable draft", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: "not json" } }] }), {
        status: 200,
      }),
    );
    await expect(draftPack(params())).rejects.toThrow(/did not parse into a usable draft/);
  });

  it("throws when the model declines with an empty-lines draft", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({ title: "", subtitle: "", note: "", lines: [] }),
              },
            },
          ],
        }),
        { status: 200 },
      ),
    );
    await expect(draftPack(params())).rejects.toThrow(/did not parse into a usable draft/);
  });
});
