import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { scenarioPrompt } from "@/data/scenarios";

/** Alphonso's Pro calls are primed with the learner's memory (labels only); free learners' calls are not. */
const h = vi.hoisted(() => ({ memory: [] as { memory_key: string }[], pro: "active" as string }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    rpc: async (_f: string, a: { _texts?: string[] }) => ({
      data: (a._texts ?? []).map(() => false),
      error: null,
    }),
    from: () => {
      const q: Record<string, unknown> = {};
      for (const n of ["select", "eq", "order"]) q[n] = () => q;
      q.limit = async () => ({ data: h.memory });
      return q;
    },
  },
}));
vi.mock("@/lib/ai-consent.server", () => ({
  authorizeAiRequest: async () => ({ ok: true, userId: "u1", supabase: {} }),
}));
vi.mock("@/lib/revenuecat-entitlement", () => ({
  revenueCatConfigFromEnv: () => ({ secretApiKey: "sk" }),
  getProEntitlementStatus: async () => h.pro,
}));

const { Route } = await import("./chat");
const POST = (
  Route.options.server!.handlers as unknown as {
    POST: (o: { request: Request }) => Promise<Response>;
  }
).POST;
const PROMPT = scenarioPrompt("coffee", "es");
const realFetch = global.fetch;

async function sentMessages() {
  global.fetch = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ choices: [{ message: { content: "Hola" } }] }), {
      status: 200,
    }),
  );
  await POST({
    request: new Request("https://x/api/chat", {
      method: "POST",
      body: JSON.stringify({ systemPrompt: PROMPT, messages: [{ role: "user", content: "hola" }] }),
    }),
  });
  const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
  return JSON.parse(init.body as string).messages as { role: string; content: string }[];
}

beforeEach(() => {
  process.env.OPENROUTER_API_KEY = "k";
  h.memory = [{ memory_key: "ser-estar" }];
  h.pro = "active";
});
afterEach(() => {
  global.fetch = realFetch;
});

describe("priming Alphonso's calls from memory", () => {
  it("a Pro learner with memory gets one leading background turn naming the topic", async () => {
    const m = await sentMessages();
    expect(m).toHaveLength(3);
    expect(m[1]!.role).toBe("user");
    expect(m[1]!.content).toContain("Ser or estar");
    expect(m[2]!.content).toBe("hola");
  });
  it("a learner who is not Pro gets none, even with stored lines", async () => {
    h.pro = "inactive";
    expect(await sentMessages()).toHaveLength(2);
  });
  it("a learner with no memory gets none", async () => {
    h.memory = [];
    expect(await sentMessages()).toHaveLength(2);
  });
});
