import { beforeEach, describe, expect, it, vi } from "vitest";

const readMonthlyCap = vi.fn();
const verifyAuth = vi.fn();
vi.mock("@/lib/ai-quota.server", () => ({ verifyAuth }));
vi.mock("@/lib/ai-monthly-cap.server", () => ({ readMonthlyCap }));

const { Route } = await import("./ai-usage");
const GET = (
  Route.options.server!.handlers as unknown as {
    GET: (a: { request: Request }) => Promise<Response>;
  }
).GET;
const call = () => GET({ request: new Request("https://x.test/api/ai-usage") });

beforeEach(() => {
  readMonthlyCap.mockReset();
  verifyAuth.mockReset();
});

describe("GET /api/ai-usage", () => {
  it("401 without a session", async () => {
    verifyAuth.mockResolvedValue({
      ok: false,
      status: 401,
      message: "Sign in to use AI features.",
    });
    expect((await call()).status).toBe(401);
  });
  it("tells percent and reset, never a dollar amount", async () => {
    verifyAuth.mockResolvedValue({ ok: true, supabase: {}, userId: "u" });
    readMonthlyCap.mockResolvedValue({
      status: { state: "warn", percentUsed: 85, tier: "free" },
      resetsAt: "2026-12-01T00:00:00.000Z",
    });
    const body = await (await call()).json();
    expect(body).toEqual({ state: "warn", percentUsed: 85, resetsAt: "2026-12-01T00:00:00.000Z" });
  });
  it("unknown when the cost cannot be read", async () => {
    verifyAuth.mockResolvedValue({ ok: true, supabase: {}, userId: "u" });
    readMonthlyCap.mockResolvedValue({ status: null, resetsAt: "2026-12-01T00:00:00.000Z" });
    expect((await (await call()).json()).state).toBe("unknown");
  });
});
