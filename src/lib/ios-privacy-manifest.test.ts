import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The privacy manifests must say exactly what the Swift code does.
 * - Required-reason APIs: a category is declared if and only if the code calls it, with exactly the reasons below.
 * - Collected data types: a pinned list, each backed by code evidence, and no code may collect a category that is
 *   not declared. The App Store Connect App Privacy answers are entered from this same list.
 * Swift comments are stripped first, so a doc comment that names an API is not a use.
 */
const root = path.resolve(import.meta.dirname, "../..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8").replace(/\r\n/g, "\n");

function swiftFiles(dir: string): string[] {
  return fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) => {
    const rel = path.posix.join(dir, e.name);
    if (e.isDirectory()) return swiftFiles(rel);
    return e.name.endsWith(".swift") ? [rel] : [];
  });
}

function stripSwiftComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"\\])\/\/.*$/gm, "$1");
}

const codeOf = (dirs: string[]) =>
  dirs
    .flatMap(swiftFiles)
    .map((f) => stripSwiftComments(read(f)))
    .join("\n");

const APP_DIRS = [
  "ios/LearnWithAlphonso/Sources",
  "ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit",
];
const WIDGET_DIRS = ["ios/LearnWithAlphonso/LearnWithAlphonsoWidget"];
const appCode = codeOf(APP_DIRS);
const widgetCode = codeOf(WIDGET_DIRS);

const APP_MANIFEST = "ios/LearnWithAlphonso/PrivacyInfo.xcprivacy";
const WIDGET_MANIFEST = "ios/LearnWithAlphonso/LearnWithAlphonsoWidget/PrivacyInfo.xcprivacy";
const manifest = (p: string) => read(p).replace(/<!--[\s\S]*?-->/g, "");

