import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Source guards for iOS crash reporting (Sentry). The app target only compiles in CI on macOS, so these read the
 * Swift source: the SDK is started, early, in release builds only, with the privacy settings the App Store
 * privacy answers and the privacy policy promise.
 */
const root = path.resolve(import.meta.dirname, "../..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8").replace(/\r\n/g, "\n");
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"\\])\/\/.*$/gm, "$1");

const IOS_DSN =
  "https://7d3d682330a5a32778ff2d60788534f3@o4511662373273600.ingest.us.sentry.io/4512372763328514";
const crash = stripComments(read("ios/LearnWithAlphonso/Sources/CrashReporting.swift"));
const app = stripComments(read("ios/LearnWithAlphonso/Sources/LearnWithAlphonsoApp.swift"));
const yml = read("ios/LearnWithAlphonso/project.yml");

describe("iOS Sentry start-up", () => {
  it("starts the SDK, and does so as the first statement of the app's init", () => {
    expect(crash).toMatch(/SentrySDK\.start\s*\{/);
    expect(app).toMatch(/init\(\)\s*\{\s*CrashReporting\.start\(\)/);
  });

  it("only starts in release builds", () => {
    const start = crash.indexOf("SentrySDK.start");
    expect(crash.slice(0, start)).toMatch(/#if DEBUG\s*return\s*#else\s*$/);
    expect(crash.slice(start)).toMatch(/#endif/);
  });

  it("uses the public iOS project DSN and no other", () => {
    expect(crash).toContain(`static let dsn = "${IOS_DSN}"`);
    expect(crash.match(/https:\/\/[^"\s]*sentry\.io[^"\s]*/g)).toEqual([IOS_DSN]);
    // Ends in a numeric project id, i.e. a DSN, never an auth token (sntrys_/sntryu_) or secret key.
    expect(crash).not.toMatch(/sntry[su]_/);
  });
});

describe("iOS Sentry privacy settings", () => {
  const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const off = (setting: string) =>
    expect(crash, `${setting} must be explicitly off`).toMatch(
      new RegExp(`options\\.${escapeRegExp(setting)}\\s*=\\s*(false|0)\\b`),
    );

  it("sends no default PII", () => off("sendDefaultPii"));
  it("attaches no screenshot", () => off("attachScreenshot"));
  it("attaches no view hierarchy", () => off("attachViewHierarchy"));
  it("records no session replay", () => {
    off("sessionReplay.sessionSampleRate");
    off("sessionReplay.onErrorSampleRate");
  });
  it("does no tracing, network breadcrumbs or failed-request capture", () => {
    off("tracesSampleRate");
    off("enableNetworkBreadcrumbs");
    off("enableCaptureFailedRequests");
  });
  it("never turns any of those on", () => {
    expect(crash).not.toMatch(
      /(sendDefaultPii|attachScreenshot|attachViewHierarchy|enableNetworkBreadcrumbs|enableCaptureFailedRequests)\s*=\s*true/,
    );
    expect(crash).not.toMatch(/(sessionSampleRate|onErrorSampleRate)\s*=\s*(?!0\b)[0-9.]/);
    expect(crash).not.toMatch(/tracesSampleRate\s*=\s*(?!0\b)[0-9.]/);
    expect(crash).not.toMatch(
      /\b(enableAppLaunchProfiling|profilesSampleRate|configureProfiling)\b/,
    );
    expect(crash).not.toMatch(/SentryReplay|SentryFeedback|userFeedback/i);
  });

  it("scrubs events and breadcrumbs before sending", () => {
    expect(crash).toMatch(/options\.beforeSend\s*=\s*\{[^}]*scrub\(event\)/);
    expect(crash).toMatch(/options\.beforeBreadcrumb\s*=/);
    expect(crash).toMatch(/event\.user\s*=\s*nil/);
    expect(crash).toMatch(/eyJ/); // JWT pattern
    expect(crash).toMatch(/bearer/i);
    expect(crash).toMatch(/@\[A-Za-z0-9-\]\+/); // email pattern
  });
});

describe("iOS Sentry package pin", () => {
  const block = yml.match(/^ {2}Sentry:\n((?: {4}.*\n)+)/m)?.[1] ?? "";
  it("is one exact version from the official repo, linked to the app target", () => {
    expect(block).toMatch(/^ {4}url: https:\/\/github\.com\/getsentry\/sentry-cocoa\.git$/m);
    expect(block).toMatch(/^ {4}exactVersion: "?9\.30\.2"?$/m);
    expect(block).not.toMatch(/^ {4}(from|minorVersion|majorVersion|branch|revision|minVersion):/m);
    expect(yml).toMatch(
      /dependencies:\n\s+- package: LearnWithAlphonsoKit\n\s+- package: RevenueCat\n\s+- package: Sentry\n/,
    );
  });
  it("is not linked into the widget", () => {
    const widget = yml.slice(yml.indexOf("LearnWithAlphonsoWidget:\n    type:"));
    expect(widget).not.toContain("package: Sentry");
  });
});

describe("iOS Sentry stable identifiers and URL/key scrubbing", () => {
  it("removes the per-install app hash and device identifiers from the event contexts", () => {
    expect(crash).toMatch(/"device_app_hash"/);
    expect(crash).toMatch(/"device_unique_identifier"/);
    expect(crash).toMatch(/event\.serverName\s*=\s*nil/);
    expect(crash).toMatch(/event\.context/);
  });

  it("scrubs sensitive URL parameters, secret key formats and UUIDs like the web does", () => {
    expect(crash).toMatch(/access_token\|refresh_token/);
    expect(crash).toMatch(/sb_secret\|sb_publishable\|sk_live/);
    expect(crash).toMatch(/\[0-9a-fA-F\]\{8\}-/); // UUID
  });
});
