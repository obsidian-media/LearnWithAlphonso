import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ANALYTICS_EVENTS, ANALYTICS_PROPS } from "./analytics-events";

/**
 * Web, iOS and Android keep one analytics vocabulary each. This pins that the three lists agree, that the privacy
 * switches stay set in every SDK setup, and that the PostHog project key is never committed (the repo is public).
 */
const root = path.resolve(import.meta.dirname, "../..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8").replace(/\r\n/g, "\n");

const SWIFT_EVENTS = "ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/AnalyticsEvents.swift";
const KOTLIN_EVENTS =
  "android/LearnWithAlphonso/core/src/main/kotlin/com/obsidianmedia/learnwithalphonso/core/analytics/AnalyticsEvents.kt";
const SWIFT_APP = "ios/LearnWithAlphonso/Sources/Analytics.swift";
const KOTLIN_APP =
  "android/LearnWithAlphonso/app/src/main/java/com/obsidianmedia/learnwithalphonso/Analytics.kt";

function swiftEventNames(): string[] {
  const src = read(SWIFT_EVENTS);
  return [...src.matchAll(/^\s*case \w+ = "([a-z_]+)"$/gm)].map((m) => m[1]);
}

function kotlinEvents(): Map<string, string[]> {
  const src = read(KOTLIN_EVENTS);
  const body = src.slice(
    src.indexOf("enum class AnalyticsEvent"),
    src.indexOf("enum class PropertyKind"),
  );
  const out = new Map<string, string[]>();
  for (const m of body.matchAll(/^\s{4}[A-Z_]+\(\s*"([a-z_]+)",\s*((?:.|\n)*?)\),\n/gm)) {
    out.set(
      m[1],
      [...m[2].matchAll(/"([a-z_]+)" to PropertyKind/g)].map((k) => k[1]),
    );
  }
  return out;
}

describe("event-name parity", () => {
  const web = [...ANALYTICS_EVENTS];

  it("iOS lists exactly the web events, in the same order", () => {
    expect(swiftEventNames()).toEqual(web);
  });

  it("Android lists exactly the web events, in the same order", () => {
    expect([...kotlinEvents().keys()]).toEqual(web);
  });

  it("Android allows exactly the same properties per event as the web", () => {
    const kotlin = kotlinEvents();
    for (const event of ANALYTICS_EVENTS) {
      expect(kotlin.get(event)?.sort(), event).toEqual(Object.keys(ANALYTICS_PROPS[event]).sort());
    }
  });

  it("iOS allows exactly the same properties per event as the web", () => {
    const src = read(SWIFT_EVENTS);
    const block = src.slice(
      src.indexOf("public var allowedProperties"),
      src.indexOf("public enum AnalyticsProperties"),
    );
    const keys = new Set([...block.matchAll(/"([a-z_]+)": \./g)].map((m) => m[1]));
    const webKeys = new Set(Object.values(ANALYTICS_PROPS).flatMap((p) => Object.keys(p)));
    expect(keys).toEqual(webKeys);
  });

  it("no event carries a free-text property name", () => {
    const names = Object.values(ANALYTICS_PROPS).flatMap((p) => Object.keys(p));
    for (const name of names)
      expect(name).not.toMatch(/email|name|text|message|answer|chat|transcript|query/);
  });

  it("all three platforms use the same identifier rule", () => {
    const pattern = "^[A-Za-z0-9_.:+-]{1,64}$";
    expect(read("src/lib/analytics-events.ts")).toContain("/^[A-Za-z0-9_.:+-]{1,64}$/");
    expect(read(SWIFT_EVENTS)).toContain(`"${pattern}"`);
    expect(read(KOTLIN_EVENTS)).toContain(`"${pattern}"`);
  });
});

