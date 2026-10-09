import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { NVIDIA_NO_THINKING, nvidiaChatCompletion } from "./nvidia-chat.server";
import { SAFETY_PREAMBLE } from "./ai-safety";

// The default model reasons before answering unless the request turns it off. With it on, Practice replies took
// 17-88 s in production and capped calls (Save word, generated practice) timed out or came back cut off.
async function sentBody(body: Parameters<typeof nvidiaChatCompletion>[0]["body"]) {
  let sent: Record<string, unknown> = {};
  const fetchImpl = ((_u: string, init?: RequestInit) => {
    sent = JSON.parse(String(init?.body));
    return Promise.resolve(new Response("{}"));
  }) as typeof fetch;
  await nvidiaChatCompletion({ apiKey: "k", body, fetchImpl });
  return sent;
}

describe("NVIDIA requests", () => {
  it("turn the model's reasoning off on every call", async () => {
    const sent = await sentBody({ model: "m", messages: [{ role: "user", content: "x" }] });
    expect(sent.chat_template_kwargs).toEqual({ thinking: false, enable_thinking: false });
  });

  it("keep reasoning off when a caller sets another template argument", async () => {
    const sent = await sentBody({
      model: "m",
      messages: [{ role: "user", content: "x" }],
      chat_template_kwargs: { foo: 1 },
    });
    expect(sent.chat_template_kwargs).toEqual({ thinking: false, enable_thinking: false, foo: 1 });
  });

  it("keep the caller's own fields and the safety preamble", async () => {
    const sent = await sentBody({
      model: "m",
      messages: [{ role: "user", content: "x" }],
      max_tokens: 600,
    });
    expect(sent.max_tokens).toBe(600);
    expect(sent.model).toBe("m");
    expect((sent.messages as { content: string }[])[0].content).toBe(SAFETY_PREAMBLE);
  });

  it("are configured the same way in the edge functions' twin", () => {
    const edge = fs.readFileSync(
      path.resolve(__dirname, "../../supabase/functions/_shared/nvidia-chat.ts"),
      "utf8",
    );
    expect(NVIDIA_NO_THINKING).toEqual({ thinking: false, enable_thinking: false });
    expect(edge).toContain(
      "export const NVIDIA_NO_THINKING = { thinking: false, enable_thinking: false } as const;",
    );
    expect(edge).toContain("chat_template_kwargs: { ...NVIDIA_NO_THINKING, ...callerKwargs }");
    expect(edge).toMatch(/JSON\.stringify\(\{ \.\.\.withNoThinking\(body\), messages:/);
  });
});
