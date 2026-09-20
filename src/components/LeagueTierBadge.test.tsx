// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { LeagueTierBadge } from "./LeagueTierBadge";

describe("LeagueTierBadge", () => {
  it("labels the badge with the tier name", () => {
    render(<LeagueTierBadge tier="sapphire" />);
    expect(screen.getByLabelText("Sapphire league")).toBeInTheDocument();
  });

  it("sizes small/medium/large differently", () => {
    const { rerender } = render(<LeagueTierBadge tier="ruby" size="sm" />);
    const small = screen.getByLabelText("Ruby league");
    expect(small).toHaveStyle({ width: "24px", height: "24px" });

    rerender(<LeagueTierBadge tier="ruby" size="lg" />);
    expect(screen.getByLabelText("Ruby league")).toHaveStyle({ width: "44px", height: "44px" });
  });

  it("defaults to medium size", () => {
    render(<LeagueTierBadge tier="bronze" />);
    expect(screen.getByLabelText("Bronze league")).toHaveStyle({ width: "32px", height: "32px" });
  });
});
