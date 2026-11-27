// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { isPaywallSource } from "@/lib/paywall-copy";

const paywall = vi.hoisted(() => ({ source: null as string | null }));
vi.mock("../WebPaywall", () => ({
  WebPaywallSheet: ({ source }: { source: string }) => {
    paywall.source = source;
    return <div role="dialog" aria-label="Alphonso Pro paywall" />;
  },
}));

const { RehearsalPaywallSheet } = await import("./RehearsalPaywallSheet");

const done = { eventKind: "interview" as const, runs: 6, stagesDone: 3, corrections: 4 };

describe("RehearsalPaywallSheet (the Pro sheet at the entry tap)", () => {
  it("names what the learner already did and what stays free", () => {
    render(<RehearsalPaywallSheet done={done} onClose={vi.fn()} />);
    expect(screen.getByRole("dialog", { name: "Rehearsals are part of Pro" })).toBeInTheDocument();
    expect(screen.getByText("You have used your free rehearsal")).toBeInTheDocument();
    expect(screen.getByText(/all 3 stages, 6 runs, and 4 mistakes/)).toBeInTheDocument();
    expect(screen.getByText(/plan and run history stay readable/)).toBeInTheDocument();
    expect(screen.getByText(/Recaps and Alphonso.s memory stay free/)).toBeInTheDocument();
  });

  it("is a real modal: focus moves in, Escape and the backdrop close it, no raw black backdrop", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<RehearsalPaywallSheet done={done} onClose={onClose} />);
    expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(true);
    const backdrop = document.querySelector("[data-modal-backdrop]") as HTMLElement;
    expect(backdrop.className).not.toMatch(/black/);
    await user.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
    screen.getByRole("button", { name: "Not now" }).focus();
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("'Not now' closes it, with equal weight to 'See Pro'", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<RehearsalPaywallSheet done={done} onClose={onClose} />);
    expect(screen.getByRole("button", { name: "See Pro" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Not now" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("'See Pro' opens the existing Pro paywall, attributed to the rehearsal entry", async () => {
    const user = userEvent.setup();
    render(<RehearsalPaywallSheet done={done} onClose={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "See Pro" }));
    expect(screen.getByRole("dialog", { name: "Alphonso Pro paywall" })).toBeInTheDocument();
    expect(paywall.source).toBe("rehearsal_entry");
    expect(isPaywallSource("rehearsal_entry")).toBe(true);
  });

  it("says the price is shown by the store and shows no price of its own", () => {
    render(<RehearsalPaywallSheet done={done} onClose={vi.fn()} />);
    expect(screen.getByText(/price is shown .* before you pay/i)).toBeInTheDocument();
    expect(screen.queryByText(/[$€£]\s?\d/)).not.toBeInTheDocument();
  });
});
