// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConsoleShell, pipFor, type ShellMe } from "./ConsoleShell";
import { DEFAULT_SCOPES, SCOPES } from "../../lib/staff-scopes";

const owner: ShellMe = { displayName: "Olga Owner", role: "owner", scopes: [...SCOPES] };
const support: ShellMe = {
  displayName: "Sam Support",
  role: "support",
  scopes: [...DEFAULT_SCOPES.support],
};

const shell = (me: ShellMe, extra: Partial<Parameters<typeof ConsoleShell>[0]> = {}) =>
  render(
    <ConsoleShell me={me} onSignOut={() => {}} {...extra}>
      <p>page body</p>
    </ConsoleShell>,
  );

beforeEach(() => {
  delete document.documentElement.dataset.dsMode;
  delete document.documentElement.dataset.consoleTheme;
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const rail = () => within(screen.getByRole("navigation", { name: "Console" }));

describe("the rail is role-scoped", () => {
  it("an owner sees Home and every group", () => {
    shell(owner);
    for (const name of ["Home", "Support", "Reports", "Users", "Numbers", "Podcasts", "Staff"]) {
      expect(rail().getByRole("link", { name })).toBeTruthy();
    }
    expect(rail().getByRole("link", { name: "Action record" })).toBeTruthy();
    expect(rail().getByRole("link", { name: "System health" })).toBeTruthy();
    expect(screen.getByText("Operate")).toBeTruthy();
    expect(screen.getByText("Content")).toBeTruthy();
    expect(screen.getByText("System")).toBeTruthy();
  });

  it("a support person sees neither the Content nor the System group, nor Numbers, Staff or Audit", () => {
    shell(support);
    expect(rail().getByRole("link", { name: "Support" })).toBeTruthy();
    expect(rail().getByRole("link", { name: "Users" })).toBeTruthy();
    for (const name of ["Numbers", "Podcasts", "Staff", "Action record", "System health"]) {
      expect(rail().queryByRole("link", { name })).toBeNull();
    }
    expect(screen.queryByText("Content")).toBeNull();
    expect(screen.queryByText("System")).toBeNull();
  });

  it("every old page's link is still in the rail (nothing became unreachable)", () => {
    shell(owner);
    const hrefs = rail()
      .getAllByRole("link")
      .map((a) => a.getAttribute("href"));
    for (const to of [
      "/",
      "/support",
      "/reports",
      "/users",
      "/numbers",
      "/folders",
      "/staff",
      "/audit",
      "/health",
    ]) {
      expect(hrefs).toContain(to);
    }
  });

  it("marks the current page and shows the person and Sign out", async () => {
    const onSignOut = vi.fn();
    shell(support, { current: "support", onSignOut });
    expect(rail().getByRole("link", { name: "Support" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByText("Sam Support")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });
});

describe("the pips are real counts", () => {
  it("shows the counts it was given, on the right items", () => {
    shell(owner, { counts: { support: 4, reports: 2 } });
    const pips = [...document.querySelectorAll("[data-pip]")].map((p) => p.textContent?.trim());
    expect(pips).toEqual(["4 waiting", "2 waiting"]);
    expect(rail().getByRole("link", { name: /Support/ }).textContent).toContain("4");
  });

  it("no counts, an unreadable count (null) or a real zero shows no pip, never a 0", () => {
    shell(owner, { counts: { support: null, reports: 0 } });
    expect(document.querySelectorAll("[data-pip]").length).toBe(0);
    cleanup();
    shell(owner, { counts: null });
    expect(document.querySelectorAll("[data-pip]").length).toBe(0);
  });

  it("a count the person's role cannot see never shows, even if one is passed", () => {
    // support has no Numbers/Staff item to hang a pip on; reports.manage is in the default support scopes
    expect(pipFor("numbers", { support: 9, reports: 9 })).toBeNull();
    expect(pipFor("support", { support: 9 })).toBe(9);
    expect(pipFor("reports", { support: 9 })).toBeNull();
  });
});

describe("the theme toggle", () => {
  it("starts from the theme the page already carries and flips both ways, remembering it", async () => {
    document.documentElement.dataset.consoleTheme = "day";
    shell(owner);
    await userEvent.click(screen.getByRole("button", { name: "Switch to night mode" }));
    expect(document.documentElement.dataset.dsMode).toBe("night");
    expect(localStorage.getItem("consoleTheme")).toBe("night");
    await userEvent.click(screen.getByRole("button", { name: "Switch to day mode" }));
    expect(document.documentElement.dataset.dsMode).toBeUndefined();
    expect(localStorage.getItem("consoleTheme")).toBe("day");
  });

  it("when the page already follows the OS into night, the button offers day", () => {
    document.documentElement.dataset.consoleTheme = "night";
    shell(owner);
    expect(screen.getByRole("button", { name: "Switch to day mode" })).toBeTruthy();
  });

  it("still switches when storage throws", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    shell(owner);
    await userEvent.click(screen.getByRole("button", { name: "Switch to night mode" }));
    expect(document.documentElement.dataset.dsMode).toBe("night");
  });
});

describe("collapse", () => {
  it("collapses to the narrow rail, hides the labels from sight and remembers it", async () => {
    shell(owner);
    const aside = document.querySelector("[data-rail]")!;
    expect(aside.className).toContain("w-60");
    await userEvent.click(screen.getByRole("button", { name: "Collapse the menu" }));
    expect(aside.className).toContain("w-[72px]");
    expect(localStorage.getItem("consoleRail")).toBe("1");
    // the link is still reachable by name (an sr-only label), so it is not lost to a screen reader
    expect(rail().getByRole("link", { name: "Support" })).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Expand the menu" }));
    expect(localStorage.getItem("consoleRail")).toBe("0");
  });

  it("opens collapsed when it was left collapsed", () => {
    localStorage.setItem("consoleRail", "1");
    shell(owner);
    expect(document.querySelector("[data-rail]")!.className).toContain("w-[72px]");
  });
});

describe("the phone layout", () => {
  it("has a top bar with a menu button that is hidden from md up, and a rail hidden below md", () => {
    shell(owner);
    expect(document.querySelector("header")!.className).toContain("md:hidden");
    expect(document.querySelector("[data-rail]")!.className).toMatch(/\bhidden\b.*md:block/);
  });

  it("the menu button opens the same nav as a drawer, Escape and the scrim close it", async () => {
    shell(owner);
    expect(document.querySelector("[data-drawer]")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Open the menu" }));
    const drawer = within(document.querySelector<HTMLElement>("[data-drawer]")!);
    expect(drawer.getByRole("link", { name: "Staff" })).toBeTruthy();
    // the drawer is never the collapsed (icon-only) rail
    expect(drawer.getByRole("button", { name: "Sign out" })).toBeTruthy();
    await userEvent.keyboard("{Escape}");
    expect(document.querySelector("[data-drawer]")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Open the menu" }));
    await userEvent.click(screen.getByRole("button", { name: "Close the menu" }));
    expect(document.querySelector("[data-drawer]")).toBeNull();
  });

  it("tap targets in the rail are at least 44 px (min-h-11)", () => {
    shell(owner);
    for (const a of rail().getAllByRole("link")) expect(a.className).toContain("min-h-11");
  });
});
