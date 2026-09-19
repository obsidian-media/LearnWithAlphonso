import { describe, expect, it, vi } from "vitest";
import { reportError } from "./error-reporting";

describe("reportError (no window)", () => {
  it("is a no-op on the server, where window is undefined", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    reportError(new Error("server-side boom"));
    expect(spy).not.toHaveBeenCalled();
  });
});
