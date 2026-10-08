import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AI_CONSENT_COPY, AI_REPORT_MESSAGE_MAX, AI_REPORT_REASONS } from "./ai-consent-copy";

const KIT = path.resolve(
  import.meta.dirname,
  "../../ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit",
);
const copySwift = fs.readFileSync(path.join(KIT, "AIConsentCopy.swift"), "utf8");
const reportSwift = fs.readFileSync(path.join(KIT, "AIResponseReport.swift"), "utf8");

describe("AI consent copy parity (web vs Kit)", () => {
  it.each(Object.entries(AI_CONSENT_COPY))("%s is the same string on iOS", (key, value) => {
    expect(copySwift).toContain(`public static let ${key} = ${JSON.stringify(value)}`);
  });

  it.each(AI_REPORT_REASONS.map((r) => [r.value, r.label]))(
    "reason %s has the same code and label",
    (value, label) => {
      expect(reportSwift).toContain(`"${value}"`);
      expect(reportSwift).toContain(JSON.stringify(label));
    },
  );

  it("the report text cap is the same on both clients", () => {
    expect(reportSwift).toContain(`maxMessageLength = ${AI_REPORT_MESSAGE_MAX}`);
  });
});
