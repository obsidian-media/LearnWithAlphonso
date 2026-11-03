// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { Icon3D } from "./Icon3D";

describe("Icon3D", () => {
  it("shows the 3D image for a known emoji, hidden from screen readers", () => {
    const { container } = render(<Icon3D emoji="☕" size={40} />);
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img).toHaveAttribute("src", "/icons3d/hot_beverage.png");
    expect(img).toHaveAttribute("alt", "");
    expect(img).toHaveAttribute("width", "40");
  });

  it("finds the same image with or without the variation selector", () => {
    const a = render(<Icon3D emoji="⭐️" size={24} />).container.querySelector("img");
    const b = render(<Icon3D emoji="⭐" size={24} />).container.querySelector("img");
    expect(a?.getAttribute("src")).toBe(b?.getAttribute("src"));
  });

  it("falls back to the emoji text for an unknown emoji", () => {
    const { container } = render(<Icon3D emoji="🦄" size={24} />);
    expect(container.querySelector("img")).toBeNull();
    const span = container.querySelector("span");
    expect(span).toHaveTextContent("🦄");
    expect(span).toHaveAttribute("aria-hidden", "true");
  });
});
