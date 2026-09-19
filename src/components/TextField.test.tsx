// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { TextField } from "./TextField";
import { useTheme } from "../lib/theme";

afterEach(() => {
  useTheme.setState({ theme: "meadow" });
});

describe("TextField", () => {
  it("renders an input and forwards native props", () => {
    render(<TextField placeholder="Your name" aria-label="Name" />);
    const input = screen.getByLabelText("Name");
    expect(input.tagName).toBe("INPUT");
    expect(input).toHaveAttribute("placeholder", "Your name");
  });

  it("merges a custom className alongside the default styles", () => {
    render(<TextField aria-label="Name" className="mt-4" />);
    expect(screen.getByLabelText("Name")).toHaveClass("mt-4", "rounded-2xl");
  });

  it("uses the underlined Studio Ink treatment instead of the boxed field", () => {
    useTheme.setState({ theme: "studio-ink" });
    render(<TextField aria-label="Name" />);
    const input = screen.getByLabelText("Name");
    expect(input).toHaveClass("border-b");
    expect(input).not.toHaveClass("rounded-2xl");
  });
});
