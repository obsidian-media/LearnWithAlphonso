// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { ConsoleFrame, currentKey, type ConsoleIdentity } from "./ConsoleFrame";
import { DEFAULT_SCOPES, SCOPES } from "../../lib/staff-scopes";

const owner: ConsoleIdentity = {
  me: { displayName: "Olga", role: "owner", scopes: [...SCOPES] },
  counts: { support: 3, reports: null },
};
const support: ConsoleIdentity = {
  me: { displayName: "Sam", role: "support", scopes: [...DEFAULT_SCOPES.support] },
  counts: {},
};

afterEach(() => cleanup());

function frame(over: Partial<Parameters<typeof ConsoleFrame>[0]> = {}) {
  let fire: (e: "in" | "out") => void = () => {};
  const unsubscribe = vi.fn();
  const props = {
    pathname: "/",
    loadIdentity: vi.fn(async () => owner),
    subscribeAuth: (cb: (e: "in" | "out") => void) => {
      fire = cb;
      return unsubscribe;
    },
    onSignOut: () => {},
    ...over,
  };
  const view = render(
    <ConsoleFrame {...props}>
      <p>page body</p>
    </ConsoleFrame>,
  );
  return { props, view, fire: (e: "in" | "out") => act(() => fire(e)), unsubscribe };
}
const rail = () => screen.queryByRole("navigation", { name: "Console" });

describe("the frame resolves who is signed in on the client", () => {
  it("renders the rail when the identity only becomes available AFTER the first render (the live bug)", async () => {
    let release: (i: ConsoleIdentity) => void = () => {};
    const loadIdentity = vi.fn(() => new Promise<ConsoleIdentity>((r) => (release = r)));
    frame({ loadIdentity });
    // first render: the page, a skeleton rail, and no real menu yet
    expect(screen.getByText("page body")).toBeTruthy();
    expect(document.querySelector("[data-rail-skeleton]")).toBeTruthy();
    expect(rail()).toBeNull();
    await act(async () => release(owner));
    expect(rail()).toBeTruthy();
    expect(screen.getByText("Olga")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /night mode|day mode/ })).toBeTruthy();
    expect(document.querySelector("[data-rail-skeleton]")).toBeNull();
    expect(screen.getByText("page body")).toBeTruthy();
    expect(loadIdentity).toHaveBeenCalledTimes(1);
  });

  it("shows only the groups the person's scopes allow", async () => {
    frame({ loadIdentity: vi.fn(async () => support) });
    await waitFor(() => expect(rail()).toBeTruthy());
    expect(screen.queryByRole("link", { name: "Staff" })).toBeNull();
    expect(screen.getByRole("link", { name: "Support" })).toBeTruthy();
  });

  it("someone who is not staff (or signed out) gets the bare page: no rail, no skeleton left behind", async () => {
    const loadIdentity = vi.fn(async () => Promise.reject(new Error("Unauthorized")));
    frame({ loadIdentity });
    await waitFor(() => expect(document.querySelector("[data-rail-skeleton]")).toBeNull());
    expect(rail()).toBeNull();
    expect(screen.getByText("page body")).toBeTruthy();
  });

  it("the sign-in page never asks and never shows a skeleton", () => {
    const { props } = frame({ pathname: "/signin" });
    expect(document.querySelector("[data-rail-skeleton]")).toBeNull();
    expect(rail()).toBeNull();
    expect(props.loadIdentity).not.toHaveBeenCalled();
  });

  it("asks again when the route changes while no one is known (sign in, then Home), and when the session signs in", async () => {
    const loadIdentity = vi
      .fn<() => Promise<ConsoleIdentity>>()
      .mockRejectedValueOnce(new Error("Unauthorized"))
      .mockResolvedValue(owner);
    const f = frame({ pathname: "/signin", loadIdentity });
    expect(loadIdentity).not.toHaveBeenCalled();
    f.view.rerender(
      <ConsoleFrame {...f.props} pathname="/">
        <p>page body</p>
      </ConsoleFrame>,
    );
    await waitFor(() => expect(loadIdentity).toHaveBeenCalledTimes(1)); // rejected: bare page
    await waitFor(() => expect(rail()).toBeNull());
    f.fire("in");
    await waitFor(() => expect(rail()).toBeTruthy());
  });

  it("a sign-out drops the rail; the subscription is released on unmount", async () => {
    const f = frame();
    await waitFor(() => expect(rail()).toBeTruthy());
    f.fire("out");
    await waitFor(() => expect(rail()).toBeNull());
    f.view.unmount();
    expect(f.unsubscribe).toHaveBeenCalled();
  });

  it("marks the current page in the rail, including the legacy pages", async () => {
    frame({ pathname: "/reports" });
    await waitFor(() => expect(rail()).toBeTruthy());
    expect(screen.getByRole("link", { name: /Reports/ }).getAttribute("aria-current")).toBe("page");
    expect(currentKey("/")).toBe("home");
    expect(currentKey("/users/abc")).toBe("users");
    expect(currentKey("/folder/1")).toBeUndefined();
  });
});

describe("the root puts every page inside the frame", () => {
  const root = readFileSync("admin/routes/__root.tsx", "utf8");
  it("wraps the Outlet (so every route, legacy ones included, gets the rail) and resolves identity on the client", () => {
    expect(root).toMatch(/<ConsoleFrame[\s\S]*<Outlet \/>[\s\S]*<\/ConsoleFrame>/);
    // No root loader: a server-side loader has no browser session, so it could never know who is signed in.
    expect(root).not.toMatch(/\bloader\s*:/);
    expect(root).toContain("loadIdentity");
  });

  it("no route renders its own copy of the shell or bypasses the root", () => {
    for (const f of [
      "index",
      "support",
      "users",
      "reports",
      "numbers",
      "staff",
      "audit",
      "health",
      "folders",
    ]) {
      expect(readFileSync(`admin/routes/${f}.tsx`, "utf8"), f).not.toContain("ConsoleShell");
    }
  });
});
