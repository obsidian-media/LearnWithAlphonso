// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { HandsFreeChip, type HandsFreeCall } from "./HandsFreeSwitch";
import { HANDS_FREE_NOTE_SEEN_KEY } from "@/lib/hands-free-copy";

function call(over: Partial<HandsFreeCall> = {}): HandsFreeCall {
  return {
    on: false,
    onChange: vi.fn(),
    status: { kind: "off" },
    onTogglePause: vi.fn(),
    partner: "Hector",
    ...over,
  };
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("the hands-free chip on the call screen", () => {
  it("is a visible toggle that says its state", () => {
    const { rerender } = render(<HandsFreeChip call={call()} />);
    const chip = screen.getByRole("button", { name: "Hands-free" });
    expect(chip).toHaveAttribute("aria-pressed", "false");
    expect(chip).toHaveTextContent("Hands-free: Off");
    rerender(<HandsFreeChip call={call({ on: true })} />);
    expect(screen.getByRole("button", { name: "Hands-free" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Hands-free" })).toHaveTextContent("Hands-free: On");
  });

  it("asks for the one-time safety note before it first turns on, and then turns on", () => {
    const c = call();
    render(<HandsFreeChip call={c} />);
    fireEvent.click(screen.getByTestId("hands-free-chip"));
    expect(c.onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toHaveTextContent(/Hector listens after each reply/);
    fireEvent.click(screen.getByRole("button", { name: "Turn on hands-free" }));
    expect(c.onChange).toHaveBeenCalledWith(true);
    expect(window.localStorage.getItem(HANDS_FREE_NOTE_SEEN_KEY)).toBe("1");
  });

  it("cancelling the note leaves it off and does not remember the note", () => {
    const c = call();
    render(<HandsFreeChip call={c} />);
    fireEvent.click(screen.getByTestId("hands-free-chip"));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(c.onChange).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(HANDS_FREE_NOTE_SEEN_KEY)).toBeNull();
  });

  it("turns on at once once the note was confirmed, and off without a note", () => {
    window.localStorage.setItem(HANDS_FREE_NOTE_SEEN_KEY, "1");
    const c = call();
    const { rerender } = render(<HandsFreeChip call={c} />);
    fireEvent.click(screen.getByTestId("hands-free-chip"));
    expect(c.onChange).toHaveBeenCalledWith(true);
    const on = call({ on: true });
    rerender(<HandsFreeChip call={on} />);
    fireEvent.click(screen.getByTestId("hands-free-chip"));
    expect(on.onChange).toHaveBeenCalledWith(false);
  });
});
