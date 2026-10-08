import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { scenarioPrompt } from "@/data/scenarios";
import type { FakeSupabaseState } from "@/lib/__testutils__/fake-supabase";

/**
 * End to end through the real consent and quota helpers: only Supabase, RevenueCat and the vendors are faked.
 * Every gated endpoint refuses without consent before any vendor call or quota spend, succeeds with consent, and
 * is a plain pass-through when ENFORCE_AI_CONSENT=false (without reading the consent at all).
 */
const h = vi.hoisted(() => ({
  state: {
    userId: "user-1",
    consentAt: null as string | null,
    rpcCalls: [] as string[],
    consentReads: 0,
    consentReadError: false,
  },
}));
vi.mock("@supabase/supabase-js", async () => {
  const { makeFakeSupabase } = await import("@/lib/__testutils__/fake-supabase");
  return { createClient: () => makeFakeSupabase(h.state as FakeSupabaseState) };
});
vi.mock("@/integrations/supabase/client.server", async () => {
  const { makeFakeSupabase } = await import("@/lib/__testutils__/fake-supabase");
  return { supabaseAdmin: makeFakeSupabase(h.state as FakeSupabaseState) };
});
vi.mock("@/lib/revenuecat-entitlement", () => ({
  revenueCatConfigFromEnv: () => ({ secretApiKey: "sk_test" }),
  isProSubscriber: async () => true,
}));

type Handler = (opts: { request: Request }) => Promise<Response>;
const post = async (file: string): Promise<Handler> => {
  const mod = (await import(`./${file}.ts`)) as {
    Route: { options: { server?: { handlers?: unknown } } };
  };
  return (mod.Route.options.server!.handlers as { POST: Handler }).POST;
};

const PROMPT = scenarioPrompt("coffee", "en");
const LESSON_ID = "a1p25l1"; // first question is a translate question
const QUESTION_ID = "a1p25q0";

const json = (body: unknown) => ({
  method: "POST",
  headers: { Authorization: "Bearer tok", "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
function sttRequest() {
  const form = new FormData();
  form.append("file", new Blob(["x".repeat(600)], { type: "audio/mp4" }), "a.m4a");
  return new Request("https://x/api/stt", {
    method: "POST",
    headers: { Authorization: "Bearer tok" },
    body: form,
  });
}

const GATED: [string, () => Request][] = [
  [
    "chat",
    () =>
      new Request(
        "https://x/api/chat",
        json({ systemPrompt: PROMPT, messages: [{ role: "user", content: "hi" }] }),
      ),
  ],
  ["stt", sttRequest],
  ["tts", () => new Request("https://x/api/tts", json({ text: "Hello" }))],
  [
    "hector-respond",
    () => new Request("https://x/api/hector-respond", json({ text: "hola", language: "en" })),
  ],
  [
    "grade-translation",
    () =>
      new Request(
        "https://x/api/grade-translation",
        json({
          lessonId: LESSON_ID,
          questionId: QUESTION_ID,
          submission: "zzqx an unlisted wording",
          course: "en",
        }),
      ),
  ],
  [
    "define-word",
    () =>
      new Request(
        "https://x/api/define-word",
        json({ word: "tea", sentence: "I want tea.", course: "en" }),
      ),
  ],
  [
    "analyze-weaknesses",
    () =>
      new Request(
        "https://x/api/analyze-weaknesses",
        json({ messages: [{ role: "user", content: "I goed home" }] }),
      ),
  ],
];

const vendorCalls: string[] = [];
const realFetch = global.fetch;
// Cold module loads (the NLP library, the route graph) can pass the 5 s default on a loaded machine.
vi.setConfig({ testTimeout: 30_000 });

beforeEach(() => {
  h.state.consentAt = null;
  h.state.rpcCalls = [];
  h.state.consentReads = 0;
  h.state.consentReadError = false;
  vendorCalls.length = 0;
  delete process.env.ENFORCE_AI_CONSENT;
  Object.assign(process.env, {
    NVIDIA_API_KEY: "nv",
    DEEPGRAM_API_KEY: "dg",
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_PUBLISHABLE_KEY: "pk",
  });
  vi.spyOn(console, "info").mockImplementation(() => {});
  global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    vendorCalls.push(u);
    if (u.includes("deepgram.com/v1/listen")) {
      return Response.json({
        results: { channels: [{ alternatives: [{ transcript: "hello", confidence: 0.9 }] }] },
      });
    }
    if (u.includes("deepgram.com/v1/speak")) {
      return new Response(new Uint8Array(16), { headers: { "Content-Type": "audio/mpeg" } });
    }
    const sent = String(init?.body ?? "");
    const content = sent.includes("explain one word")
      ? JSON.stringify({
          meaning: "a hot drink",
          translation: "tea",
          wrong: ["a cold drink", "a fruit", "a car"],
        })
      : sent.includes("marking one answer")
        ? '{"correct": true, "reason": "Same meaning."}'
        : sent.includes("categories")
          ? "[]"
          : "Hello!";
    return Response.json({ choices: [{ message: { content } }] });
  }) as typeof fetch;
});
afterEach(() => {
  global.fetch = realFetch;
  vi.restoreAllMocks();
});

describe.each(GATED)("%s", (route, makeRequest) => {
  it("403 ai-consent-required without consent: no vendor call, no quota spent", async () => {
    const res = await (await post(route))({ request: makeRequest() });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "ai-consent-required" });
    expect(vendorCalls).toEqual([]);
    expect(h.state.rpcCalls).not.toContain("consume_ai_quota");
    expect(h.state.consentReads).toBe(1);
  });

  it("503 consent-check-failed, not 403, when the consent read itself fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    h.state.consentReadError = true;
    const res = await (await post(route))({ request: makeRequest() });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "consent-check-failed" });
    expect(vendorCalls).toEqual([]);
  });

  it("succeeds with consent", async () => {
    h.state.consentAt = "2026-10-09T10:00:00Z";
    const res = await (await post(route))({ request: makeRequest() });
    expect(res.status).toBe(200);
    expect(vendorCalls.length).toBeGreaterThan(0);
  });

  it("ENFORCE_AI_CONSENT=false bypasses the check without reading it", async () => {
    process.env.ENFORCE_AI_CONSENT = "false";
    const res = await (await post(route))({ request: makeRequest() });
    expect(res.status).toBe(200);
    expect(h.state.consentReads).toBe(0);
  });
});

describe("generate-practice (not gated)", () => {
  it("works without consent and never reads it", async () => {
    const res = await (
      await post("generate-practice")
    )({
      request: new Request(
        "https://x/api/generate-practice",
        json({ lessonId: "u1l1", course: "en" }),
      ),
    });
    expect(res.status).toBe(200);
    expect(h.state.consentReads).toBe(0);
  });
});
