import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./auth-headers", () => ({
  authHeaders: vi.fn(async () => ({ Authorization: "Bearer tok" })),
}));

import { allowsSaving, saveErrorFor, saveWord } from "./saved-word-client";

const input = { word: "tea", sentence: "I want tea.", course: "en" as const };

function respond(status: number, body: unknown): typeof fetch {
  return vi.fn(
    async () => new Response(JSON.stringify(body), { status }),
  ) as unknown as typeof fetch;
}

describe("saveWord", () => {
  beforeEach(() => vi.clearAllMocks());

  it("POSTs the word, sentence and course with the bearer token", async () => {
    const fetchImpl = respond(200, {
      alreadySaved: false,
      word: "tea",
      sentence: "I want tea.",
      explanation: "A hot drink.",
    });
    const result = await saveWord(input, fetchImpl);
    expect(result).toEqual({
      alreadySaved: false,
      word: "tea",
      sentence: "I want tea.",
      explanation: "A hot drink.",
    });
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("/api/define-word");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      "Content-Type": "application/json",
      Authorization: "Bearer tok",
    });
    expect(JSON.parse(init.body)).toEqual(input);
  });

  it("reports an already-saved word as a result, not an error", async () => {
    const result = await saveWord(
      input,
      respond(200, { alreadySaved: true, word: "tea", sentence: "x", explanation: "y" }),
    );
    expect(result.alreadySaved).toBe(true);
  });

  it.each([
    [400, "invalid"],
    [401, "notSignedIn"],
    [403, "notSignedIn"],
    [409, "limitReached"],
    [429, "quotaExceeded"],
    [500, "unavailable"],
    [502, "unavailable"],
  ])("maps HTTP %i to %s", async (status, kind) => {
    await expect(saveWord(input, respond(status, { error: "x" }))).rejects.toMatchObject({ kind });
  });

  it("maps a network failure to offline", async () => {
    const failing = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    await expect(saveWord(input, failing)).rejects.toMatchObject({ kind: "offline" });
  });

  it("treats a 200 with the wrong shape as unavailable rather than a save", async () => {
    await expect(saveWord(input, respond(200, { ok: true }))).rejects.toMatchObject({
      kind: "unavailable",
    });
    await expect(
      saveWord(input, respond(200, { alreadySaved: "yes", word: 1, sentence: 2, explanation: 3 })),
    ).rejects.toMatchObject({ kind: "unavailable" });
  });

  it("treats a 200 with a non-JSON body as unavailable", async () => {
    const bad = vi.fn(
      async () => new Response("<html>", { status: 200 }),
    ) as unknown as typeof fetch;
    await expect(saveWord(input, bad)).rejects.toMatchObject({ kind: "unavailable" });
  });
});

describe("saveErrorFor", () => {
  it("gives every kind a message the learner can act on", () => {
    for (const kind of [
      "invalid",
      "limitReached",
      "quotaExceeded",
      "notSignedIn",
      "unavailable",
      "offline",
    ] as const) {
      expect(saveErrorFor(kind).length).toBeGreaterThan(10);
    }
    expect(saveErrorFor("limitReached")).toContain("500");
  });
});

describe("allowsSaving", () => {
  it("is English-only: French and Spanish lesson text mixes two languages", () => {
    expect(allowsSaving("en")).toBe(true);
    expect(allowsSaving("fr")).toBe(false);
    expect(allowsSaving("es")).toBe(false);
  });
});
