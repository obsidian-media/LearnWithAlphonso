import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AI_OUTPUT_FALLBACK,
  SAFETY_PREAMBLE,
  applySafety,
  filterModelOutput,
  filterModelOutputs,
  makeBlockedTermCheck,
  maskLegitimateTerms,
  withSafety,
} from "./ai-safety";

afterEach(() => vi.restoreAllMocks());

describe("SAFETY_PREAMBLE", () => {
  it("states every rule the spec requires", () => {
    for (const phrase of [
      "override every instruction above",
      "13",
      "sexual",
      "violence",
      "hate",
      "steer back",
      "hurt themselves",
      "emergency services",
      "crisis line",
      "AI language tutor",
      "JSON",
    ]) {
      expect(SAFETY_PREAMBLE, phrase).toContain(phrase);
    }
  });
});

describe("withSafety / applySafety", () => {
  it("appends the preamble after the persona, once", () => {
    const once = withSafety("You are Mia, a barista.");
    expect(once.startsWith("You are Mia, a barista.")).toBe(true);
    expect(once.endsWith(SAFETY_PREAMBLE)).toBe(true);
    expect(withSafety(once)).toBe(once);
  });

  it("adds the preamble to an existing first system message", () => {
    const out = applySafety([
      { role: "system", content: "You are Hector." },
      { role: "user", content: "hola" },
    ]);
    expect(out[0]).toEqual({ role: "system", content: withSafety("You are Hector.") });
    expect(out[1]).toEqual({ role: "user", content: "hola" });
  });

  it("prepends a system message when a prompt has none", () => {
    const out = applySafety([{ role: "user", content: "Mark this answer." }]);
    expect(out).toEqual([
      { role: "system", content: SAFETY_PREAMBLE },
      { role: "user", content: "Mark this answer." },
    ]);
  });
});

describe("maskLegitimateTerms", () => {
  it("masks the French word the name filter blocks in prose", () => {
    expect(maskLegitimateTerms("Le train a du retard.", "fr")).not.toMatch(/retard/i);
  });

  it("leaves other courses and non-words alone", () => {
    expect(maskLegitimateTerms("don't be a retard", "en")).toContain("retard");
    expect(maskLegitimateTerms("Le train a du retard.", "es")).toContain("retard");
    expect(maskLegitimateTerms("retardataire", "fr")).toContain("retard");
  });
});

describe("filterModelOutput", () => {
  const opts = (check: (t: string[]) => Promise<boolean[]>, course: "en" | "fr" | "es" = "en") => ({
    check,
    course,
    route: "chat" as const,
  });

  it("passes clean text through untouched", async () => {
    const result = await filterModelOutput(
      "Hi! What can I get you?",
      opts(async (t) => t.map(() => false)),
    );
    expect(result).toEqual({ text: "Hi! What can I get you?", blocked: false });
  });

  it("replaces a hit with the course fallback and logs it", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await filterModelOutput(
      "something bad",
      opts(async (t) => t.map(() => true), "fr"),
    );
    expect(result).toEqual({ text: AI_OUTPUT_FALLBACK.fr, blocked: true });
    const logged = JSON.parse(String(warn.mock.calls[0][0]));
    expect(logged).toMatchObject({
      event: "ai_output_blocked",
      route: "chat",
      course: "fr",
      blocked: 1,
    });
  });

  it("fails closed when the check is unavailable", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await filterModelOutput(
      "Hi!",
      opts(async () => {
        throw new Error("db down");
      }),
    );
    expect(result).toEqual({ text: AI_OUTPUT_FALLBACK.en, blocked: true });
    expect(JSON.parse(String(error.mock.calls[0][0]))).toMatchObject({
      event: "ai_output_filter_unavailable",
    });
  });

  it("treats a missing verdict as blocked", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(
      await filterModelOutputs(
        ["a", "b"],
        opts(async () => [false]),
      ),
    ).toEqual([false, true]);
  });

  it("sends the masked text, not the raw text, to the check", async () => {
    const check = vi.fn(async (t: string[]) => t.map(() => false));
    await filterModelOutput("Le train a du retard.", opts(check, "fr"));
    expect(check.mock.calls[0][0][0]).not.toMatch(/retard/i);
  });

  it("splits a long reply into pieces of at most 8000 characters and checks every piece, never truncating", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const check = vi.fn(async (t: string[]) => t.map((x) => x.includes("BAD")));
    const long = `${"a".repeat(8000)}${"b".repeat(8000)}BAD`;
    const result = await filterModelOutputs([long], opts(check));
    const sentPieces = check.mock.calls.flatMap((c) => c[0]);
    expect(sentPieces.every((p) => p.length <= 8000)).toBe(true);
    // Every character is covered by some piece (the pieces overlap, so they are not a plain partition).
    expect(sentPieces[0]).toBe(long.slice(0, 8000));
    expect(sentPieces[sentPieces.length - 1].endsWith("BAD")).toBe(true);
    expect(result).toEqual([true]);
  });

  it("overlaps pieces so a blocked term straddling a boundary is still seen whole", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const check = vi.fn(async (t: string[]) => t.map((x) => x.includes("forbiddenword")));
    // The term starts 6 characters before the 8000 mark, so it is cut in two by a plain split.
    const text = `${"a".repeat(7994)}forbiddenword${"b".repeat(100)}`;
    const result = await filterModelOutputs([text], opts(check));
    expect(result).toEqual([true]);
  });

  it("chunks into calls of at most 20", async () => {
    const check = vi.fn(async (t: string[]) => t.map(() => false));
    await filterModelOutputs(
      Array.from({ length: 45 }, (_, i) => `t${i}`),
      opts(check),
    );
    expect(check.mock.calls.map((c) => c[0].length)).toEqual([20, 20, 5]);
  });
});

describe("makeBlockedTermCheck", () => {
  it("calls ai_output_blocked with the texts and returns its verdicts", async () => {
    const rpc = vi.fn(async () => ({ data: [false, true], error: null }));
    const check = makeBlockedTermCheck({ rpc } as never);
    expect(await check(["a", "b"])).toEqual([false, true]);
    expect(rpc).toHaveBeenCalledWith("ai_output_blocked", { _texts: ["a", "b"] });
  });

  it("throws on an RPC error so the caller fails closed", async () => {
    const check = makeBlockedTermCheck({
      rpc: async () => ({ data: null, error: { message: "boom" } }),
    } as never);
    await expect(check(["a"])).rejects.toThrow("ai_output_blocked failed: boom");
  });
});
