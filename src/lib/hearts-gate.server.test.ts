import { describe, expect, it } from "vitest";
import { heartsGateEnforced } from "./hearts-gate.server";

describe("heartsGateEnforced", () => {
  it("defaults on and only the literal 'false' turns it off", () => {
    expect(heartsGateEnforced({})).toBe(true);
    expect(heartsGateEnforced({ ENFORCE_HEARTS_GATE: "true" })).toBe(true);
    expect(heartsGateEnforced({ ENFORCE_HEARTS_GATE: "0" })).toBe(true);
    expect(heartsGateEnforced({ ENFORCE_HEARTS_GATE: "false" })).toBe(false);
  });
});
