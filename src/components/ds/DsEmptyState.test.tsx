// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { DsEmptyState } from "./Blocks";

describe("DsEmptyState", () => {
  it("an empty state is a plain status with a title and a quiet line", () => {
    render(<DsEmptyState title="Nothing here yet" message="Finish a lesson to appear." />);
    const card = screen.getByRole("status");
    expect(card).toHaveAttribute("data-empty-state", "empty");
    expect(card).toHaveTextContent("Nothing here yet");
    expect(card).toHaveTextContent("Finish a lesson to appear.");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("a failure is announced as an alert, and carries its retry action", () => {
    render(
      <DsEmptyState tone="error" title="Could not load your team.">
        <button type="button">Try again</button>
      </DsEmptyState>,
    );
    const card = screen.getByRole("alert");
    expect(card).toHaveAttribute("data-empty-state", "error");
    expect(card).toContainElement(screen.getByRole("button", { name: "Try again" }));
  });

  it("draws a pose of Alphonso, decorative, in preference to an icon", () => {
    const { container } = render(
      <DsEmptyState art="/mascots/alphonso-waving.png" icon="trophy" title="Empty" />,
    );
    const imgs = container.querySelectorAll("img");
    expect(imgs).toHaveLength(1);
    expect(imgs[0]).toHaveAttribute("src", "/mascots/alphonso-waving.png");
    expect(imgs[0]).toHaveAttribute("alt", "");
  });

  it("falls back to a 3D icon when there is no pose, and to no art at all when there is neither", () => {
    const { container, rerender } = render(<DsEmptyState icon="trophy" title="Empty" />);
    expect(container.querySelector("img")).toHaveAttribute("src", "/icons3d/trophy.png");
    rerender(<DsEmptyState title="Empty" />);
    expect(container.querySelector("img")).toBeNull();
  });

  it("the title is a heading only when the screen asks for one", () => {
    const { rerender } = render(<DsEmptyState title="Review complete" heading="h1" />);
    expect(screen.getByRole("heading", { level: 1, name: "Review complete" })).toBeInTheDocument();
    rerender(<DsEmptyState title="Review complete" />);
    expect(screen.queryByRole("heading")).toBeNull();
  });

  it("the hero variant keeps the screen's own look: display-size title and the floating shadow", () => {
    render(
      <DsEmptyState variant="hero" heading="h1" title="Review complete" message="5 correct" />,
    );
    const card = screen.getByRole("status");
    expect(card).toHaveAttribute("data-variant", "hero");
    expect(card.className).toContain("shadow-[var(--ds-shadow-floating)]");
    expect(screen.getByRole("heading", { level: 1 }).className).toContain("ds-type-display");
    render(<DsEmptyState title="Plain" />);
    expect(screen.getByText("Plain").className).toContain("ds-type-headline");
  });

  it("reads the design tokens only: the card, ink and quiet-ink classes, no legacy colour", () => {
    const { container } = render(<DsEmptyState title="T" message="M" />);
    const html = container.innerHTML;
    expect(html).toContain("bg-ds-card");
    expect(html).toContain("text-ds-ink-soft");
    expect(html).not.toMatch(/\b(bg-surface|bg-parchment|text-ink|text-moss|border-hairline)\b/);
  });
});
