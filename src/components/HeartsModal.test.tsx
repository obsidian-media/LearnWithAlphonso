// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HeartsModal } from "./HeartsModal";
import { useTheme } from "../lib/theme";
import { XP_HEART_COST } from "../lib/hearts";

afterEach(() => {
  useTheme.setState({ theme: "meadow" });
  vi.useRealTimers();
});

describe("HeartsModal", () => {
  it("renders nothing when closed", () => {
    render(<HeartsModal open={false} refillAt={null} onClose={() => {}} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows the dialog with a generic refill message when there's no timer", () => {
    render(<HeartsModal open refillAt={null} onClose={() => {}} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/refill again shortly/)).toBeInTheDocument();
  });

  it("shows a live countdown when refillAt is in the future", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const refillAt = Date.now() + 90_000;
    render(<HeartsModal open refillAt={refillAt} onClose={() => {}} />);
    expect(screen.getByText(/refill automatically in 1:30/)).toBeInTheDocument();
  });

  it("calls onClose when the backdrop, Escape, or the close button is used", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<HeartsModal open refillAt={null} onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: "Got it" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<HeartsModal open refillAt={null} onClose={onClose} />);
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("hides the buy-with-xp option when the callback or xp isn't provided", () => {
    render(<HeartsModal open refillAt={null} onClose={() => {}} />);
    expect(screen.queryByText(/Use \d+ XP for a heart/)).not.toBeInTheDocument();
  });

  it("shows the buy-with-xp option once affordable and calls the handler", async () => {
    const user = userEvent.setup();
    const onBuyWithXp = vi.fn();
    render(
      <HeartsModal
        open
        refillAt={null}
        xp={XP_HEART_COST}
        onClose={() => {}}
        onBuyWithXp={onBuyWithXp}
      />,
    );
    const buyButton = screen.getByRole("button", { name: `Use ${XP_HEART_COST} XP for a heart` });
    await user.click(buyButton);
    expect(onBuyWithXp).toHaveBeenCalledOnce();
    expect(buyButton).toBeDisabled();
  });

  it("hides the buy option when xp is below the cost", () => {
    render(
      <HeartsModal
        open
        refillAt={null}
        xp={XP_HEART_COST - 1}
        onClose={() => {}}
        onBuyWithXp={() => {}}
      />,
    );
    expect(screen.queryByText(/Use \d+ XP for a heart/)).not.toBeInTheDocument();
  });

  it("shows a buy error when one is passed", () => {
    render(<HeartsModal open refillAt={null} buyError="Not enough XP" onClose={() => {}} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Not enough XP");
  });

  // --- focus management + refill transition (coverage gap, 2026-09-24) ---
  // These were the untested half of this component (~68% before): the focus
  // trap exists because the dialog is NOT in a portal, so without it Tab
  // escapes into the bottom-tab nav behind a still-visible backdrop.

  it("moves focus to the close button when it opens", () => {
    render(<HeartsModal open refillAt={null} onClose={() => {}} />);
    expect(screen.getByRole("button", { name: "Got it" })).toHaveFocus();
  });

  it("restores focus to whatever was focused before it opened", () => {
    const trigger = document.createElement("button");
    trigger.textContent = "Open hearts";
    document.body.appendChild(trigger);
    trigger.focus();
    expect(trigger).toHaveFocus();

    const { rerender } = render(<HeartsModal open refillAt={null} onClose={() => {}} />);
    expect(trigger).not.toHaveFocus();

    rerender(<HeartsModal open={false} refillAt={null} onClose={() => {}} />);
    expect(trigger).toHaveFocus();
    trigger.remove();
  });

  it("keeps Tab inside the dialog instead of letting it reach the nav behind", async () => {
    const user = userEvent.setup();
    render(
      <HeartsModal
        open
        refillAt={null}
        xp={XP_HEART_COST}
        onBuyWithXp={() => {}}
        onClose={() => {}}
      />,
    );
    const close = screen.getByRole("button", { name: "Got it" });
    const buy = screen.getByRole("button", { name: `Use ${XP_HEART_COST} XP for a heart` });

    // focusables order is [buy, close], so close is the LAST one. Tabbing
    // from it must wrap to buy rather than move on to whatever is behind
    // the backdrop.
    close.focus();
    await user.tab();
    expect(buy).toHaveFocus();
  });

  it("wraps Shift+Tab backwards without escaping either", async () => {
    const user = userEvent.setup();
    render(
      <HeartsModal
        open
        refillAt={null}
        xp={XP_HEART_COST}
        onBuyWithXp={() => {}}
        onClose={() => {}}
      />,
    );
    const close = screen.getByRole("button", { name: "Got it" });
    const buy = screen.getByRole("button", { name: `Use ${XP_HEART_COST} XP for a heart` });

    // buy is the FIRST focusable, so Shift+Tab from it wraps to close.
    buy.focus();
    await user.tab({ shift: true });
    expect(close).toHaveFocus();
  });

  it("fires onRefillDue only when the countdown actually reaches zero", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const onRefillDue = vi.fn();
    const refillAt = Date.now() + 2000;

    render(<HeartsModal open refillAt={refillAt} onClose={() => {}} onRefillDue={onRefillDue} />);
    // Mounting mid-countdown must not fire it -- that is the whole reason
    // the component tracks a wasCounting transition rather than just
    // reacting to `countdown === null`.
    expect(onRefillDue).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(onRefillDue).toHaveBeenCalledTimes(1);
  });

  it("does not fire onRefillDue when there was never anything to wait for", () => {
    vi.useFakeTimers();
    const onRefillDue = vi.fn();
    render(<HeartsModal open refillAt={null} onClose={() => {}} onRefillDue={onRefillDue} />);
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(onRefillDue).not.toHaveBeenCalled();
  });
});
