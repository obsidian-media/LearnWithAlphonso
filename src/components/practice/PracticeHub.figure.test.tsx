// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

vi.mock("@/components/HectorInvite", () => ({ HectorInvite: () => null }));
vi.mock("./SayThePicture", () => ({ SayThePicture: () => null }));
vi.mock("./SayItRight", () => ({ SayItRight: () => null }));

const { PracticeHub } = await import("./PracticeHub");

function renderHub() {
  return render(
    <PracticeHub
      course="en"
      data={{ stars: [], cefrLevel: "A2", weaknessEvents: [] }}
      initialMode="call"
      onStart={() => {}}
    />,
  );
}

describe("call-card Alphonso figure", () => {
  it("is visible on every phone: shown from 20rem (320 px), never gated at 30rem (480 px)", () => {
    const { container } = renderHub();
    const figure = container.querySelector("[data-hero-figure]") as HTMLElement | null;
    expect(figure, "figure wrapper").not.toBeNull();
    const classes = figure!.className.split(/\s+/);
    // Hidden by default (narrower than 20rem, which is also what large text does to a phone), block from 20rem.
    expect(classes).toContain("hidden");
    expect(classes).toContain("min-[20rem]:block");
    const gates = classes.filter((c) => /^min-\[\d+(\.\d+)?rem\]:/.test(c));
    expect(gates).toEqual(["min-[20rem]:block"]);
    // A 320 px and a 390 px phone at the default size both reach 20rem, so the figure shows on them.
    expect(320 / 16).toBeGreaterThanOrEqual(20);
    expect(390 / 16).toBeGreaterThanOrEqual(20);
    // At about 1.3x text a 390 px phone is only 18.75rem wide, so the figure hides.
    expect(390 / (16 * 1.3)).toBeLessThan(20);
  });

  it("is 144px tall and sits in the grid flow, never absolutely positioned over the title", () => {
    const { container } = renderHub();
    const figure = container.querySelector("[data-hero-figure]") as HTMLElement;
    expect(figure.className).not.toMatch(/\babsolute\b/);
    expect(figure.querySelector("img")!.className).toContain("h-[144px]");
  });
});
