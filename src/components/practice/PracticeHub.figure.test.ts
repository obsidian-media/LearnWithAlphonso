import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/components/practice/PracticeHub.tsx", "utf8");

describe("call-card Alphonso figure", () => {
  it("sits in the card's grid flow and is hidden at narrow widths and large text", () => {
    const figure = source.match(/<div\s+data-hero-figure=""\s+className="([^"]+)"/);
    expect(figure, "figure wrapper").not.toBeNull();
    expect(figure![1]).toContain("hidden");
    expect(figure![1]).toMatch(/min-\[\d+rem\]:flex/);
    expect(source).not.toMatch(/absolute bottom-20[^"]*h-\[150px\]/);
  });
});
