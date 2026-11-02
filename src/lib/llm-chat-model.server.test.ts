import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  resolveLlmApiKey,
  resolveLlmChatModel,
  resolveLlmChatModels,
} from "./llm-chat-model.server";

afterEach(() => vi.unstubAllEnvs());

describe("AI provider configuration", () => {
  it("takes the key from OPENROUTER_API_KEY only", () => {
    vi.stubEnv("NVIDIA_API_KEY", "old-nvidia");
    vi.stubEnv("OPENROUTER_API_KEY", "or-key");
    expect(resolveLlmApiKey()).toBe("or-key");
    vi.stubEnv("OPENROUTER_API_KEY", "");
    expect(resolveLlmApiKey()).toBeUndefined();
  });

  it("reads the ordered model list from LLM_CHAT_MODELS", () => {
    vi.stubEnv("LLM_CHAT_MODELS", "a/x, b/y");
    expect(resolveLlmChatModels()).toEqual(["a/x", "b/y"]);
    expect(resolveLlmChatModel()).toBe("a/x");
  });

  it("is mirrored by the edge twin (same env names)", () => {
    const edge = fs.readFileSync(
      path.resolve(__dirname, "../../supabase/functions/_shared/llm-chat.ts"),
      "utf8",
    );
    expect(edge).toContain('Deno.env.get("OPENROUTER_API_KEY")');
    expect(edge).toContain('Deno.env.get("LLM_CHAT_MODELS")');
  });
});