describe("privacy switches stay set", () => {
  it("web starts PostHog anonymous, without autocapture, replay, surveys or page views", () => {
    const src = read("src/lib/analytics.ts");
    for (const setting of [
      "autocapture: false",
      "capture_pageview: false",
      "disable_session_recording: true",
      "disable_surveys: true",
      "advanced_disable_flags: true",
      'persistence: "localStorage"',
    ]) {
      expect(src, setting).toContain(setting);
    }
    expect(src).not.toMatch(/\.identify\(|\.people\.|\.group\(/);
  });

  it("iOS starts PostHog with every automatic capture off and never identifies", () => {
    const src = read(SWIFT_APP);
    for (const setting of [
      "captureApplicationLifecycleEvents = false",
      "captureScreenViews = false",
      "captureElementInteractions = false",
      "enableSwizzling = false",
      "personProfiles = .never",
      "surveys = false",
    ]) {
      expect(src, setting).toContain(setting);
    }
    expect(src).not.toMatch(/\.identify\(|\.alias\(|\.group\(/);
  });

  it("Android starts PostHog with every automatic capture off and never identifies", () => {
    const src = read(KOTLIN_APP);
    for (const setting of [
      "captureApplicationLifecycleEvents = false",
      "captureDeepLinks = false",
      "captureScreenViews = false",
      "personProfiles = PersonProfiles.NEVER",
      "surveys = false",
    ]) {
      expect(src, setting).toContain(setting);
    }
    expect(src).not.toMatch(/PostHog\.(identify|alias|group)\(/);
  });

  it("every platform starts the SDK only through its opt-in tracker", () => {
    expect(read(SWIFT_APP)).toContain("tracker.resume(makeSink: makeSink)");
    expect(read(KOTLIN_APP)).toContain("created.resume(::makeSink)");
    expect(read("src/lib/analytics.ts")).toContain("if (!analyticsConsent()) return;");
  });
});

describe("the project key is injected, never committed", () => {
  it("no PostHog project key (phc_...) appears in any tracked source file", () => {
    const dirs = ["src", "ios", "android", ".github", "docs", "scripts", "supabase", "public"];
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
        const rel = path.posix.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (!["node_modules", "build", ".gradle", ".git", "Pods"].includes(entry.name)) walk(rel);
        } else if (
          /\.(ts|tsx|swift|kt|kts|yml|yaml|plist|xcprivacy|md|json|toml|properties|sh)$/.test(
            entry.name,
          )
        ) {
          if (/phc_[A-Za-z0-9]{20,}/.test(fs.readFileSync(path.join(root, rel), "utf8")))
            hits.push(rel);
        }
      }
    };
    for (const d of dirs) if (fs.existsSync(path.join(root, d))) walk(d);
    expect(hits).toEqual([]);
  });

  it("the release workflows inject the key from the POSTHOG_PROJECT_KEY secret", () => {
    expect(read(".github/workflows/ios-release.yml")).toContain(
      "POSTHOG_PROJECT_KEY: ${{ secrets.POSTHOG_PROJECT_KEY }}",
    );
    expect(read(".github/workflows/android-release.yml")).toContain(
      "POSTHOG_PROJECT_KEY: ${{ secrets.POSTHOG_PROJECT_KEY }}",
    );
    expect(read("ios/LearnWithAlphonso/Info.plist")).toMatch(
      /<key>PostHogKey<\/key>\s*<string><\/string>/,
    );
  });

  it("the PostHog SDKs are pinned to exact versions", () => {
    expect(read("ios/LearnWithAlphonso/project.yml")).toMatch(
      /PostHog:\n\s+url: https:\/\/github\.com\/PostHog\/posthog-ios\.git\n(?:\s+#.*\n)*\s+exactVersion: 3\.92\.2/,
    );
    expect(read("android/LearnWithAlphonso/gradle/libs.versions.toml")).toContain(
      'com.posthog:posthog-android", version = "3.73.1"',
    );
    expect(JSON.parse(read("package.json")).dependencies["posthog-js"]).toBe("1.441.2");
  });
});
