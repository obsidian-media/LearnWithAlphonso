import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SCENARIOS } from "@/data/scenarios";
import { buildHectorGreeting } from "@/lib/hector-greeting";

const authorizeAiRequest = vi.fn();
vi.mock("@/lib/ai-consent.server", () => ({ authorizeAiRequest }));
const recordAiCost = vi.hoisted(() => vi.fn(async (_entry: Record<string, unknown>) => {}));
vi.mock("@/lib/ai-cost-log.server", () => ({
  recordAiCost,
  scheduleBackground: (p: Promise<unknown>) => void p.catch(() => {}),
}));
const store = new Map<string, Uint8Array>();
const writeCachedSpeech = vi.hoisted(() => vi.fn());
vi.mock("@/lib/tts-cache.server", () => ({
  readCachedSpeech: async (key: string) => store.get(key) ?? null,
  writeCachedSpeech: async (key: string, audio: Uint8Array) => {
    writeCachedSpeech(key);
    store.set(key, audio);
  },
}));

const { Route } = await import("./tts");
const handler = (
  Route.options.server!.handlers as unknown as {
    POST: (opts: { request: Request }) => Promise<Response>;
  }
).POST;
const req = (body: unknown) =>
  new Request("https://example.com/api/tts", { method: "POST", body: JSON.stringify(body) });

const AUDIO = new Uint8Array([1, 2, 3, 4]);
const originalFetch = global.fetch;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  store.clear();
  recordAiCost.mockClear();
  writeCachedSpeech.mockClear();
  authorizeAiRequest.mockReset();
  authorizeAiRequest.mockResolvedValue({ ok: true, userId: "user-1", supabase: {} });
  process.env.DEEPGRAM_API_KEY = "k";
  fetchMock = vi.fn(async () => new Response(AUDIO, { headers: { "Content-Type": "audio/mpeg" } }));
  global.fetch = fetchMock as unknown as typeof fetch;
});
afterEach(() => {
  global.fetch = originalFetch;
});

const flush = () => new Promise((r) => setTimeout(r, 0));
const bytes = async (res: Response) => new Uint8Array(await res.arrayBuffer());

describe("/api/tts speech cache and cost log", () => {
  const opener = SCENARIOS[0]!.opener.en;

  it("a fixed line: the first request pays the vendor and stores the audio, the second is served from the store", async () => {
    const first = await handler({ request: req({ text: opener, course: "en" }) });
    expect(first.status).toBe(200);
    expect(await bytes(first)).toEqual(AUDIO);
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(store.size).toBe(1);

    const second = await handler({ request: req({ text: opener, course: "en" }) });
    expect(await bytes(second)).toEqual(AUDIO);
    expect(second.headers.get("Content-Type")).toBe("audio/mpeg");
    expect(second.headers.get("Cache-Control")).toBe("no-store");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const entries = recordAiCost.mock.calls.map((c) => c[0]!);
    expect(entries[0]).toMatchObject({ kind: "tts", cacheHit: false, ttsChars: opener.length });
    expect(entries[1]).toMatchObject({ kind: "tts", cacheHit: true, costMicroUsd: 0, ttsChars: 0 });
  });

  it("a different voice for the same line is a different entry", async () => {
    await handler({ request: req({ text: opener, course: "en" }) });
    await handler({ request: req({ text: opener, course: "en", voice: "aura-2-hermes-en" }) });
    await flush();
    expect(store.size).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("user-specific text is never stored and always goes to the vendor", async () => {
    const named = buildHectorGreeting({ course: "en", cefr: "A1", name: "Maria", weakSpot: null });
    for (const text of [named, "Great job, Maria! Try saying it again.", `${opener} Maria`]) {
      await handler({ request: req({ text, course: "en" }) });
      await handler({ request: req({ text, course: "en" }) });
    }
    await flush();
    expect(store.size).toBe(0);
    expect(writeCachedSpeech).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  it("a vendor failure stores nothing and logs no cost", async () => {
    fetchMock.mockResolvedValueOnce(new Response("nope", { status: 500 }));
    const res = await handler({ request: req({ text: opener, course: "en" }) });
    expect(res.status).toBeGreaterThanOrEqual(500);
    await flush();
    expect(store.size).toBe(0);
    expect(recordAiCost).not.toHaveBeenCalled();
  });

  it("an ordinary line is logged with its characters and the answer is unchanged", async () => {
    const res = await handler({ request: req({ text: "Nice one!", course: "en" }) });
    expect(await bytes(res)).toEqual(AUDIO);
    expect(recordAiCost.mock.calls[0]![0]).toMatchObject({
      userId: "user-1",
      vendor: "deepgram",
      ttsChars: 9,
      cacheHit: false,
    });
  });
});
