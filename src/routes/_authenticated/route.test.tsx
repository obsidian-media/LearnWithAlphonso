// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Outlet, isRedirect } from "@tanstack/react-router";

const getUser = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getUser } },
}));

const { Route } = await import("./route");

beforeEach(() => {
  getUser.mockReset();
});

describe("_authenticated route guard", () => {
  it("throws a redirect to /auth when there is no signed-in user", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    try {
      await Route.options.beforeLoad!({} as never);
      expect.unreachable("beforeLoad should have thrown a redirect");
    } catch (err) {
      expect(isRedirect(err)).toBe(true);
      expect((err as { options: { to: string } }).options.to).toBe("/auth");
    }
  });

  it("throws a redirect when Supabase returns an error", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: new Error("expired") });
    await expect(Route.options.beforeLoad!({} as never)).rejects.toSatisfy((err: unknown) =>
      isRedirect(err),
    );
  });

  it("returns the user in context when signed in", async () => {
    const user = { id: "u1" };
    getUser.mockResolvedValue({ data: { user }, error: null });
    const result = await Route.options.beforeLoad!({} as never);
    expect(result).toEqual({ user });
  });

  it("renders an Outlet as its component", () => {
    const element = Route.options.component!({} as never) as React.ReactElement;
    expect(element.type).toBe(Outlet);
  });
});
