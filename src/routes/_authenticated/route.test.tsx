// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Outlet, isRedirect } from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";

const getSession = vi.fn();
const getUser = vi.fn();
const signOut = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getSession, getUser, signOut } },
}));
const invalidate = vi.fn();
vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    useRouter: () => ({ invalidate }),
    Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
      <a href={to} {...rest}>
        {children}
      </a>
    ),
  };
});
vi.mock("@/lib/error-reporting", () => ({ reportError: vi.fn() }));

/** getSession's answer for a signed-in user (the session kept in this browser). */
const signedIn = (user: unknown) => ({ data: { session: { user } }, error: null });
const signedOut = { data: { session: null }, error: null };

const { Route } = await import("./route");

beforeEach(() => {
  getSession.mockReset();
  getUser.mockReset();
  invalidate.mockReset();
  signOut.mockReset();
  localStorage.removeItem("lwa.under13.v1");
});

describe("_authenticated route guard", () => {
  it("throws a redirect to /auth when there is no signed-in user", async () => {
    getSession.mockResolvedValue(signedOut);
    try {
      await Route.options.beforeLoad!({} as never);
      expect.unreachable("beforeLoad should have thrown a redirect");
    } catch (err) {
      expect(isRedirect(err)).toBe(true);
      expect((err as { options: { to: string } }).options.to).toBe("/auth");
    }
  });

  it("keeps the page asked for as `next`, so an invite link survives sign-in (and opens the sign-up form)", async () => {
    getSession.mockResolvedValue(signedOut);
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

  it("throws a redirect when the server has refused the session (it is gone from this browser)", async () => {
    const refused = Object.assign(new Error("Invalid Refresh Token"), { name: "AuthApiError" });
    getSession.mockResolvedValue({ data: { session: null }, error: refused });
    await expect(Route.options.beforeLoad!({} as never)).rejects.toSatisfy((err: unknown) =>
      isRedirect(err),
    );
  });

  it("does not send a signed-in learner to sign-in when the network is down: the offline screen instead", async () => {
    const offline = Object.assign(new Error("Failed to fetch"), {
      name: "AuthRetryableFetchError",
    });
    getSession.mockResolvedValue({ data: { session: null }, error: offline });
    const caught = await Route.options.beforeLoad!({} as never).catch((e: unknown) => e);
    expect(isRedirect(caught)).toBe(false);
    const { isAuthOfflineError } = await import("@/lib/auth-offline");
    expect(isAuthOfflineError(caught)).toBe(true);

    getSession.mockRejectedValue(new TypeError("Failed to fetch"));
    const thrown = await Route.options.beforeLoad!({} as never).catch((e: unknown) => e);
    expect(isAuthOfflineError(thrown)).toBe(true);
  });

  it("never asks the auth server: the gate reads the session kept in this browser", async () => {
    getSession.mockResolvedValue(signedIn({ id: "u1" }));
    await Route.options.beforeLoad!({} as never);
    expect(getSession).toHaveBeenCalledTimes(1);
    expect(getUser).not.toHaveBeenCalled();
  });

  it("its error screen offers Try again, which re-runs the check, for an offline failure", async () => {
    const { AuthOfflineError } = await import("@/lib/auth-offline");
    const ErrorView = Route.options.errorComponent! as React.ComponentType<{
      error: unknown;
      reset: () => void;
    }>;
    const reset = vi.fn();
    render(<ErrorView error={new AuthOfflineError()} reset={reset} />);
    expect(screen.getByRole("heading", { name: "You're offline" })).toBeInTheDocument();
    screen.getByRole("button", { name: "Try again" }).click();
    expect(invalidate).toHaveBeenCalled();
    expect(reset).toHaveBeenCalled();
  });

  it("its error screen keeps a broken page inside the app, with Try again and Back to Learn", () => {
    const ErrorView = Route.options.errorComponent! as React.ComponentType<{
      error: unknown;
      reset: () => void;
    }>;
    render(<ErrorView error={new Error("boom")} reset={() => {}} />);
    expect(screen.getByRole("heading", { name: "This page didn't load" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to Learn" })).toHaveAttribute("href", "/learn");
  });

  it("signs out and sends to /auth (the kind stop) on a device that answered Under 13", async () => {
    localStorage.setItem("lwa.under13.v1", "1");
    getSession.mockResolvedValue(signedIn({ id: "u1" }));
    await expect(Route.options.beforeLoad!({} as never)).rejects.toSatisfy(
      (err: unknown) =>
        isRedirect(err) && (err as { options: { to: string } }).options.to === "/auth",
    );
    expect(signOut).toHaveBeenCalled();
  });

  it("sends a learner who never completed their profile from /learn to Complete your profile, once", async () => {
    getSession.mockResolvedValue(signedIn({ id: "u1", user_metadata: {} }));
    getUser.mockResolvedValue({ data: { user: { id: "u1", user_metadata: {} } }, error: null });
    await expect(
      Route.options.beforeLoad!({ location: { pathname: "/learn" } } as never),
    ).rejects.toSatisfy(
      (err: unknown) =>
        isRedirect(err) && (err as { options: { to: string } }).options.to === "/complete-profile",
    );
  });

  it("a session that still says 'profile needed' after it was completed elsewhere lets the learner in (no loop)", async () => {
    // The save went through the admin API (or another device): this browser's session is stale, the server is not.
    getSession.mockResolvedValue(signedIn({ id: "u1", user_metadata: {} }));
    const fresh = { learner_profile: { completedAt: "2026-11-18T00:00:00Z" } };
    getUser.mockResolvedValue({ data: { user: { id: "u1", user_metadata: fresh } }, error: null });
    await expect(
      Route.options.beforeLoad!({ location: { pathname: "/learn" } } as never),
    ).resolves.toBeTruthy();
    expect(getUser).toHaveBeenCalledTimes(1);
  });

  it("lets the learner in when the double check with the auth server fails, rather than looping", async () => {
    getSession.mockResolvedValue(signedIn({ id: "u1", user_metadata: {} }));
    getUser.mockResolvedValue({ data: { user: null }, error: new Error("503") });
    await expect(
      Route.options.beforeLoad!({ location: { pathname: "/learn" } } as never),
    ).resolves.toBeTruthy();
    getUser.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(
      Route.options.beforeLoad!({ location: { pathname: "/learn" } } as never),
    ).resolves.toBeTruthy();
  });

  it("does not ask the auth server when the session already shows the profile done", async () => {
    const done = { learner_profile: { completedAt: "2026-11-06T00:00:00Z" } };
    getSession.mockResolvedValue(signedIn({ id: "u1", user_metadata: done }));
    await Route.options.beforeLoad!({ location: { pathname: "/learn" } } as never);
    expect(getUser).not.toHaveBeenCalled();
  });

  it("does not redirect once completed or dismissed, nor away from any page but /learn", async () => {
    const done = { learner_profile: { dismissedAt: "2026-11-06T00:00:00Z" } };
    getSession.mockResolvedValue(signedIn({ id: "u1", user_metadata: done }));
    await expect(
      Route.options.beforeLoad!({ location: { pathname: "/learn" } } as never),
    ).resolves.toBeTruthy();
    getSession.mockResolvedValue(signedIn({ id: "u1", user_metadata: {} }));
    await expect(
      Route.options.beforeLoad!({ location: { pathname: "/lesson/a1-1" } } as never),
    ).resolves.toBeTruthy();
  });

  it("returns the user in context when signed in", async () => {
    const user = { id: "u1" };
    getSession.mockResolvedValue(signedIn(user));
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
    getSession.mockResolvedValue(signedIn({ id: "u1", user_metadata: {} }));
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