/** Apple's required-reason API categories and the Swift symbols that put an app in each one. */
const CATEGORY_USES: Record<string, RegExp> = {
  NSPrivacyAccessedAPICategoryUserDefaults: /\bUserDefaults\b|@AppStorage\b/,
  NSPrivacyAccessedAPICategoryFileTimestamp:
    /\battributesOfItem\b|\b(creationDate|contentModificationDate|fileModificationDate|modificationDate)(Key)?\b|\bgetattrlist\b|\b[fl]?stat\s*\(/,
  NSPrivacyAccessedAPICategorySystemBootTime: /\bsystemUptime\b|\bmach_absolute_time\b/,
  NSPrivacyAccessedAPICategoryDiskSpace:
    /\bvolume(Available|Total)Capacity\w*\b|\bsystemFreeSize\b|\bsystemSize\b|\bstatv?fs\b/,
  NSPrivacyAccessedAPICategoryActiveKeyboards: /\bactiveInputModes\b/,
};

/** The reasons this app may give. Anything else must be looked up in Apple's list and added here on purpose. */
function allowedReasons(category: string, code: string): string[] | null {
  if (category === "NSPrivacyAccessedAPICategoryUserDefaults") {
    const reasons: string[] = [];
    // CA92.1: the app's own defaults (standard suite, @AppStorage, a `= .standard` default argument).
    if (/\bUserDefaults\.standard\b|@AppStorage\b|:\s*UserDefaults\s*=\s*\.standard\b/.test(code))
      reasons.push("CA92.1");
    // 1C8F.1: the App Group suite shared by the app and the widget.
    if (/\bUserDefaults\(\s*suiteName:/.test(code)) reasons.push("1C8F.1");
    return reasons;
  }
  // C617.1: timestamps/sizes of files inside the app container (never 3B52.1, which is for user-picked files).
  if (category === "NSPrivacyAccessedAPICategoryFileTimestamp") return ["C617.1"];
  return null; // no approved reason: using this category fails the test until someone decides one deliberately
}

function accessedApis(xml: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const re =
    /<key>NSPrivacyAccessedAPIType<\/key>\s*<string>([^<]+)<\/string>\s*<key>NSPrivacyAccessedAPITypeReasons<\/key>\s*<array>([\s\S]*?)<\/array>/g;
  for (const m of xml.matchAll(re))
    out.set(
      m[1],
      [...m[2].matchAll(/<string>([^<]+)<\/string>/g)].map((r) => r[1]),
    );
  return out;
}

type Collected = { type: string; linked: boolean; tracking: boolean; purposes: string[] };
function collectedTypes(xml: string): Collected[] {
  const block =
    /<key>NSPrivacyCollectedDataTypes<\/key>\s*<array>([\s\S]*?)<\/array>\s*<key>NSPrivacyAccessedAPITypes/.exec(
      xml,
    );
  if (!block) return [];
  const re =
    /<key>NSPrivacyCollectedDataType<\/key>\s*<string>([^<]+)<\/string>\s*<key>NSPrivacyCollectedDataTypeLinked<\/key>\s*<(true|false)\/>\s*<key>NSPrivacyCollectedDataTypeTracking<\/key>\s*<(true|false)\/>\s*<key>NSPrivacyCollectedDataTypePurposes<\/key>\s*<array>([\s\S]*?)<\/array>/g;
  return [...block[1].matchAll(re)].map((m) => ({
    type: m[1],
    linked: m[2] === "true",
    tracking: m[3] === "true",
    purposes: [...m[4].matchAll(/<string>([^<]+)<\/string>/g)].map((r) => r[1]),
  }));
}

/** The collected data types, each with the code that proves the app still collects it. */
const EXPECTED_COLLECTED: Record<string, RegExp> = {
  NSPrivacyCollectedDataTypeName: /display_name/, // public display name; Apple given name prefill
  NSPrivacyCollectedDataTypeEmailAddress: /"email"/, // sign-in identifier
  NSPrivacyCollectedDataTypeAudioData: /api\/stt/, // speaking audio to the transcription service
  NSPrivacyCollectedDataTypeOtherUserContent: /content_reports/, // AI turns, answers, saved words, reports
  NSPrivacyCollectedDataTypeUserID: /user_id/, // Supabase user id, RevenueCat app user id
  NSPrivacyCollectedDataTypeDeviceID: /device_tokens/, // APNs token
  NSPrivacyCollectedDataTypeProductInteraction: /complete-lesson/, // the learning record
  NSPrivacyCollectedDataTypePurchaseHistory: /import RevenueCat/, // subscription state
  NSPrivacyCollectedDataTypeOtherDataTypes: /_age_confirmed/, // 13+ self-declaration (buddy matching); AI consent record
};

/** Categories the app must not touch while they are undeclared. */
const UNDECLARED_PROBES: [string, RegExp][] = [
  ["Location", /\bimport CoreLocation\b|\bCLLocationManager\b/],
  ["Contacts", /\bimport Contacts(UI)?\b|\bCNContactStore\b/],
  ["Photos or Videos", /\bimport Photos(UI)?\b|\bPHPhotoLibrary\b|\bPhotosPicker\b/],
  ["Health and Fitness", /\bimport HealthKit\b|\bimport CoreMotion\b/],
  [
    "Tracking / Advertising Data",
    /\bimport (AdSupport|AppTrackingTransparency)\b|\bASIdentifierManager\b/,
  ],
  ["Device ID beyond the APNs token", /\bidentifierForVendor\b/],
  ["Diagnostics", /\bimport (Sentry|FirebaseCrashlytics|Bugsnag|MetricKit)\b/],
];

const APP_FUNCTIONALITY = "NSPrivacyCollectedDataTypePurposeAppFunctionality";

describe("app privacy manifest: required-reason APIs", () => {
  const declared = accessedApis(manifest(APP_MANIFEST));

  it("every required-reason API the app calls is declared with its reason, and nothing else is", () => {
    for (const [category, uses] of Object.entries(CATEGORY_USES)) {
      const used = uses.test(appCode);
      if (!used) {
        expect(
          declared.has(category),
          `${category} is declared but no app or Kit code uses it (stale entry)`,
        ).toBe(false);
        continue;
      }
      const reasons = allowedReasons(category, appCode);
      expect(
        reasons,
        `${category} is used but this app has no approved reason for it yet`,
      ).not.toBeNull();
      expect(declared.get(category)?.slice().sort(), `${category} reasons`).toEqual(
        reasons!.slice().sort(),
      );
    }
  });

  it("UserDefaults declares both the app's own defaults and the App Group", () => {
    expect(declared.get("NSPrivacyAccessedAPICategoryUserDefaults")?.slice().sort()).toEqual([
      "1C8F.1",
      "CA92.1",
    ]);
  });

  it("never uses the user-picked-file timestamp reason", () => {
    expect(manifest(APP_MANIFEST)).not.toContain("3B52.1");
  });
});

describe("widget privacy manifest", () => {
  const xml = manifest(WIDGET_MANIFEST);
  it("declares exactly what the widget code calls", () => {
    const declared = accessedApis(xml);
    for (const [category, uses] of Object.entries(CATEGORY_USES)) {
      const used = uses.test(widgetCode);
      expect(declared.has(category), `${category} widget declared vs used`).toBe(used);
      if (used)
        expect(declared.get(category)?.slice().sort()).toEqual(
          allowedReasons(category, widgetCode)!.slice().sort(),
        );
    }
  });
  it("collects nothing and does not track", () => {
    expect(collectedTypes(xml)).toEqual([]);
    expect(xml).toMatch(/<key>NSPrivacyTracking<\/key>\s*<false\/>/);
  });
});

describe("app privacy manifest: collected data types (match the App Store Connect App Privacy answers)", () => {
  const xml = manifest(APP_MANIFEST);
  const types = collectedTypes(xml);

  it("declares exactly the expected collected data types", () => {
    expect(types.map((t) => t.type).sort()).toEqual(Object.keys(EXPECTED_COLLECTED).sort());
  });

  it("every type is linked to the user, never used for tracking, for app functionality only", () => {
    for (const t of types) {
      expect(t.linked, t.type).toBe(true);
      expect(t.tracking, t.type).toBe(false);
      expect(t.purposes, t.type).toEqual([APP_FUNCTIONALITY]);
    }
    expect(xml).toMatch(/<key>NSPrivacyTracking<\/key>\s*<false\/>/);
    expect(xml).toMatch(/<key>NSPrivacyTrackingDomains<\/key>\s*<array\/>/);
  });

  it("each declared type is still backed by code (a dead declaration is a wrong answer too)", () => {
    for (const [type, evidence] of Object.entries(EXPECTED_COLLECTED)) {
      expect(evidence.test(appCode), `${type}: no code evidence ${evidence}`).toBe(true);
    }
  });

  it("no code collects an undeclared category", () => {
    for (const [category, probe] of UNDECLARED_PROBES) {
      expect(
        probe.test(appCode) || probe.test(widgetCode),
        `${category}: code found; declare it (manifest + App Store Connect) first`,
      ).toBe(false);
    }
  });
});
