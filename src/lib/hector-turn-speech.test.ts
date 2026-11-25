import { describe, expect, it, vi } from "vitest";
import { fetchTurnSpeech } from "./hector-turn-speech";

const headers = async () => ({ Authorization: "Bearer t" });

describe("fetchTurnSpeech", () => {
  it("starts one /api/tts request per piece at once, with the token and the part, sending the whole reply", async () => {
    const fetchImpl = vi.fn(async () => new Response(new Blob(["mp3"]), { status: 200 }));
    const parts = fetchTurnSpeech({
      token: "123.abc",
      reply: "Very good, you did it! Now tell me what you ate.",
      course: "en",
      voice: "aura-2-atlas-en",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      headers,
    });
    expect(parts.map((p) => p.text)).toEqual([
      "Very good, you did it!",
      "Now tell me what you ate.",
    ]);
    await Promise.all(parts.map((p) => p.clip));
    const calls = fetchImpl.mock.calls as unknown as [string, RequestInit][];
    expect(calls.map((c) => c[0])).toEqual([
      "/api/tts?turn=123.abc&part=0",
      "/api/tts?turn=123.abc&part=1",
    ]);
    expect(JSON.parse(String(calls[0]![1].body))).toEqual({
      text: "Very good, you did it! Now tell me what you ate.",
      course: "en",
      voice: "aura-2-atlas-en",
      character: "hector",
    });
  });

  it("a refused or failed piece resolves to null instead of rejecting (the device voice reads it)", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response("no", { status: 403 }))
      .mockRejectedValueOnce(new Error("offline"));
    const parts = fetchTurnSpeech({
      token: "t",
      reply: "One sentence here! Another sentence here.",
      course: "en",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      headers,
    });
    expect(await Promise.all(parts.map((p) => p.clip))).toEqual([null, null]);
  });
});
