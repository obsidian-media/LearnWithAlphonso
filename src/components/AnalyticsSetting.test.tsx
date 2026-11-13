// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AnalyticsSetting } from "./AnalyticsSetting";
import { ANALYTICS_CONSENT_KEY } from "../lib/analytics";

beforeEach(() => window.localStorage.clear());

describe("AnalyticsSetting", () => {
  it("is off by default", () => {
    render(<AnalyticsSetting />);
    expect(screen.getByRole("switch", { name: "Share anonymous usage data" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  it("turns on and off, storing the choice", async () => {
    render(<AnalyticsSetting />);
    const sw = screen.getByRole("switch", { name: "Share anonymous usage data" });
    await userEvent.click(sw);
    expect(sw).toHaveAttribute("aria-checked", "true");
    expect(window.localStorage.getItem(ANALYTICS_CONSENT_KEY)).toBe("1");
    await userEvent.click(sw);
    expect(sw).toHaveAttribute("aria-checked", "false");
    expect(window.localStorage.getItem(ANALYTICS_CONSENT_KEY)).toBe("0");
  });

  it("stays off and says why on an Under 13 device", () => {
    window.localStorage.setItem("lwa.under13.v1", "1");
    render(<AnalyticsSetting />);
    expect(screen.queryByRole("switch")).toBeNull();
  });
});
