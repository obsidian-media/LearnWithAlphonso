import { describe, expect, it, vi } from "vitest";
import {
  DEFINE_ATTEMPT_TIMEOUT_MS,
  DEFINE_MAX_ATTEMPTS,
  buildDefineMessages,
  defineWord,
  savedWordItemKey,
} from "./saved-word.server";

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

  describe("retry", () => {
    const timeoutErr = () => new DOMException("The operation timed out.", "TimeoutError");
    const sequence = (steps: (Response | Error)[]) => {
      let i = 0;
      return vi.fn(async () => {
        const step = steps[Math.min(i++, steps.length - 1)]!;
        if (step instanceof Error) throw step;
        return step;
      }) as unknown as typeof fetch;
    };
    const good = () => new Response(JSON.stringify(okBody), { status: 200 });

    it("retries once after a timeout and returns the second attempt's definition", async () => {
      const fetchImpl = sequence([timeoutErr(), good()]);
      const out = await defineWord({ input, apiKey: "k", model: "m", fetchImpl });
      expect(out?.meaning).toBe("a happy accident");
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    });

    it("retries once after a network error and after a 5xx", async () => {
      const a = sequence([new Error("reset"), good()]);
      expect((await defineWord({ input, apiKey: "k", model: "m", fetchImpl: a }))?.meaning).toBe(
        "a happy accident",
      );
      expect(a).toHaveBeenCalledTimes(2);
      const b = sequence([new Response("busy", { status: 503 }), good()]);
      expect((await defineWord({ input, apiKey: "k", model: "m", fetchImpl: b }))?.meaning).toBe(
        "a happy accident",
      );
      expect(b).toHaveBeenCalledTimes(2);
    });

    it("does not retry a 4xx", async () => {
      const fetchImpl = sequence([new Response("bad", { status: 400 }), good()]);
      expect(await defineWord({ input, apiKey: "k", model: "m", fetchImpl })).toBeNull();
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it("does not retry an unusable answer to a successful call", async () => {
      const bad = { choices: [{ message: { content: "I cannot help with that." } }] };
      const fetchImpl = sequence([new Response(JSON.stringify(bad), { status: 200 }), good()]);
      expect(await defineWord({ input, apiKey: "k", model: "m", fetchImpl })).toBeNull();
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it("gives null after two timeouts, and never makes a third call", async () => {
      const fetchImpl = sequence([timeoutErr(), timeoutErr(), good()]);
      expect(await defineWord({ input, apiKey: "k", model: "m", fetchImpl })).toBeNull();
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    });

    it("starts every attempt with its own fresh short timeout", async () => {
      const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
      const fetchImpl = sequence([timeoutErr(), timeoutErr()]);
      await defineWord({ input, apiKey: "k", model: "m", fetchImpl });
      expect(timeoutSpy).toHaveBeenCalledTimes(DEFINE_MAX_ATTEMPTS);
      expect(timeoutSpy).toHaveBeenCalledWith(DEFINE_ATTEMPT_TIMEOUT_MS);
      timeoutSpy.mockRestore();
    });

    it("does not start a retry once the caller's signal is aborted", async () => {
      const controller = new AbortController();
      const fetchImpl = vi.fn(async () => {
        controller.abort();
        throw timeoutErr();
      }) as unknown as typeof fetch;
      const out = await defineWord({
        input,
        apiKey: "k",
        model: "m",
        fetchImpl,
        signal: controller.signal,
      });
      expect(out).toBeNull();
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it("passes a signal that follows the caller's abort", async () => {
      const controller = new AbortController();
      const fetchImpl = sequence([good()]);
      await defineWord({ input, apiKey: "k", model: "m", fetchImpl, signal: controller.signal });
      const init = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock
        .calls[0]![1] as RequestInit;
      expect(init.signal!.aborted).toBe(false);
      controller.abort();
      expect(init.signal!.aborted).toBe(true);
    });

    it("discards a 5xx body before retrying", async () => {
      const bad = new Response("busy", { status: 503 });
      const cancel = vi.spyOn(bad.body!, "cancel");
      const fetchImpl = sequence([bad, good()]);
      await defineWord({ input, apiKey: "k", model: "m", fetchImpl });
      expect(cancel).toHaveBeenCalledTimes(1);
    });

    it("keeps the worst case (two attempts) well inside the clients' waits", () => {
      expect(DEFINE_ATTEMPT_TIMEOUT_MS * DEFINE_MAX_ATTEMPTS).toBeLessThanOrEqual(20_000);
    });
  });
});
