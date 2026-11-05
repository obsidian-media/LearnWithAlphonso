import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The iOS app target only compiles in CI (ios-app-build); the Kit logic behind these (SupabaseAuthClient.logout,
// AuthAccountCleanup's server-session step, FreshInstallGuard) has XCTest coverage. These pin the app-side wiring.
const SRC = "ios/LearnWithAlphonso/Sources";
const read = (p: string) => readFileSync(`${SRC}/${p}`, "utf8");

describe("iOS session storage and sign-out", () => {
  it("the stored session never leaves this device in a backup or transfer", () => {
    const store = read("KeychainSessionStore.swift");
    expect(store).toMatch(
      /kSecAttrAccessible as String\] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly\b/,
    );
    expect(store).not.toMatch(/= kSecAttrAccessibleAfterFirstUnlock\s*$/m);
    expect(store).not.toMatch(/kSecAttrSynchronizable as String/);
  });

  it("a reinstall clears the previous install's session before restoring one", () => {
    const session = read("Session.swift");
    const clearAt = session.indexOf("KeychainSessionStore.clearIfFreshInstall()");
    const loadAt = session.indexOf("KeychainSessionStore.load()");
    expect(clearAt).toBeGreaterThan(-1);
    expect(clearAt).toBeLessThan(loadAt);
  });

  it("sign-out ends the session on the auth server through the app's cleanup registration", () => {
    const app = read("LearnWithAlphonsoApp.swift");
    expect(app).toMatch(
      /endServerSession: \{ accessToken in[\s\S]{0,300}\.logout\(accessToken: accessToken\)/,
    );
  });
});
