import { describe, expect, it } from "vitest";

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
});
