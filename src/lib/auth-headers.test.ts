import { describe, expect, it, vi } from "vitest";

const getSession = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getSession } },
}));

const { authHeaders } = await import("./auth-headers");

describe("authHeaders", () => {
  it("returns a bearer header when a session with an access token exists", async () => {
    getSession.mockResolvedValueOnce({ data: { session: { access_token: "tok-123" } } });
    expect(await authHeaders()).toEqual({ Authorization: "Bearer tok-123" });
  });

  it("returns an empty object when there is no session", async () => {
    getSession.mockResolvedValueOnce({ data: { session: null } });
    expect(await authHeaders()).toEqual({});
  });

  it("returns an empty object when the session has no access token", async () => {
    getSession.mockResolvedValueOnce({ data: { session: {} } });
    expect(await authHeaders()).toEqual({});
  });
});
