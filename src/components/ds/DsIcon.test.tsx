// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { DsIcon } from "./DsIcon";
import { DS_ICON_NAMES } from "../../design/icons.generated";

describe("DsIcon", () => {
  it("draws every icon on the 24 grid with a round 2 pt stroke in the current colour", () => {
    for (const name of DS_ICON_NAMES) {
      const { container, unmount } = render(<DsIcon name={name} />);
      const svg = container.querySelector("svg")!;
      expect(svg.getAttribute("viewBox"), name).toBe("0 0 24 24");
      expect(svg.getAttribute("stroke"), name).toBe("currentColor");
      expect(svg.getAttribute("stroke-width"), name).toBe("2");
      expect(svg.getAttribute("stroke-linecap"), name).toBe("round");
      expect(svg.getAttribute("fill"), name).toBe("none");
      expect(svg.children.length, name).toBeGreaterThan(0);
      unmount();
    }
  });

  it("is hidden from screen readers unless it is given a label", () => {
    const { container } = render(<DsIcon name="heart" />);
    expect(container.querySelector("svg")!.getAttribute("aria-hidden")).toBe("true");
    const labelled = render(<DsIcon name="heart" label="Hearts" />);
    const svg = labelled.container.querySelector("svg")!;
    expect(svg.getAttribute("role")).toBe("img");
    expect(svg.getAttribute("aria-label")).toBe("Hearts");
    expect(svg.getAttribute("aria-hidden")).toBeNull();
  });

  it("solid fills the shape and drops the flame's inner highlight; the target's dot is always filled", () => {
    const solid = render(<DsIcon name="flame" solid />).container.querySelector("svg")!;
    expect(solid.getAttribute("fill")).toBe("currentColor");
    expect(solid.querySelectorAll("path")).toHaveLength(1);
    const outline = render(<DsIcon name="flame" />).container.querySelector("svg")!;
    expect(outline.querySelectorAll("path")).toHaveLength(2);
    const target = render(<DsIcon name="target" />).container.querySelector("svg")!;
    const dot = [...target.querySelectorAll("circle")].find((c) => c.getAttribute("r") === "1.6")!;
    expect(dot.getAttribute("fill")).toBe("currentColor");
    expect(dot.getAttribute("stroke")).toBe("none");
  });

  it("solid is only offered for the four HUD and reward icons", () => {
    // @ts-expect-error: "lock" has no solid version.
    render(<DsIcon name="lock" solid />);
  });
});
