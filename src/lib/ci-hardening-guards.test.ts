import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// js-yaml is already installed (through eslint); required untyped so no new dependency or type package is needed.
const { load: parseYaml } = createRequire(import.meta.url)("js-yaml") as {
  load: (text: string) => unknown;
};

/**
 * Guards on how CI handles code and secrets. Each one names the property it holds; see docs/security.md.
 * GUARD_ROOT lets the same checks run against another tree (for example an export of an older commit).
 */
const ROOT = process.env.GUARD_ROOT ?? process.cwd();
const WF_DIR = path.join(ROOT, ".github", "workflows");
const workflows = fs
  .readdirSync(WF_DIR)
  .filter((f) => f.endsWith(".yml"))
  .map((f) => ({ file: f, text: fs.readFileSync(path.join(WF_DIR, f), "utf8") }));

type Step = {
  name?: string;
  uses?: string;
  run?: string;
  with?: Record<string, unknown>;
  env?: Record<string, string>;
};
type Job = { environment?: unknown; steps?: Step[]; [k: string]: unknown };
const parsed = workflows.map((w) => ({
  ...w,
  doc: parseYaml(w.text) as { on?: unknown; permissions?: unknown; jobs: Record<string, Job> },
}));
const codeLines = (text: string) => text.split(/\r?\n/).filter((l) => !/^\s*#/.test(l));
const triggers = (on: unknown): string[] =>
  typeof on === "string" ? [on] : Array.isArray(on) ? on : Object.keys(on as object);

describe("CI runs only locked, verified code next to secrets", () => {
  it("no workflow fetches tsx at run time (bunx/npx tsx skips the lockfile)", () => {
    const hits = workflows.flatMap((w) =>
      codeLines(w.text)
        .filter((l) => /\b(bunx|npx)\s+tsx\b/.test(l))
        .map((l) => `${w.file}: ${l.trim()}`),
    );
    expect(hits).toEqual([]);
  });

  it("every action is pinned to a full commit SHA", () => {
    const loose = workflows.flatMap((w) =>
      codeLines(w.text)
        .map((l) => /^\s*-?\s*uses:\s*(\S+)/.exec(l)?.[1])
        .filter((u): u is string => !!u && !u.startsWith("./") && !/@[0-9a-f]{40}$/.test(u))
        .map((u) => `${w.file}: ${u}`),
    );
    expect(loose).toEqual([]);
  });

  it("XcodeGen comes from the pinned, checksummed installer, not Homebrew", () => {
    const brew = workflows.filter((w) =>
      codeLines(w.text).some((l) => /brew install xcodegen/.test(l)),
    );
    expect(brew.map((w) => w.file)).toEqual([]);
    const script = fs.readFileSync(path.join(ROOT, "scripts", "install-xcodegen.sh"), "utf8");
    expect(script).toMatch(/XCODEGEN_SHA256="[0-9a-f]{64}"/);
    expect(script).toMatch(/shasum -a 256 -c/);
  });

  it("the Android release checks bundletool's checksum and removes the keystore before downloading it", () => {
    const rel = parsed.find((w) => w.file === "android-release.yml")!;
    const steps = rel.doc.jobs.bundle.steps!;
    const removeAt = steps.findIndex(
      (s) => /rm -f "\$RUNNER_TEMP\/upload\.jks"/.test(s.run ?? "") && !s.name?.includes("decoded"),
    );
    const downloadAt = steps.findIndex((s) => /bundletool\.jar/.test(s.run ?? ""));
    expect(removeAt).toBeGreaterThan(-1);
    expect(removeAt).toBeLessThan(downloadAt);
    expect(steps[downloadAt].run).toMatch(/sha256sum -c/);
    expect(String(steps[downloadAt].env?.BUNDLETOOL_SHA256)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("bunfig exempts no package from the 24-hour release-age guard", () => {
    const bunfig = fs.readFileSync(path.join(ROOT, "bunfig.toml"), "utf8");
    expect(bunfig).toMatch(/minimumReleaseAge = 86400/);
    expect(codeLines(bunfig).join("\n")).not.toMatch(/minimumReleaseAgeExcludes\s*=\s*\[\s*"/);
  });

  it("dependency advisories are checked on every PR and push", () => {
    const ci = parsed.find((w) => w.file === "ci.yml")!;
    const audit = Object.values(ci.doc.jobs).find((j) =>
      (j.steps ?? []).some((s) => /bun audit --audit-level=high/.test(s.run ?? "")),
    );
    expect(audit).toBeDefined();
  });
});

describe("tokens and secrets are scoped", () => {
  it("every workflow states its token permissions", () => {
    expect(parsed.filter((w) => w.doc.permissions === undefined).map((w) => w.file)).toEqual([]);
  });

  it("the types workflow checks out without credentials and loads the deploy key only to push", () => {
    const wf = parsed.find((w) => w.file === "regenerate-supabase-types.yml")!;
    const steps = wf.doc.jobs.regenerate.steps!;
    const checkout = steps.find((s) => s.uses?.startsWith("actions/checkout@"))!;
    expect(checkout.with?.["persist-credentials"]).toBe(false);
    expect(checkout.with?.["ssh-key"]).toBeUndefined();
    const withKey = steps.filter((s) => JSON.stringify(s).includes("TYPES_REGEN_DEPLOY_KEY"));
    expect(withKey).toHaveLength(1);
    expect(withKey[0].run).toMatch(/git push/);
    expect(withKey[0].run).toMatch(/"\$GITHUB_REF_NAME" != "main"/);
    expect(wf.doc.permissions).toEqual({ contents: "read" });
  });

  it("every manually run job that uses secrets runs in a named environment, and so does the production deploy", () => {
    const missing: string[] = [];
    for (const w of parsed) {
      const t = triggers(w.doc.on);
      const manualOnly = t.every((x) => x === "workflow_dispatch" || x === "schedule");
      for (const [name, job] of Object.entries(w.doc.jobs)) {
        // The RevenueCat SDK key ships inside every app binary, so it is public by design.
        const usesSecrets = /secrets\.(?!GITHUB_TOKEN|REVENUECAT_API_KEY)[A-Z]/.test(
          JSON.stringify(job),
        );
        const isDeploy = w.file === "ci.yml" && name === "deploy-supabase";
        if ((manualOnly && usesSecrets) || isDeploy) {
          if (typeof job.environment !== "string" || !job.environment)
            missing.push(`${w.file}:${name}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it("only jobs in the production-supabase environment read the Supabase account token", () => {
    const outside: string[] = [];
    for (const w of parsed) {
      for (const [name, job] of Object.entries(w.doc.jobs)) {
        if (!/secrets\.(SUPABASE_ACCESS_TOKEN|SUPABASE_DB_PASSWORD)\b/.test(JSON.stringify(job)))
          continue;
        if (job.environment !== "production-supabase") outside.push(`${w.file}:${name}`);
      }
    }
    expect(outside).toEqual([]);
  });

  it("binary builds stay downloadable for one day at most", () => {
    const long: string[] = [];
    for (const w of parsed) {
      for (const [name, job] of Object.entries(w.doc.jobs)) {
        for (const s of job.steps ?? []) {
          if (!s.uses?.startsWith("actions/upload-artifact@")) continue;
          const p = String(s.with?.path ?? "");
          if (!/\.(ipa|aab|apk)\b|simulator\.zip/.test(p)) continue;
          if (s.with?.["retention-days"] !== 1) long.push(`${w.file}:${name}:${p}`);
        }
      }
    }
    expect(long).toEqual([]);
  });

  it("signing material can never be staged by a broad git add", () => {
    const names = [
      "AuthKey_ABC.p8",
      "dist.p12",
      "app.mobileprovision",
      "private_keys/AuthKey_X.p8",
      "upload.jks",
    ];
    const r = spawnSync("git", ["check-ignore", "--no-index", ...names], {
      cwd: ROOT,
      encoding: "utf8",
    });
    expect(r.stdout.trim().split(/\r?\n/).sort()).toEqual([...names].sort());
  });
});
