import { beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.fn();
vi.mock("./client", () => ({ supabase: { auth: { getSession } } }));

const { attachSupabaseAuth } = await import("./auth-attacher");
const client = attachSupabaseAuth.options.client as (opts: {
  next: (ctx: unknown) => unknown;
}) => unknown;

const next = vi.fn((ctx) => ctx);

beforeEach(() => {
  getSession.mockReset();
  next.mockClear();
});

describe("attachSupabaseAuth", () => {
  it("attaches a Bearer header when a session is present", async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: "tok-123" } } });
    await client({ next });
    expect(next).toHaveBeenCalledWith({ headers: { Authorization: "Bearer tok-123" } });
  });

  it("sends no headers when there is no active session", async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    await client({ next });
    expect(next).toHaveBeenCalledWith({ headers: {} });
  });
});
