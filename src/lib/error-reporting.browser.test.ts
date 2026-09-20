// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { reportError } from "./error-reporting";

describe("reportError (in the browser)", () => {
  it("logs the error with the current route, mechanism, and severity defaults", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const err = new Error("boom");
    reportError(err);
    expect(spy).toHaveBeenCalledWith(
      "[error-report]",
      err,
      expect.objectContaining({
        route: "/",
        mechanism: "manual",
        severity: "error",
      }),
    );
  });

  it("forwards custom context and overrides", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    reportError(
      "oops",
      { lessonId: "l1" },
      { mechanism: "react_error_boundary", severity: "warning", handled: true },
    );
    expect(spy).toHaveBeenCalledWith(
      "[error-report]",
      "oops",
      expect.objectContaining({
        lessonId: "l1",
        mechanism: "react_error_boundary",
        severity: "warning",
      }),
    );
  });
});
