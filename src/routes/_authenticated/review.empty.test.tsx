// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
      <a href={to} {...rest}>
        {children}
      </a>
    ),
  };
});

const { Empty } = await import("./review");

describe("Empty", () => {
  it("shows Alphonso when the review queue is complete", () => {
    render(<Empty title="Review complete" body="5 correct" />);
    expect(screen.getByRole("img", { name: /alphonso/i })).toBeInTheDocument();
  });

  it("does not show Alphonso for the routine nothing-due-today state", () => {
    render(<Empty title="Nothing due today" body="Come back tomorrow." />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("keeps the approved look over the scene: display-size title, floating card", () => {
    render(<Empty title="Review complete" body="5 correct" />);
    expect(screen.getByRole("heading", { level: 1, name: "Review complete" }).className).toContain(
      "ds-type-display",
    );
    expect(screen.getByRole("status")).toHaveAttribute("data-variant", "hero");
  });
});
