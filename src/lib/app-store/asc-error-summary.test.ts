import { describe, expect, it } from "vitest";
import { ascErrorSummary } from "./asc-error-summary";

describe("ascErrorSummary", () => {
  it("keeps the error codes and titles and drops detail text, which can echo submitted values", () => {
    const summary = ascErrorSummary({
      errors: [
        {
          status: "409",
          code: "ENTITY_ERROR.ATTRIBUTE.INVALID",
          title: "An attribute value is invalid.",
          detail: "notes contains https://example.com/api/review-demo-code?key=secret-value",
          source: { pointer: "/data/attributes/notes" },
        },
      ],
    });
    expect(summary).toContain("ENTITY_ERROR.ATTRIBUTE.INVALID");
    expect(summary).toContain("/data/attributes/notes");
    expect(summary).not.toContain("secret-value");
    expect(summary).not.toContain("review-demo-code");
  });

  it("says so when the body has no error list", () => {
    expect(ascErrorSummary({})).toBe("no error details");
    expect(ascErrorSummary(null)).toBe("no error details");
  });
});
