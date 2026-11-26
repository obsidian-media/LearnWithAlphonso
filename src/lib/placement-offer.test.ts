import { describe, expect, it } from "vitest";
import { placementOffer, type OfferSurface, type OfferStyle } from "./placement-offer";

const LEVELS = ["new", "some", "confident", null, undefined] as const;

/** The whole rule, written out: level x placementTaken x dismissed x surface. */
function expected(
  level: string | null | undefined,
  taken: boolean,
  dismissed: boolean,
  surface: OfferSurface,
): OfferStyle {
  if (taken) return "none";
  const wants = level === "some" || level === "confident";
  if (wants && !dismissed) return "prominent";
  return surface === "learn" ? "quiet" : "none";
}

describe("placementOffer", () => {
  it("matches the owner's rule for every combination", () => {
    for (const level of LEVELS)
      for (const taken of [false, true])
        for (const dismissed of [false, true])
          for (const surface of ["hector-end", "learn"] as const)
            expect(
              placementOffer({ level, placementTaken: taken, dismissed, surface }),
              `${level} taken=${taken} dismissed=${dismissed} ${surface}`,
            ).toBe(expected(level, taken, dismissed, surface));
  });

  it("spells out the cases that matter", () => {
    const o = placementOffer;
    expect(
      o({ level: "some", placementTaken: false, dismissed: false, surface: "hector-end" }),
    ).toBe("prominent");
    expect(
      o({ level: "confident", placementTaken: false, dismissed: false, surface: "learn" }),
    ).toBe("prominent");
    // True beginners are not pushed, but keep the small card on Learn.
    expect(
      o({ level: "new", placementTaken: false, dismissed: false, surface: "hector-end" }),
    ).toBe("none");
    expect(o({ level: "new", placementTaken: false, dismissed: false, surface: "learn" })).toBe(
      "quiet",
    );
    // Not now: the Hector prompt is gone, the Learn card stays but quieter.
    expect(
      o({ level: "some", placementTaken: false, dismissed: true, surface: "hector-end" }),
    ).toBe("none");
    expect(o({ level: "some", placementTaken: false, dismissed: true, surface: "learn" })).toBe(
      "quiet",
    );
    // Taking it ends every offer.
    expect(o({ level: "some", placementTaken: true, dismissed: false, surface: "learn" })).toBe(
      "none",
    );
  });
});
