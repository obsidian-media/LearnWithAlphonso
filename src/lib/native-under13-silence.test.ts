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

  it("keeps the block in the Keychain and UserDefaults, so a relaunch or a reinstall cannot clear it", () => {
    expect(device).toMatch(
      /blockStorage:\s*EitherKeyValue\(first:\s*KeychainFlagKeyValue\(\),\s*second:\s*DefaultsKeyValue\(\)\)/,
    );
    // A value in either copy blocks (the simulator's Keychain write can fail: the relaunch UI test caught it).
    expect(between(device, "func string(forKey key: String) -> String? { first", "}")).toMatch(
      /\?\? second/,
    );
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

const androidApp = (f: string) =>
  stripComments(
    read(`android/LearnWithAlphonso/app/src/main/java/com/obsidianmedia/learnwithalphonso/${f}`),
  );

describe("Android: an under-13 device sends nothing", () => {
  const application = androidApp("AlphonsoApplication.kt");
  const crash = androidApp("CrashReporting.kt");
  const container = androidApp("AppContainer.kt");
  const root = androidApp("ui/RootScreen.kt");
  const activity = androidApp("MainActivity.kt");
  const device = androidApp("firstrun/FirstRunDevice.kt");
  const flow = androidApp("ui/firstrun/FirstRunFlowScreen.kt");
  const manifest = read("android/LearnWithAlphonso/app/src/main/AndroidManifest.xml");

  it("reads the block before anything starts, and keeps it on this device only", () => {
    expect(application).toMatch(/FirstRunDevice\.init\(this\)\s*CrashReporting\.start\(this\)/);
    expect(manifest).toMatch(/android:allowBackup="false"/);
    // commit, not apply: the block is on disk before the next line runs.
    expect(between(device, "override fun set(", "\n    }")).toMatch(/\.commit\(\)/);
  });

  it("Sentry: never starts, drops events and breadcrumbs at send time, and closes when blocked mid-run", () => {
    expect(between(crash, "fun start(context: Context) {", "SentryAndroid.init")).toMatch(
      /if \(FirstRunDevice\.isBlocked\) return/,
    );
    expect(crash).toMatch(
      /BeforeSendCallback \{ event, _ -> if \(FirstRunDevice\.isBlocked\) null else scrub\(event\) \}/,
    );
    expect(crash).toMatch(
      /BeforeBreadcrumbCallback \{ crumb, _ -> if \(FirstRunDevice\.isBlocked\) null else scrub\(crumb\) \}/,
    );
    expect(between(crash, "fun stop() {", "\n    }")).toMatch(/Sentry\.close\(\)/);
    expect(between(root, "val blockThisDevice: () -> Unit = {", "\n    }")).toMatch(
      /CrashReporting\.stop\(\)/,
    );
  });

  it("RevenueCat: never configured on a blocked device", () => {
    expect(container).toMatch(
      /EntitlementStore\(\s*if \(FirstRunDevice\.isBlocked\) null else RevenueCatBilling\.createIfConfigured\(/,
    );
    expect(container.match(/RevenueCatBilling\.createIfConfigured/g)).toHaveLength(1);
  });

  it("auth: no session restore or refresh, and the under-13 sign-out makes no server call", () => {
    expect(container).toMatch(
      /if \(FirstRunDevice\.isBlocked\) session\.endLocally\(\) else session\.restore\(\)/,
    );
    const core = stripComments(
      read(
        "android/LearnWithAlphonso/core/src/main/kotlin/com/obsidianmedia/learnwithalphonso/core/auth/SessionManager.kt",
      ),
    );
    expect(between(core, "fun endLocally() {", "\n    }")).toMatch(
      /endSession\(endOnServer = false\)/,
    );
    const signOut = stripComments(
      read(
        "android/LearnWithAlphonso/app/src/main/java/com/obsidianmedia/learnwithalphonso/ui/firstrun/AfterSignInScreen.kt",
      ),
    );
    expect(between(signOut, "fun signOutBlockedDevice(", "\n}")).toMatch(
      /container\.session\.endLocally\(\)/,
    );
    expect(between(signOut, "fun signOutBlockedDevice(", "\n}")).not.toMatch(
      /signOut\(\)|pushRegistrar/,
    );
  });

  it("no update check, no resume work, no push token at launch, and the stop screen comes first", () => {
    expect(container).toMatch(
      /if \(BuildConfig\.DEBUG \|\| FirstRunDevice\.isBlocked\) null else AppUpdateGate\.check/,
    );
    expect(between(activity, "override fun onResume() {", "\n    }")).toMatch(
      /super\.onResume\(\)\s*if \(FirstRunDevice\.isBlocked\) return/,
    );
    expect(manifest).toMatch(
      /android:name="firebase_messaging_auto_init_enabled" android:value="false"/,
    );
    const branches = between(
      root,
      "Box(Modifier.fillMaxSize().background(palette.surface)) {",
      "\n}",
    );
    const stop = branches.indexOf("firstRunBlocked -> ");
    expect(stop).toBeGreaterThan(-1);
    for (const later of ["gate != null ->", "AuthScreen(container)", "SignedInApp("]) {
      expect(branches.indexOf(later)).toBeGreaterThan(stop);
    }
  });

  it("no speech after the choice, and every first-run speaker goes through the gated voice", () => {
    expect(between(device, "fun speak(", "\n    }")).toMatch(/if \(isBlocked\) return/);
    expect(flow).not.toMatch(/TextToSpeech|Speech\.get\(context\)\.speak/);
  });

  it("the age step blocks through the core and hands over to the stop screen at once", () => {
    const age = between(flow, "private fun AgeStep(", "private fun InterestsStep");
    expect(age).toMatch(
      /if \(FirstRun\.chooseAge\(store, choice\) == AgeOutcome\.BLOCKED\) \{\s*onBlocked\(\)/,
    );
    const handover = between(flow, "FirstRun.QuestionStep.AGE -> AgeStep(ctx, store) {", "}");
    expect(handover).toMatch(/onBlocked\(\)/);
    expect(handover).toMatch(/blocked = true/);
  });
});
