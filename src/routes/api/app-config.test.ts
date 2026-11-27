import { afterEach, describe, expect, it, vi } from "vitest";

const { Route } = await import("./app-config");
const { DAILY_LIMITS } = await import("@/lib/ai-quota.server");
const GET = (Route.options.server!.handlers as unknown as { GET: () => Promise<Response> }).GET;

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
    const read = async () =>
      ((await (await GET()).json()) as { features: { rehearsals: boolean } }).features.rehearsals;
    it("is false unless REHEARSALS_ENABLED is exactly 'true'", async () => {
      expect(await read()).toBe(false);
      vi.stubEnv("REHEARSALS_ENABLED", "1");
      expect(await read()).toBe(false);
    });
    it("is true when the flag is on", async () => {
      vi.stubEnv("REHEARSALS_ENABLED", "true");
      expect(await read()).toBe(true);
    });
  });
});
