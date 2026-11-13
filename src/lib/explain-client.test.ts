import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./auth-headers", () => ({
  authHeaders: vi.fn(async () => ({ Authorization: "Bearer tok" })),
}));

import {
  ExplainError,
  explainErrorCopy,
  requestExplanation,
  wrongAnswerRequest,
} from "./explain-client";

const word = { kind: "word", course: "en", word: "borrow" } as const;
const ok = { explanation: "یعنی قرض گرفتن", language: "fa", direction: "rtl", cached: false };

function respond(status: number, body: unknown): typeof fetch {
  return vi.fn(
    async () => new Response(JSON.stringify(body), { status }),
  ) as unknown as typeof fetch;
}
const kindOf = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return e instanceof ExplainError ? e.kind : "other";
  }
  return "none";
};

describe("requestExplanation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("POSTs the item with the bearer token and returns the explanation", async () => {
    const fetchImpl = respond(200, ok);
    expect(await requestExplanation(word, fetchImpl)).toEqual(ok);
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("/api/explain");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ Authorization: "Bearer tok" });
    expect(JSON.parse(init.body)).toEqual(word);
  });

  it.each([
    [400, { error: "same-language" }, "unsupported"],
    [422, { error: "unsupported-language" }, "unsupported"],
    [401, { error: "unauthorized" }, "notSignedIn"],
    [403, { error: "ai-consent-required" }, "aiConsentRequired"],
    [403, { error: "not-entitled" }, "notEntitled"],
    [429, { error: "x", code: "quota-exceeded" }, "quotaExceeded"],
    [500, {}, "unavailable"],
    [502, {}, "unavailable"],
  ])("maps HTTP %i %j to %s", async (status, body, kind) => {
    expect(await kindOf(requestExplanation(word, respond(status, body)))).toBe(kind);
  });

  it("is 'offline' when the network call itself fails", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    expect(await kindOf(requestExplanation(word, fetchImpl))).toBe("offline");
  });

  it("a 200 that is not the contract is not an explanation", async () => {
    expect(await kindOf(requestExplanation(word, respond(200, { explanation: "" })))).toBe(
      "unavailable",
    );
    expect(await kindOf(requestExplanation(word, respond(200, { nope: 1 })))).toBe("unavailable");
  });

  it("every failure has copy to show", () => {
    for (const k of [
      "offline",
      "quotaExceeded",
      "aiConsentRequired",
      "notSignedIn",
      "notEntitled",
      "unsupported",
      "unavailable",
    ] as const) {
      expect(explainErrorCopy(k).length).toBeGreaterThan(5);
    }
    expect(explainErrorCopy("quotaExceeded")).toMatch(/tomorrow/i);
    expect(explainErrorCopy("offline")).toMatch(/connection/i);
  });
});

describe("wrongAnswerRequest", () => {
  const mc = {
    id: "q1",
    type: "mc",
    prompt: "Which is right?",
    choices: ["I am live here", "I live here"],
    answer: 1,
    explanation: "x",
  } as never;
  it("builds the request from the question, the learner's answer and the right one", () => {
    expect(wrongAnswerRequest(mc, "I am live here", "en")).toEqual({
      kind: "wrong-answer",
      course: "en",
      question: "Which is right?",
      wrongAnswer: "I am live here",
      correctAnswer: "I live here",
    });
  });
  it("is null with no submitted answer (a skipped question has nothing to explain)", () => {
    expect(wrongAnswerRequest(mc, "", "en")).toBeNull();
    expect(wrongAnswerRequest(mc, null, "en")).toBeNull();
  });
  it("cuts overlong text to what the route accepts", () => {
    const long = { ...(mc as object), prompt: "p".repeat(900) } as never;
    expect(wrongAnswerRequest(long, "a", "en")!.question.length).toBeLessThanOrEqual(400);
  });
});
