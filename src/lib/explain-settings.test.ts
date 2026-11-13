import { describe, expect, it } from "vitest";
import { explainSettingsFromMetadata } from "./explain-settings";

describe("explainSettingsFromMetadata", () => {
  it("defaults to tap-to-explain for an account that never chose", () => {
    expect(explainSettingsFromMetadata({ learner_profile: { nativeLanguage: "fa" } })).toEqual({
      nativeLanguage: "fa",
      mode: "tap",
    });
  });
  it("reads the saved choice", () => {
    expect(
      explainSettingsFromMetadata({
        learner_profile: { nativeLanguage: "ar", explainMode: "always" },
      }),
    ).toEqual({ nativeLanguage: "ar", mode: "always" });
  });
  it("has no language for an account with no profile, and still defaults the mode", () => {
    expect(explainSettingsFromMetadata(undefined)).toEqual({
      nativeLanguage: undefined,
      mode: "tap",
    });
  });
  it("ignores a language the app does not offer", () => {
    expect(
      explainSettingsFromMetadata({ learner_profile: { nativeLanguage: "tlh" } }).nativeLanguage,
    ).toBeUndefined();
  });
});
