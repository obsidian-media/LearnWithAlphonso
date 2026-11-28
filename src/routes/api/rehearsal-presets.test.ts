import { beforeEach, describe, expect, it, vi } from "vitest";
import { PRESET_IDS } from "@/lib/rehearsal-presets";

const h = vi.hoisted(() => ({ verify: vi.fn(), off: false }));
vi.mock("@/lib/ai-quota.server", () => ({ verifyAuth: h.verify }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: () => {
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq"]) q[m] = () => q;
      q.maybeSingle = async () => ({ data: h.off ? { user_id: "u1" } : null, error: null });
      return q;
    },
  },
}));

const { Route } = await import("./rehearsal-presets");
const { GET } = Route.options.server!.handlers as unknown as {
  GET: (o: { request: Request }) => Promise<Response>;
};
const get = (qs: string) =>
  GET({
    request: new Request(`https://x/api/rehearsal-presets${qs}`, {
      headers: { Authorization: "Bearer t" },
    }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  process.env.REHEARSALS_ENABLED = "true";
  h.off = false;
  h.verify.mockResolvedValue({ ok: true, userId: "u1", supabase: {} });
});

describe("GET /api/rehearsal-presets", () => {
  it("returns the eight presets in picker order, with stages and key phrases", async () => {
    const res = await get("?course=fr");
    expect(res.status).toBe(200);
    const { presets } = (await res.json()) as {
      presets: {
        id: string;
        stages: { key: string; goal: string }[];
        keyPhrases: { text: string; meaning: string }[];
      }[];
    };
    expect(presets.map((p) => p.id)).toEqual([...PRESET_IDS]);
    for (const p of presets) {
      expect(Object.keys(p).sort()).toEqual(
        ["blurb", "counterpart", "eventKind", "id", "keyPhrases", "stages", "title"].sort(),
      );
      expect(p.stages.map((s) => s.key)).toEqual(["warmup", "conversation", "hard_moments"]);
      expect(p.keyPhrases.length).toBeGreaterThanOrEqual(6);
    }
    expect(presets[2]!.keyPhrases[0]!.text).toBe("Je voudrais prendre rendez-vous.");
  });

  it("a bad or missing course is 400", async () => {
    expect((await get("")).status).toBe(400);
    expect((await get("?course=xx")).status).toBe(400);
  });

  it("no session is the verifier's status", async () => {
    h.verify.mockResolvedValue({ ok: false, status: 401, message: "no" });
    expect((await get("?course=en")).status).toBe(401);
  });

  it("is not_enabled (404) when rehearsals are off globally", async () => {
    process.env.REHEARSALS_ENABLED = "false";
    const res = await get("?course=en");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_enabled" });
  });

  it("is not_enabled (404) when the account is switched off", async () => {
    h.off = true;
    const res = await get("?course=en");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_enabled" });
  });
});
