// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Button } from "./Button";
import { Card } from "./Card";
import { StatPill } from "./StatPill";
import { TileCard } from "./TileCard";

describe("Button", () => {
  it("ember uses the ember edge, primary the moss edge", () => {
    render(
      <>
        <Button variant="ember">Go</Button>
        <Button>Next</Button>
      </>,
    );
    expect(screen.getByRole("button", { name: "Go" }).className).toContain("edge-ember");
    expect(screen.getByRole("button", { name: "Next" }).className).toContain("edge-moss");
  });

  it("is a real button with type=button by default, and keeps a given type", () => {
    render(
      <>
        <Button>Plain</Button>
        <Button type="submit">Send</Button>
      </>,
    );
    expect(screen.getByRole("button", { name: "Plain" })).toHaveAttribute("type", "button");
    expect(screen.getByRole("button", { name: "Send" })).toHaveAttribute("type", "submit");
  });

  it("presses down: the edge collapses on active", () => {
    render(<Button>Press</Button>);
    expect(screen.getByRole("button", { name: "Press" }).className).toContain(
      "active:translate-y-1",
    );
  });
});

describe("Card", () => {
  it("lifts only when elevated", () => {
    const { container } = render(
      <>
        <Card elevated>A</Card>
        <Card>B</Card>
      </>,
    );
    const [a, b] = container.querySelectorAll("div");
    expect(a.className).toContain("card-lift");
    expect(b.className).not.toContain("card-lift");
  });
});

describe("TileCard", () => {
  it("applies the tone background and renders the 3D icon", () => {
    const { container } = render(
      <TileCard tone="sun" icon="☕" title="Au café" subtitle="Order a coffee" />,
    );
    const tile = container.firstElementChild as HTMLElement;
    expect(tile.dataset.tone).toBe("sun");
    expect(tile.className).toContain("bg-tile-sun-bg");
    expect(container.querySelector("img")).toHaveAttribute("src", "/icons3d/hot_beverage.png");
    expect(screen.getByText("Au café")).toBeInTheDocument();
    expect(screen.getByText("Order a coffee")).toBeInTheDocument();
  });

  it("is presentational: no subtitle line when none is given, so callers can wrap it in a Link", () => {
    const { container } = render(<TileCard tone="mint" icon="🩺" title="Doctor" />);
    expect(container.querySelectorAll("p")).toHaveLength(1);
    expect(container.querySelector("a, button")).toBeNull();
  });
});

describe("StatPill", () => {
  it("exposes its label to screen readers and hides the icon", () => {
    const { container } = render(<StatPill emoji="🔥" value="12" label="Streak: 12 days" />);
    const pill = screen.getByLabelText("Streak: 12 days");
    expect(pill).toHaveTextContent("12");
    expect(container.querySelector("img")).toHaveAttribute("alt", "");
  });
});
