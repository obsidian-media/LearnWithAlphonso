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

  it("an app update keeps the session saved by an earlier build instead of signing the learner out", () => {
    const store = read("KeychainSessionStore.swift");
    const body = store.slice(store.indexOf("static func clearIfFreshInstall"));
    const keepAt = body.search(
      /let stored = storedAccessibility\(\),\s*stored != \(kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly as String\)[\s\S]{0,60}save\(session\)[\s\S]{0,20}return/,
    );
    const clearAt = body.indexOf("clear()");
    expect(keepAt).toBeGreaterThan(-1);
    expect(keepAt).toBeLessThan(clearAt);
    expect(store).toMatch(/query\[kSecReturnAttributes as String\] = true/);
  });

  it("sign-out ends the session on the auth server through the app's cleanup registration", () => {
    const app = read("LearnWithAlphonsoApp.swift");
    expect(app).toMatch(
      /endServerSession: \{ accessToken in[\s\S]{0,300}\.logout\(accessToken: accessToken\)/,
    );
  });
});
