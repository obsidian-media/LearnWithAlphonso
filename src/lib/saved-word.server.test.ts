import { describe, expect, it, vi } from "vitest";
import { buildDefineMessages, defineWord, savedWordItemKey } from "./saved-word.server";

const input = { word: "serendipity", sentence: "It was pure serendipity.", course: "en" as const };

describe("savedWordItemKey", () => {
  it("is 'savedword:' plus 16 hex characters and satisfies the review item-key rule", () => {
    const key = savedWordItemKey("en", "serendipity");
    expect(key).toMatch(/^savedword:[0-9a-f]{16}$/);
    expect(key).toMatch(/^[a-z0-9]+:[a-z0-9]+$/);
  });

  it("is the same for the same word whatever its case", () => {
    expect(savedWordItemKey("en", "Serendipity")).toBe(savedWordItemKey("en", "serendipity"));
  });

  it("differs by course", () => {
    expect(savedWordItemKey("en", "pain")).not.toBe(savedWordItemKey("fr", "pain"));
  });

  it("treats a typographic apostrophe and a straight one as the same word", () => {
    expect(savedWordItemKey("en", "don’t")).toBe(savedWordItemKey("en", "don't"));
  });

  it("treats composed and decomposed accents as the same word", () => {
    const composed = "été"; // été
    const decomposed = "été";
    expect(composed).not.toBe(decomposed);
    expect(savedWordItemKey("fr", composed)).toBe(savedWordItemKey("fr", decomposed));
  });
});

describe("buildDefineMessages", () => {
  it("sends the word and sentence as data in the user message, JSON-encoded", () => {
    const messages = buildDefineMessages({
      ...input,
      sentence: 'He said "hello" and left.',
      word: "hello",
    });
    const user = messages.find((m) => m.role === "user")!;
    expect(user.content).toContain(JSON.stringify("hello"));
    expect(user.content).toContain(JSON.stringify('He said "hello" and left.'));
  });

  it("keeps instructions in the system message, not in the learner's text", () => {
    const messages = buildDefineMessages(input);
    expect(messages[0]!.role).toBe("system");
    expect(messages[0]!.content).toMatch(/JSON/);
    expect(messages[0]!.content).not.toContain("serendipity");
  });
});

const okBody = {
  choices: [
    {
      message: {
        content: JSON.stringify({
          meaning: "a happy accident",
          translation: "a lucky find",
          wrong: ["a sad ending", "a long journey", "a loud noise"],
        }),
      },
    },
  ],
};

function fetchReturning(res: Response | Error) {
  return vi.fn(async () => {
    if (res instanceof Error) throw res;
    return res;
  }) as unknown as typeof fetch;
}

describe("defineWord", () => {
  it("returns the parsed definition on a good response", async () => {
    const fetchImpl = fetchReturning(new Response(JSON.stringify(okBody), { status: 200 }));
    const out = await defineWord({ input, apiKey: "k", model: "m", fetchImpl });
    expect(out?.meaning).toBe("a happy accident");
    expect(out?.wrong).toHaveLength(3);
  });

  it("calls NVIDIA with the key, model, a 600-token cap and a timeout signal", async () => {
    const fetchImpl = fetchReturning(new Response(JSON.stringify(okBody), { status: 200 }));
    await defineWord({ input, apiKey: "secret", model: "some/model", fetchImpl });
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(String(url)).toBe("https://integrate.api.nvidia.com/v1/chat/completions");
    const i = init as RequestInit;
    expect((i.headers as Record<string, string>).Authorization).toBe("Bearer secret");
    const body = JSON.parse(String(i.body));
    expect(body.model).toBe("some/model");
    expect(body.max_tokens).toBe(600);
    expect(i.signal).toBeInstanceOf(AbortSignal);
  });

  it("returns null on a non-200 response", async () => {
    const fetchImpl = fetchReturning(new Response("nope", { status: 500 }));
    expect(await defineWord({ input, apiKey: "k", model: "m", fetchImpl })).toBeNull();
  });

  it("returns null when the model's answer is not usable", async () => {
    const bad = { choices: [{ message: { content: "I cannot help with that." } }] };
    const fetchImpl = fetchReturning(new Response(JSON.stringify(bad), { status: 200 }));
    expect(await defineWord({ input, apiKey: "k", model: "m", fetchImpl })).toBeNull();
  });

  it("returns null when the model gives the right answer among the wrong ones", async () => {
    const bad = {
      choices: [
        { message: { content: JSON.stringify({ meaning: "Happy", wrong: ["happy", "b", "c"] }) } },
      ],
    };
    const fetchImpl = fetchReturning(new Response(JSON.stringify(bad), { status: 200 }));
    expect(await defineWord({ input, apiKey: "k", model: "m", fetchImpl })).toBeNull();
  });

  it("returns null (never throws) on a network error or timeout", async () => {
    expect(
      await defineWord({
        input,
        apiKey: "k",
        model: "m",
        fetchImpl: fetchReturning(new Error("boom")),
      }),
    ).toBeNull();
    const timeout = new DOMException("The operation timed out.", "TimeoutError");
    expect(
      await defineWord({
        input,
        apiKey: "k",
        model: "m",
        fetchImpl: fetchReturning(timeout as unknown as Error),
      }),
    ).toBeNull();
  });
});
