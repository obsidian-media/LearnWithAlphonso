import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  PAYWALL_COPY,
  PAYWALL_SOURCES,
  isPaywallSource,
  paywallDisclosure,
  paywallPriceLine,
  paywallTrialLine,
} from "./paywall-copy";

const swift = fs.readFileSync(
  path.resolve(
    import.meta.dirname,
    "../../ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/PaywallPresentation.swift",
  ),
  "utf8",
);

describe("web paywall copy matches the iPhone paywall", () => {
  it.each(Object.entries(PAYWALL_COPY))("%s is the same string on iOS", (key, value) => {
    expect(swift).toContain(`public static let ${key} = ${JSON.stringify(value)}`);
  });

  it("every iOS paywall source the web reuses has the same raw value", () => {
    for (const source of ["hector_tab", "hector_not_entitled", "practice_hector_card"] as const) {
      expect(PAYWALL_SOURCES).toContain(source);
      expect(swift).toContain(`= "${source}"`);
    }
    expect(PAYWALL_SOURCES).toContain("practice_end_prompt");
    // The lesson-complete "Practice with Hector" button: the iPhone's PaywallSource.lessonComplete raw value.
    expect(PAYWALL_SOURCES).toContain("lesson_complete");
    expect(isPaywallSource("lesson_complete")).toBe(true);
  });
});

describe("web paywall lines follow the iPhone formats", () => {
  it("price line: '$9.99 / month' and '$79.99 / year'", () => {
    expect(paywallPriceLine("$9.99", "month")).toBe("$9.99 / month");
    expect(paywallPriceLine("$79.99", "year")).toBe("$79.99 / year");
  });

  it("trial line: 'Free for 7 days, then $9.99/month', none without a trial", () => {
    expect(paywallTrialLine("$9.99", "month", 7)).toBe("Free for 7 days, then $9.99/month");
    expect(paywallTrialLine("$9.99", "month", 1)).toBe("Free for 1 day, then $9.99/month");
    expect(paywallTrialLine("$9.99", "month", null)).toBeNull();
  });

  it("disclosure names the renewal price and how to cancel, with and without a trial", () => {
    expect(paywallDisclosure("$9.99", "month", null)).toBe(
      "Alphonso Pro renews automatically at $9.99/month until you cancel. Your card is charged when you confirm the purchase. Cancel any time from Manage Subscription; cancelling stops the next renewal.",
    );
    expect(paywallDisclosure("$9.99", "month", 7)).toBe(
      "After the free trial, Alphonso Pro renews automatically at $9.99/month until you cancel. Your card is charged when the trial ends. Cancel any time from Manage Subscription; cancelling stops the next renewal.",
    );
  });
});

describe("web paywall wording when the price is only known at checkout", () => {
  it("names the plan and says the price comes in the learner's currency, with no number", () => {
    expect(paywallPriceLine(null, "month")).toBe(
      "Monthly plan, priced in your currency at checkout",
    );
    expect(paywallPriceLine(null, "year")).toBe("Yearly plan, priced in your currency at checkout");
    expect(paywallTrialLine(null, "month", 7)).toBe(
      "Free for 7 days, then the monthly price shown at checkout",
    );
    expect(paywallTrialLine(null, "month", null)).toBeNull();
    expect(paywallDisclosure(null, "month", 7)).toBe(
      "After the free trial, Alphonso Pro renews automatically at the monthly price shown at checkout until you cancel. Your card is charged when the trial ends. Cancel any time from Manage Subscription; cancelling stops the next renewal.",
    );
    expect(paywallDisclosure(null, "year", null)).toBe(
      "Alphonso Pro renews automatically at the yearly price shown at checkout until you cancel. Your card is charged when you confirm the purchase. Cancel any time from Manage Subscription; cancelling stops the next renewal.",
    );
  });
});
