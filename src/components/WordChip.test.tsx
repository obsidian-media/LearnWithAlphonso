// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WordChip } from "./WordChip";
import { useTheme } from "../lib/theme";

afterEach(() => {
  useTheme.setState({ theme: "meadow" });
});

describe("WordChip", () => {
  it("is a chunky word tile that presses down and picks its word", async () => {
    const onClick = vi.fn();
    render(<WordChip word="water" picked={false} disabled={false} onClick={onClick} />);
    const chip = screen.getByRole("button", { name: "water" });
    expect(chip).toHaveClass("min-h-11", "active:translate-y-1", "motion-reduce:transition-none");
    expect(chip).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(chip);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("the picked word is highlighted", () => {
    render(<WordChip word="water" picked disabled={false} onClick={() => {}} />);
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button")).toHaveClass("border-moss");
  });

  it("Studio Ink keeps the quiet pill", () => {
    useTheme.setState({ theme: "studio-ink" });
    render(<WordChip word="water" picked={false} disabled={false} onClick={() => {}} />);
    expect(screen.getByRole("button")).toHaveClass("rounded-full");
    expect(screen.getByRole("button").className).not.toContain("active:translate-y-1");
  });
});
