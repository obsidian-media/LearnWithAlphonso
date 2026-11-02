import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  LLM_CHAT_URL,
  LLM_DEFAULT_TIMEOUT_MS,
  LLM_NO_REASONING,
  LLM_PROVIDER_PREFS,
  llmChatCompletion,
} from "./llm-chat.server";
import { LLM_CHAT_MODELS_DEFAULT, parseLlmChatModels } from "./llm-chat-model.server";

// With reasoning on, Practice replies took 17-88 s in production and capped calls (Save word, generated practice)
// timed out or came back cut off. Both chokepoints must send the same off switch and the same routing rules.
const edge = fs.readFileSync(
  path.resolve(__dirname, "../../supabase/functions/_shared/llm-chat.ts"),
  "utf8",
);

describe("AI text requests", () => {
  it("always carry a deadline: the caller's, or a default when the caller sets none", async () => {
    const signals: (AbortSignal | null | undefined)[] = [];
    const fetchImpl = ((_u: string, init?: RequestInit) => {
      signals.push(init?.signal);
      return Promise.resolve(new Response("{}"));
    }) as typeof fetch;
    const body = { model: "m", messages: [{ role: "user" as const, content: "x" }] };
    const timeout = vi.spyOn(AbortSignal, "timeout");
    await llmChatCompletion({ apiKey: "k", body, models: ["m"], fetchImpl });
    expect(timeout).toHaveBeenCalledWith(LLM_DEFAULT_TIMEOUT_MS);
    expect(signals[0]).toBeInstanceOf(AbortSignal);
    const own = new AbortController().signal;
    await llmChatCompletion({ apiKey: "k", body, models: ["m"], fetchImpl, signal: own });
    expect(signals[1]).toBe(own);
    timeout.mockRestore();
  });

  it("parse the model list from env text, falling back to the default", () => {
    expect(parseLlmChatModels(" a/x , ,b/y ")).toEqual(["a/x", "b/y"]);
    expect(parseLlmChatModels("")).toEqual([...LLM_CHAT_MODELS_DEFAULT]);
    expect(parseLlmChatModels(undefined)).toEqual([...LLM_CHAT_MODELS_DEFAULT]);
  });

  it("are configured the same way in the edge functions' twin", () => {
    expect(edge).toContain(`export const LLM_CHAT_URL = "${LLM_CHAT_URL}";`);
    expect(edge).toContain(
      `export const LLM_NO_REASONING = ${JSON.stringify(LLM_NO_REASONING)
        .replace(/"(\w+)":/g, "$1: ")
        .replace(/^\{/, "{ ")
        .replace(/\}$/, " }")} as const;`,
    );
    expect(edge).toContain(
      `export const LLM_PROVIDER_PREFS = ${JSON.stringify(LLM_PROVIDER_PREFS)
        .replace(/"(\w+)":/g, "$1: ")
        .replace(/^\{/, "{ ")
        .replace(/\}$/, " }")} as const;`,
    );
    expect(edge).toContain(
      `export const LLM_CHAT_MODELS_DEFAULT: readonly string[] = ${JSON.stringify(LLM_CHAT_MODELS_DEFAULT)};`,
    );
    expect(edge).toMatch(
      /reasoning: LLM_NO_REASONING,\s*provider: LLM_PROVIDER_PREFS,\s*messages: applySafety/,
    );
    expect(edge).toContain(
      `export const LLM_DEFAULT_TIMEOUT_MS = ${LLM_DEFAULT_TIMEOUT_MS / 1000}_000;`,
    );
    expect(edge).toContain("signal: signal ?? AbortSignal.timeout(LLM_DEFAULT_TIMEOUT_MS),");
    expect(edge).toContain("return normalizeLlmResponse(res);");
  });
});
