import { describe, expect, it } from "vitest";
import {
  buildHectorMessages,
  deepgramVoiceForLanguage,
  shapeTutorReply,
  HECTOR_SYSTEM_PROMPT,
} from "./hector-conversation";

describe("buildHectorMessages", () => {
  it("prepends the Hector system prompt and appends the current turn", () => {
    const msgs = buildHectorMessages(
      [
        { role: "user", content: "Hola" },
        { role: "assistant", content: "¡Hola!" },
      ],
      "¿Cómo estás?",
    );
    expect(msgs[0]).toEqual({ role: "system", content: HECTOR_SYSTEM_PROMPT });
    expect(msgs[msgs.length - 1]).toEqual({ role: "user", content: "¿Cómo estás?" });
    expect(msgs).toHaveLength(4);
  });

  it("keeps the client's priming history entry (CEFR/weakness context)", () => {
    // TutorMemoryContext ships the learner's level as a leading system-ish
    // entry; it must survive into the model call or Hector loses continuity.
    const priming = { role: "user", content: "(context) learner is B2, weak on articles" };
    const msgs = buildHectorMessages([priming], "hi");
    expect(msgs.some((m) => m.content.includes("B2, weak on articles"))).toBe(true);
  });

  it("drops malformed history rather than forwarding a bad role upstream", () => {
    // A single unknown role fails the whole NVIDIA call, so filter, don't trust.
    const msgs = buildHectorMessages(
      [
        { role: "tool", content: "x" },
        { role: "assistant", content: "" }, // empty content dropped
        { role: "user", content: "keep me" },
      ],
      "now",
    );
    const contents = msgs.map((m) => m.content);
    expect(contents).toContain("keep me");
    expect(contents).not.toContain("x");
    expect(msgs.every((m) => ["system", "user", "assistant"].includes(m.role))).toBe(true);
  });

  it("handles a non-array history without throwing", () => {
    // The body is untrusted client JSON.
    expect(() => buildHectorMessages(undefined as never, "hi")).not.toThrow();
  });
});

describe("deepgramVoiceForLanguage", () => {
  it("maps known languages and falls back to the English default", () => {
    expect(deepgramVoiceForLanguage("en")).toBe("aura-2-thalia-en");
    expect(deepgramVoiceForLanguage("es")).toContain("es");
    expect(deepgramVoiceForLanguage("qq")).toBe("aura-2-thalia-en");
    expect(deepgramVoiceForLanguage("")).toBe("aura-2-thalia-en");
  });
});

describe("shapeTutorReply", () => {
  it("produces the exact snake_case TutorReply the iOS client decodes", () => {
    const r = shapeTutorReply({
      requestId: "req1",
      sessionId: "sess1",
      agent: "tutor",
      reply: "Bonjour !",
      audioBase64: "AAAA",
      ttsModel: "aura-2-thalia-en",
      language: "fr",
      llmMs: 120.7,
      ttsMs: 80.2,
    });
    // Keys must match TutorReply.CodingKeys exactly, or the client 500s on decode.
    expect(Object.keys(r).sort()).toEqual(
      [
        "agent",
        "audio_base64",
        "language",
        "reply",
        "request_id",
        "session_id",
        "state",
        "timings_ms",
        "tts_model",
        "tts_provider",
      ].sort(),
    );
    expect(r.tts_provider).toBe("deepgram");
    expect(r.state).toBe("ok");
    expect(r.timings_ms).toEqual({ llm: 121, tts: 80, total: 201 });
  });
});
