import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  verify: vi.fn(),
  off: false,
  offReadError: false,
  offReads: 0,
}));

vi.mock("@/lib/ai-quota.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ai-quota.server")>()),
  verifyAuth: h.verify,
}));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: (table: string) => ({
      select: () => ({
        eq: (_c: string, userId: string) => ({
          maybeSingle: async () => {
            if (table === "rehearsals_off") h.offReads += 1;
            return {
              data:
                table === "rehearsals_off" && h.off && userId === "u-off"
                  ? { user_id: userId }
                  : null,
              error: h.offReadError ? { message: "down" } : null,
            };
          },
        }),
      }),
    }),
  },
}));

const { Route } = await import("./app-config");
const { DAILY_LIMITS } = await import("@/lib/ai-quota.server");
const handler = (
  Route.options.server!.handlers as unknown as {
    GET: (o: { request: Request }) => Promise<Response>;
  }
).GET;
const GET = (headers: Record<string, string> = {}) =>
  handler({ request: new Request("https://x/api/app-config", { headers }) });

beforeEach(() => {
  vi.clearAllMocks();
  h.off = false;
  h.offReadError = false;
  h.offReads = 0;
});

describe("GET /api/app-config", () => {
  it("tells the clients the Hector daily limit the server enforces, not a copy of it", async () => {
    const body = (await (await GET()).json()) as { limits: { hectorDaily: number } };
    expect(body.limits.hectorDaily).toBe(DAILY_LIMITS.hector);
  });
  it("still carries the update gate", async () => {
    const body = (await (await GET()).json()) as { ios: unknown; android: unknown };
    expect(body.ios).toBeDefined();
    expect(body.android).toBeDefined();
  });
  describe("features.rehearsals (native reads the server flag here)", () => {
    afterEach(() => vi.unstubAllEnvs());
    const read = async (headers: Record<string, string> = {}) =>
      ((await (await GET(headers)).json()) as { features: { rehearsals: boolean } }).features
        .rehearsals;
    it("is false unless REHEARSALS_ENABLED is exactly 'true'", async () => {
      expect(await read()).toBe(false);
      vi.stubEnv("REHEARSALS_ENABLED", "1");
      expect(await read()).toBe(false);
    });
    it("is true when the flag is on", async () => {
      vi.stubEnv("REHEARSALS_ENABLED", "true");
      expect(await read()).toBe(true);
    });

    describe("per account, when the caller sends its token", () => {
      const AUTH = { Authorization: "Bearer t" };
      beforeEach(() => vi.stubEnv("REHEARSALS_ENABLED", "true"));

      it("is true for an account that has not been switched off", async () => {
        h.verify.mockResolvedValue({ ok: true, userId: "u-on", supabase: {} });
        h.off = true; // somebody else is off
        expect(await read(AUTH)).toBe(true);
      });

      it("is false for an account switched off, while everyone else still gets true", async () => {
        h.off = true;
        h.verify.mockResolvedValue({ ok: true, userId: "u-off", supabase: {} });
        expect(await read(AUTH)).toBe(false);
        h.verify.mockResolvedValue({ ok: true, userId: "u-on", supabase: {} });
        expect(await read(AUTH)).toBe(true);
        expect(await read()).toBe(true);
      });

      it("fails closed when the switch cannot be read", async () => {
        h.verify.mockResolvedValue({ ok: true, userId: "u-on", supabase: {} });
        h.offReadError = true;
        expect(await read(AUTH)).toBe(false);
      });

      it("an unverifiable token gets the anonymous (global) answer", async () => {
        h.verify.mockResolvedValue({ ok: false, status: 401, message: "no" });
        expect(await read(AUTH)).toBe(true);
        h.verify.mockRejectedValue(new Error("down"));
        expect(await read(AUTH)).toBe(true);
      });

      it("never reads the account switch while the global flag is off, or for an anonymous caller", async () => {
        expect(await read()).toBe(true);
        vi.stubEnv("REHEARSALS_ENABLED", "false");
        h.verify.mockResolvedValue({ ok: true, userId: "u-on", supabase: {} });
        expect(await read(AUTH)).toBe(false);
        expect(h.offReads).toBe(0);
      });

      it("a per-account answer is never cached or shared; the anonymous one still is", async () => {
        h.verify.mockResolvedValue({ ok: true, userId: "u-off", supabase: {} });
        const personal = await GET(AUTH);
        expect(personal.headers.get("Cache-Control")).toBe("private, no-store");
        const anon = await GET();
        expect(anon.headers.get("Cache-Control")).toBe("public, max-age=300");
        expect(personal.headers.get("Vary")).toBe("Authorization");
        expect(anon.headers.get("Vary")).toBe("Authorization");
      });
    });
  });
});
