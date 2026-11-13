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
  it("is enforced by default: nothing set, empty or unrecognised all charge", () => {
    expect(serverHeartsMode({})).toBe("on");
    expect(serverHeartsMode({ SERVER_HEARTS: "" })).toBe("on");
    expect(serverHeartsMode({ SERVER_HEARTS: "yes" })).toBe("on");
    expect(serverHeartsMode({ SERVER_HEARTS: " ON " })).toBe("on");
  });
  it("only the literal 'shadow' records without charging, and 'off' skips the settlement", () => {
    expect(serverHeartsMode({ SERVER_HEARTS: "shadow" })).toBe("shadow");
    expect(serverHeartsMode({ SERVER_HEARTS: " Shadow " })).toBe("shadow");
    expect(serverHeartsMode({ SERVER_HEARTS: "off" })).toBe("off");
    expect(serverHeartsMode({ SERVER_HEARTS: "OFF" })).toBe("off");
  });
});
