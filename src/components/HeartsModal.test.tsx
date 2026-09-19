// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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
});
