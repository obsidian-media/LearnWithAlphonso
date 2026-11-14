// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Outlet, isRedirect } from "@tanstack/react-router";

const getUser = vi.fn();
const signOut = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getUser, signOut } },
}));

const { Route } = await import("./route");

beforeEach(() => {
  getUser.mockReset();
  signOut.mockReset();
  localStorage.removeItem("lwa.under13.v1");
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

  it("keeps the page asked for as `next`, so an invite link survives sign-in (and opens the sign-up form)", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    const redirectFor = async (href: string) => {
      try {
        await Route.options.beforeLoad!({
          location: { href, pathname: href.split("?")[0] },
        } as never);
      } catch (err) {
        return (err as { options: { to: string; search?: unknown } }).options;
      }
      throw new Error("no redirect");
    };
    expect(await redirectFor("/invite/29d081151d67")).toMatchObject({
      to: "/auth",
      search: { next: "/invite/29d081151d67", mode: "signup" },
    });
    expect(await redirectFor("/profile/friends?x=1")).toMatchObject({
      to: "/auth",
      search: { next: "/profile/friends?x=1" },
    });
  });

  it("throws a redirect when Supabase returns an error", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: new Error("expired") });
    await expect(Route.options.beforeLoad!({} as never)).rejects.toSatisfy((err: unknown) =>
      isRedirect(err),
    );
  });

  it("signs out and sends to /auth (the kind stop) on a device that answered Under 13", async () => {
    localStorage.setItem("lwa.under13.v1", "1");
    getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    await expect(Route.options.beforeLoad!({} as never)).rejects.toSatisfy(
      (err: unknown) =>
        isRedirect(err) && (err as { options: { to: string } }).options.to === "/auth",
    );
    expect(signOut).toHaveBeenCalled();
  });

  it("sends a learner who never completed their profile from /learn to Complete your profile, once", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1", user_metadata: {} } }, error: null });
    await expect(
      Route.options.beforeLoad!({ location: { pathname: "/learn" } } as never),
    ).rejects.toSatisfy(
      (err: unknown) =>
        isRedirect(err) && (err as { options: { to: string } }).options.to === "/complete-profile",
    );
  });

  it("does not redirect once completed or dismissed, nor away from any page but /learn", async () => {
    const done = { learner_profile: { dismissedAt: "2026-11-06T00:00:00Z" } };
    getUser.mockResolvedValue({ data: { user: { id: "u1", user_metadata: done } }, error: null });
    await expect(
      Route.options.beforeLoad!({ location: { pathname: "/learn" } } as never),
    ).resolves.toBeTruthy();
    getUser.mockResolvedValue({ data: { user: { id: "u1", user_metadata: {} } }, error: null });
    await expect(
      Route.options.beforeLoad!({ location: { pathname: "/lesson/a1-1" } } as never),
    ).resolves.toBeTruthy();
  });

  it("returns the user in context when signed in", async () => {
    const user = { id: "u1" };
    getUser.mockResolvedValue({ data: { user }, error: null });
    const result = await Route.options.beforeLoad!({} as never);
    expect(result).toEqual({ user });
  });

  it("renders an Outlet as its component", () => {
    const element = Route.options.component!({} as never) as React.ReactElement<{
      children: React.ReactElement[];
    }>;
    // The layout is a fragment now, not a bare Outlet: the podcast audio
    // element is mounted BESIDE the Outlet so playback survives a route
    // change (a page-owned element unmounts on navigation). What this
    // test guards is that the layout still renders its children.
    const children = element.props.children;
    expect(children.some((child) => child.type === Outlet)).toBe(true);
  });

  it("mounts the persistent podcast audio element beside the Outlet", () => {
    const element = Route.options.component!({} as never) as React.ReactElement<{
      children: React.ReactElement[];
    }>;
    const types = element.props.children.map((child) =>
      typeof child.type === "function" ? child.type.name : child.type,
    );
    expect(types).toContain("PodcastAudio");
  });

  // Last on purpose: the skip is module state that lasts the visit.
  it("a Not now whose save failed still lets the learner into /learn for the rest of the visit", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1", user_metadata: {} } }, error: null });
    const { skipCompleteProfileThisVisit } = await import("@/lib/first-run");
    skipCompleteProfileThisVisit();
    await expect(
      Route.options.beforeLoad!({ location: { pathname: "/learn" } } as never),
    ).resolves.toBeTruthy();
  });

  it("mounts the one-time name prompt beside the Outlet", () => {
    const element = Route.options.component!({} as never) as React.ReactElement<{
      children: React.ReactElement[];
    }>;
    const types = element.props.children.map((child) =>
      typeof child.type === "function" ? child.type.name : child.type,
    );
    expect(types).toContain("NamePrompt");
  });
});
