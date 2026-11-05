import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * scripts/check-revenuecat-resolution.sh runs after Xcode resolves the Swift packages (ci.yml ios-app-build and
 * ios-release.yml). A tag can be moved to different code, so the script checks the resolved commit of each pinned
 * package, not only its version number. Run here against a Package.resolved fixture (RC_RESOLVED_FILE).
 */
const RC_COMMIT = "e45bb84b726885492ce4e7ee94ddb252d171a205";
const SENTRY_COMMIT = "4bb2282661ee6ca2212aa01d19a1214394cd3c45";

function resolved(rc: { version: string; revision: string }, sentry: { version: string; revision: string }) {
  return {
    pins: [
      { identity: "purchases-ios", kind: "remoteSourceControl", state: rc },
      { identity: "sentry-cocoa", kind: "remoteSourceControl", state: sentry },
    ],
    version: 2,
  };
}

function run(body: unknown) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pins-"));
  const file = path.join(dir, "Package.resolved");
  fs.writeFileSync(file, JSON.stringify(body));
  return spawnSync("bash", ["scripts/check-revenuecat-resolution.sh"], {
    cwd: process.cwd(),
    env: { ...process.env, RC_RESOLVED_FILE: file },
    encoding: "utf8",
  });
}

describe("Swift package pins", () => {
  it("passes when both packages resolve to the pinned version and commit", () => {
    const r = run(
      resolved({ version: "5.92.0", revision: RC_COMMIT }, { version: "9.30.2", revision: SENTRY_COMMIT }),
    );
    expect(r.stderr + r.stdout).not.toMatch(/::error::/);
    expect(r.status).toBe(0);
  });

  it("fails when RevenueCat's version tag resolves to a different commit", () => {
    const r = run(
      resolved({ version: "5.92.0", revision: "0".repeat(40) }, { version: "9.30.2", revision: SENTRY_COMMIT }),
    );
    expect(r.status).not.toBe(0);
    expect(r.stdout + r.stderr).toMatch(/purchases-ios/);
  });

  it("fails when Sentry's version tag resolves to a different commit", () => {
    const r = run(
      resolved({ version: "5.92.0", revision: RC_COMMIT }, { version: "9.30.2", revision: "1".repeat(40) }),
    );
    expect(r.status).not.toBe(0);
    expect(r.stdout + r.stderr).toMatch(/sentry-cocoa/);
  });
});
