import { afterEach, describe, expect, it, vi } from "vitest";
import {
  LLM_CHAT_URL,
  LLM_NO_REASONING,
  LLM_PROVIDER_PREFS,
  llmChatCompletion,
  normalizeLlmResponse,
} from "./llm-chat.server";
import { SAFETY_PREAMBLE } from "./ai-safety";

type Sent = { url: string; body: Record<string, unknown> };

function capture(response: () => Response = () => new Response("{}")) {
  const sent: Sent[] = [];
  const fetchImpl = ((url: string, init?: RequestInit) => {
    sent.push({ url, body: JSON.parse(String(init?.body)) });
    return Promise.resolve(response());
  }) as typeof fetch;
  return { sent, fetchImpl };
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

afterEach(() => vi.restoreAllMocks());

describe("llmChatCompletion (OpenRouter)", () => {
  it("sends OpenRouter the model list, safety-wrapped messages, reasoning off and the provider prefs", async () => {
    const { sent, fetchImpl } = capture();
    await llmChatCompletion({
      apiKey: "k",
      body: { model: "a/x", messages: [{ role: "user", content: "hola" }], max_tokens: 600 },
      models: ["a/x", "b/y"],
      providers: ["anthropic"],
      fetchImpl,
    });
    expect(sent[0].url).toBe(LLM_CHAT_URL);
    expect(LLM_CHAT_URL).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(sent[0].body.models).toEqual(["a/x", "b/y"]);
    expect("model" in sent[0].body).toBe(false);
    expect(sent[0].body.reasoning).toEqual({ effort: "none" });
    expect(sent[0].body.provider).toEqual({ data_collection: "deny", only: ["anthropic"] });
    expect(sent[0].body.max_tokens).toBe(600);
    expect((sent[0].body.messages as { content: string }[])[0].content).toBe(SAFETY_PREAMBLE);
  });

  it("puts a caller's own model first, without duplicates", async () => {
    const { sent, fetchImpl } = capture();
    await llmChatCompletion({
      apiKey: "k",
      body: { model: "b/y", messages: [{ role: "user", content: "x" }] },
      models: ["a/x", "b/y"],
      fetchImpl,
    });
    expect(sent[0].body.models).toEqual(["b/y", "a/x"]);
  });

  it("does not let a caller turn reasoning on or allow data collection", async () => {
    const { sent, fetchImpl } = capture();
    await llmChatCompletion({
      apiKey: "k",
      body: {
        model: "a/x",
        messages: [{ role: "user", content: "x" }],
        reasoning: { effort: "high" },
        provider: { data_collection: "allow", only: ["amazon-bedrock"] },
      },
      models: ["a/x"],
      providers: ["anthropic"],
      fetchImpl,
    });
    expect(sent[0].body.reasoning).toEqual(LLM_NO_REASONING);
    expect(sent[0].body.provider).toEqual({ ...LLM_PROVIDER_PREFS, only: ["anthropic"] });
  });
});

describe("normalizeLlmResponse", () => {
  it.each([401, 402, 403])("a %s from the provider becomes 503 and is logged", async (status) => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await normalizeLlmResponse(
      json(status, { error: { code: status, message: "nope" } }),
    );
    expect(res.status).toBe(503);
    expect(String(log.mock.calls[0]?.[0])).toContain("[llm] provider unavailable");
  });

  it("an upstream 429 stays 429", async () => {
    const res = await normalizeLlmResponse(
      json(429, { error: { code: 429, message: "slow down" } }),
    );
    expect(res.status).toBe(429);
  });

  it("a 200 carrying an error and no choices becomes 502", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await normalizeLlmResponse(
      json(200, { error: { code: 502, message: "upstream" } }),
    );
    expect(res.status).toBe(502);
  });

  it("a normal 200 passes through with its content", async () => {
    const res = await normalizeLlmResponse(
      json(200, { choices: [{ message: { content: "hola" } }] }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).choices[0].message.content).toBe("hola");
  });

  it("is applied by llmChatCompletion itself", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { fetchImpl } = capture(() => json(402, { error: { code: 402, message: "credits" } }));
    const res = await llmChatCompletion({
      apiKey: "k",
      body: { model: "a/x", messages: [{ role: "user", content: "x" }] },
      models: ["a/x"],
      fetchImpl,
    });
    expect(res.status).toBe(503);
  });
});
