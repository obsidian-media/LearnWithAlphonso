import { describe, expect, it } from "vitest";
import { heartsGateEnforced, serverHeartsMode } from "./hearts-gate.server";

describe("heartsGateEnforced", () => {
  it("defaults on and only the literal 'false' turns it off", () => {
    expect(heartsGateEnforced({})).toBe(true);
    expect(heartsGateEnforced({ ENFORCE_HEARTS_GATE: "true" })).toBe(true);
    expect(heartsGateEnforced({ ENFORCE_HEARTS_GATE: "0" })).toBe(true);
    expect(heartsGateEnforced({ ENFORCE_HEARTS_GATE: "false" })).toBe(false);
  });
});

describe("serverHeartsMode", () => {
  it("defaults to shadow, so a first deploy charges nothing", () => {
    expect(serverHeartsMode({})).toBe("shadow");
    expect(serverHeartsMode({ SERVER_HEARTS: "" })).toBe("shadow");
    expect(serverHeartsMode({ SERVER_HEARTS: "yes" })).toBe("shadow");
  });
  it("charges only on the literal 'on', and 'off' skips the settlement", () => {
    expect(serverHeartsMode({ SERVER_HEARTS: "on" })).toBe("on");
    expect(serverHeartsMode({ SERVER_HEARTS: " ON " })).toBe("on");
    expect(serverHeartsMode({ SERVER_HEARTS: "off" })).toBe("off");
  });
});
