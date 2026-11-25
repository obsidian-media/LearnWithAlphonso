import { describe, expect, it } from "vitest";
import { MIC_MESSAGES, micErrorMessage, micProblemFor } from "./mic-errors";

const named = (name: string) => Object.assign(new Error(name), { name });

describe("microphone error mapping", () => {
  it.each([
    ["NotAllowedError", "denied"],
    ["PermissionDeniedError", "denied"],
    ["SecurityError", "denied"],
    ["NotFoundError", "missing"],
    ["DevicesNotFoundError", "missing"],
    ["NotReadableError", "busy"],
    ["TrackStartError", "busy"],
    ["OverconstrainedError", "unsupported"],
    ["SomethingElse", "other"],
  ] as const)("%s is %s", (name, problem) => {
    expect(micProblemFor(named(name))).toBe(problem);
  });

  it("gives every cause its own message, and each says what to do next", () => {
    const messages = Object.values(MIC_MESSAGES);
    expect(new Set(messages).size).toBe(messages.length);
    expect(micErrorMessage(named("NotAllowedError"))).toMatch(/blocked.*Settings/i);
    expect(micErrorMessage(named("NotFoundError"))).toMatch(/no microphone/i);
    expect(micErrorMessage(named("NotReadableError"))).toMatch(/another app/i);
    expect(micErrorMessage(named("OverconstrainedError"))).toMatch(/can't be used/i);
  });

  it("copes with a thrown value that is not an Error", () => {
    expect(micProblemFor(undefined)).toBe("other");
    expect(micProblemFor("denied")).toBe("other");
    expect(micProblemFor({ name: "NotFoundError" })).toBe("missing");
  });
});
