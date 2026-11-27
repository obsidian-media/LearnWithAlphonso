// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import fixture from "../../../tests/fixtures/rehearsal-api.json";

const api = vi.hoisted(() => ({ fetchRehearsals: vi.fn() }));
const pro = vi.hoisted(() => ({ state: "free" }));
vi.mock("@/lib/rehearsal-api", () => api);
vi.mock("@/lib/use-pro-status", () => ({ useProStatus: () => ({ state: pro.state }) }));
vi.mock("../WebPaywall", () => ({ WebPaywallSheet: () => <div role="dialog" aria-label="Pro" /> }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));

const { RehearsalRailCard } = await import("./RehearsalRailCard");
const { _resetAppConfigCache } = await import("@/lib/use-rehearsal-entry");

const config = (rehearsals: boolean | undefined) =>
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(JSON.stringify({ features: rehearsals === undefined ? {} : { rehearsals } })),
    ),
  );

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  _resetAppConfigCache();
  pro.state = "free";
});

describe("RehearsalRailCard (Learn, For you rail)", () => {
  it("is not there while the server flag is off (and asks nothing else)", async () => {
    config(false);
    const { container } = render(<RehearsalRailCard course="en" />);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
    expect(api.fetchRehearsals).not.toHaveBeenCalled();
  });

  it("is not there when app-config says nothing about it", async () => {
    config(undefined);
    const { container } = render(<RehearsalRailCard course="en" />);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("with the flag on and the free one available: 'Rehearse a real talk', a link to the intake", async () => {
    config(true);
    api.fetchRehearsals.mockResolvedValue({ ok: true, value: fixture.stateEmpty });
    render(<RehearsalRailCard course="en" />);
    const link = await screen.findByRole("link", { name: /Rehearse a real talk/ });
    expect(link).toHaveAttribute("href", "/rehearse");
  });

  it("with an active rehearsal it names the event and the day", async () => {
    config(true);
    api.fetchRehearsals.mockResolvedValue({ ok: true, value: fixture.state });
    render(<RehearsalRailCard course="en" />);
    const link = await screen.findByRole("link", { name: /Rehearsal: Job interview · Tue 1 Dec/ });
    expect(link).toHaveAttribute("href", "/rehearse");
  });

  it("for a non-Pro learner whose free one is used, a tap opens the Pro sheet instead of navigating", async () => {
    config(true);
    api.fetchRehearsals.mockResolvedValue({
      ok: true,
      value: { ...fixture.stateEmpty, freeAvailable: false, history: fixture.state.history },
    });
    const user = userEvent.setup();
    render(<RehearsalRailCard course="en" />);
    await user.click(await screen.findByRole("button", { name: /Rehearse a real talk/ }));
    expect(screen.getByRole("dialog", { name: "Rehearsals are part of Pro" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Not now" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("for a Pro learner whose free one is used, it is an ordinary link", async () => {
    pro.state = "pro";
    config(true);
    api.fetchRehearsals.mockResolvedValue({
      ok: true,
      value: { ...fixture.stateEmpty, freeAvailable: false },
    });
    render(<RehearsalRailCard course="en" />);
    expect(await screen.findByRole("link", { name: /Rehearse a real talk/ })).toBeInTheDocument();
  });

  it("is not there when the rehearsal state cannot be read", async () => {
    config(true);
    api.fetchRehearsals.mockResolvedValue({ ok: false, error: "failed" });
    const { container } = render(<RehearsalRailCard course="en" />);
    await waitFor(() => expect(api.fetchRehearsals).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
