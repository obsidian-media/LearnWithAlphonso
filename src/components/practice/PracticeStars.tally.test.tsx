// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { StarTally } from "./PracticeStars";

describe("StarTally", () => {
  it("is an image with a spoken total, not a bare span with an aria-label", () => {
    render(<StarTally earned={3} total={156} />);
    expect(screen.getByRole("img", { name: "3 of 156 stars earned" })).toBeInTheDocument();
  });
});
