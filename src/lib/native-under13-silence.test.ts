import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Under 13 on the apps (visual round 6, part 3; the web's first-run.ts and sentry-client.ts): once a device answers
 * Under 13, NOTHING is sent from it: no auth, no crash reports or sessions, no RevenueCat, no update check, no speech.
 * The app targets only compile in CI, so these read the source: each guard sits in front of the call that would
 * send, and removing any one of them fails here. The pure rules (the block survives a relaunch, an older range
 * cannot get through) are tested in the iOS Kit (FirstRunTests) and Android core (FirstRunTest).
 */
const root = path.resolve(import.meta.dirname, "../..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8").replace(/\r\n/g, "\n");
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"\\])\/\/.*$/gm, "$1");
const ios = (f: string) => stripComments(read(`ios/LearnWithAlphonso/Sources/${f}`));

/** The source between `from` and the next `to` (inclusive of neither), or "" when `from` is missing. */
function between(src: string, from: string, to: string): string {
  const i = src.indexOf(from);
  if (i < 0) return "";
  const j = src.indexOf(to, i + from.length);
  return src.slice(i + from.length, j < 0 ? undefined : j);
}

describe("iOS: an under-13 device sends nothing", () => {
  const crash = ios("CrashReporting.swift");
  const app = ios("LearnWithAlphonsoApp.swift");
  const root = ios("RootView.swift");
  const device = ios("FirstRunDevice.swift");
  const flow = ios("FirstRunFlowView.swift");

  it("keeps the block in the Keychain, so a relaunch or a reinstall cannot clear it", () => {
    expect(device).toMatch(/blockStorage:\s*KeychainFlagKeyValue\(\)/);
    expect(device).toMatch(/kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly/);
    expect(device).not.toMatch(/kSecAttrSynchronizable/);
  });

  it("Sentry: never starts, drops events and breadcrumbs at send time, and closes when blocked mid-run", () => {
    expect(crash).toMatch(
      /#else\s*guard !FirstRunDevice\.isBlocked else \{ return \}\s*SentrySDK\.start/,
    );
    expect(crash).toMatch(
      /options\.beforeSend\s*=\s*\{\s*event in\s*FirstRunDevice\.isBlocked \? nil :/,
    );
    expect(crash).toMatch(
      /options\.beforeBreadcrumb\s*=\s*\{\s*crumb in\s*if FirstRunDevice\.isBlocked \{ return nil \}/,
    );
    expect(between(crash, "static func stop()", "\n    }")).toMatch(/SentrySDK\.close\(\)/);
    expect(between(root, "private func blockThisDevice()", "\n    }")).toMatch(
      /CrashReporting\.stop\(\)/,
    );
  });

  it("RevenueCat: not configured, not started, and no log-out call on a blocked device", () => {
    expect(app).toMatch(
      /let purchasesKey = FirstRunDevice\.isBlocked \? nil : AppConfig\.revenueCatAPIKey/,
    );
    expect(app).toMatch(/if let revenueCatAPIKey = purchasesKey \{\s*Purchases\.configure/);
    expect(app.match(/Purchases\.configure/g)).toHaveLength(1);
    expect(app).toMatch(
      /EntitlementStore\(provider: purchasesKey == nil \? nil : RevenueCatPurchases\(\)\)/,
    );
    expect(app).toMatch(/if !FirstRunDevice\.isBlocked \{ await entitlementStore\.start\(\) \}/);
    expect(app).toMatch(/entitlements: BlockAwareEntitlements\(inner: entitlements\)/);
    expect(between(app, "func reset() async {", "\n    }")).toMatch(
      /guard !FirstRunDevice\.isBlocked else \{ return \}\s*await inner\.reset\(\)/,
    );
  });

  it("auth: no session restore or refresh, and sign-out makes no server call", () => {
    expect(root).toMatch(
      /if FirstRunDevice\.isBlocked \{\s*session\.dropStoredSessionLocally\(\)\s*return\s*\}\s*await session\.restoreSession\(\)/,
    );
    expect(between(app, "unregisterDeviceToken: {", "try await")).toMatch(
      /guard !FirstRunDevice\.isBlocked/,
    );
    expect(between(app, "endServerSession: {", "try await")).toMatch(
      /guard !FirstRunDevice\.isBlocked/,
    );
  });

  it("no update check, and the stop screen comes before the sign-in screen (its bot check loads a web page)", () => {
    expect(root).toMatch(
      /guard !FirstRunDevice\.isBlocked else \{ return \}\s*updateRequired = await AppUpdateGate\.check/,
    );
    const signedOut = between(
      root,
      "private var signedOutView: some View {",
      "private func blockThisDevice",
    );
    expect(signedOut.indexOf("Under13StopView()")).toBeGreaterThan(-1);
    expect(signedOut.indexOf("Under13StopView()")).toBeLessThan(signedOut.indexOf("AuthView("));
    expect(signedOut).toMatch(/if firstRunBlocked \{\s*Under13StopView\(\)/);
  });

  it("no speech after the choice", () => {
    expect(between(device, "static func speak(", "\n    }")).toMatch(
      /guard !FirstRunDevice\.isBlocked else \{ return \}/,
    );
    // Every speaker in the first run goes through that one gated voice.
    expect(flow).not.toMatch(/AVSpeechSynthesizer|AVSpeechUtterance/);
  });

  it("the age step blocks through the Kit and hands over to the stop screen at once", () => {
    const age = between(flow, "private var ageStep: some View {", "private var interestsStep");
    expect(age).toMatch(/if FirstRun\.chooseAge\(store, agePicked\) == \.blocked \{/);
    expect(age).toMatch(/onBlocked\(\)/);
    expect(age).toMatch(/blocked = true/);
  });
});
