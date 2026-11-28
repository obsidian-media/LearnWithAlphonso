// @vitest-environment node
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isSkippablePath, shouldBuild, SKIP_PREFIXES } from "./vercel-ignore-build";

describe("shouldBuild", () => {
  it("skips every preview (non-production) build, whatever changed", () => {
    expect(shouldBuild({ env: "preview", changedFiles: ["src/app.tsx"] }).build).toBe(false);
    expect(shouldBuild({ env: "preview", changedFiles: null }).build).toBe(false);
    expect(shouldBuild({ env: undefined, changedFiles: ["src/app.tsx"] }).build).toBe(false);
    expect(shouldBuild({ env: "development", changedFiles: [] }).build).toBe(false);
  });

  it("skips production when only native files changed", () => {
    const d = shouldBuild({
      env: "production",
      changedFiles: ["ios/App/Foo.swift", "android/app/build.gradle.kts"],
    });
    expect(d.build).toBe(false);
  });

  it("skips production for docs, root markdown, CI, agent config and Supabase migrations/functions", () => {
    const d = shouldBuild({
      env: "production",
      changedFiles: [
        "docs/ENV-SETUP.md",
        "README.md",
        ".github/workflows/ci.yml",
        ".claude/settings.json",
        "supabase/migrations/20261127000000_x.sql",
        "supabase/functions/hector/index.ts",
      ],
    });
    expect(d.build).toBe(false);
  });

  it("builds production when a src/ file changed", () => {
    const d = shouldBuild({ env: "production", changedFiles: ["ios/A.swift", "src/lib/x.ts"] });
    expect(d.build).toBe(true);
    expect(d.reason).toContain("src/lib/x.ts");
  });

  it("builds production when dependencies or config changed", () => {
    expect(shouldBuild({ env: "production", changedFiles: ["package.json"] }).build).toBe(true);
    expect(shouldBuild({ env: "production", changedFiles: ["bun.lock"] }).build).toBe(true);
    expect(shouldBuild({ env: "production", changedFiles: ["vercel.json"] }).build).toBe(true);
    expect(shouldBuild({ env: "production", changedFiles: ["admin/routes/x.tsx"] }).build).toBe(
      true,
    );
    expect(shouldBuild({ env: "production", changedFiles: ["public/og-image.png"] }).build).toBe(
      true,
    );
    expect(shouldBuild({ env: "production", changedFiles: ["supabase/config.toml"] }).build).toBe(
      true,
    );
  });

  it("builds production when the file list is unknown (fail safe)", () => {
    expect(shouldBuild({ env: "production", changedFiles: null }).build).toBe(true);
    expect(shouldBuild({ env: "production", changedFiles: undefined }).build).toBe(true);
    expect(shouldBuild({ env: "production", changedFiles: [] }).build).toBe(true);
  });

  it("builds production for a mix of docs and src", () => {
    expect(
      shouldBuild({ env: "production", changedFiles: ["docs/operations.md", "src/routes/a.tsx"] })
        .build,
    ).toBe(true);
  });

  it("only treats markdown at the repo root as skippable, not markdown elsewhere", () => {
    expect(isSkippablePath("CHANGELOG.md")).toBe(true);
    expect(isSkippablePath("src/data/grader-words/README.md")).toBe(false);
    expect(isSkippablePath("public/notes.md")).toBe(false);
    // A look-alike directory name must not match a prefix.
    expect(isSkippablePath("ios-notes/x.ts")).toBe(false);
    expect(isSkippablePath("docsy/x.ts")).toBe(false);
  });
});

const ROOT = path.resolve(__dirname, "../..");
const SCRIPT_PATH = path.join(ROOT, "scripts/vercel-ignore-build.sh");

describe("scripts/vercel-ignore-build.sh parity", () => {
  const script = readFileSync(SCRIPT_PATH, "utf8");

  it("carries exactly the skip list of src/lib/vercel-ignore-build.ts", () => {
    const m = script.match(/^SKIP_PREFIXES="([^"]*)"$/m);
    expect(m).not.toBeNull();
    expect((m?.[1] ?? "").split(/\s+/).filter(Boolean)).toEqual([...SKIP_PREFIXES]);
  });

  it("is wired into vercel.json as the ignoreCommand", () => {
    const vercel = JSON.parse(readFileSync(path.join(ROOT, "vercel.json"), "utf8"));
    expect(vercel.ignoreCommand).toBe("sh scripts/vercel-ignore-build.sh");
  });
});

const hasSh = spawnSync("sh", ["-c", "exit 0"]).status === 0;
const hasGit = spawnSync("git", ["--version"]).status === 0;

describe.skipIf(!hasSh || !hasGit)("scripts/vercel-ignore-build.sh behaviour", () => {
  function git(cwd: string, ...args: string[]): string {
    const r = spawnSync("git", args, { cwd, encoding: "utf8" });
    if (r.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${r.stderr}`);
    return r.stdout.trim();
  }

  /** A repo with a base commit and a second commit touching `files`; returns both shas. */
  function makeRepo(files: string[]) {
    const dir = mkdtempSync(path.join(tmpdir(), "vercel-ignore-"));
    git(dir, "init", "-q");
    git(dir, "config", "user.email", "t@example.com");
    git(dir, "config", "user.name", "t");
    git(dir, "config", "commit.gpgsign", "false");
    writeFileSync(path.join(dir, "base.txt"), "base");
    git(dir, "add", "-A");
    git(dir, "commit", "-q", "-m", "base");
    const previous = git(dir, "rev-parse", "HEAD");
    for (const f of files) {
      mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
      writeFileSync(path.join(dir, f), "x");
    }
    git(dir, "add", "-A");
    git(dir, "commit", "-q", "-m", "change");
    return { dir, previous, head: git(dir, "rev-parse", "HEAD") };
  }

  function runScript(dir: string, env: Record<string, string>) {
    const r = spawnSync("sh", [SCRIPT_PATH], {
      cwd: dir,
      encoding: "utf8",
      env: { PATH: process.env.PATH ?? "", ...env },
    });
    return { code: r.status, out: r.stdout.trim() };
  }

  function check(
    files: string[],
    env: (r: { previous: string; head: string }) => Record<string, string>,
  ) {
    const repo = makeRepo(files);
    try {
      return runScript(repo.dir, env(repo));
    } finally {
      rmSync(repo.dir, { recursive: true, force: true });
    }
  }

  const prod = (r: { previous: string; head: string }) => ({
    VERCEL_ENV: "production",
    VERCEL_GIT_PREVIOUS_SHA: r.previous,
    VERCEL_GIT_COMMIT_SHA: r.head,
  });

  it("skips a preview build (exit 0)", () => {
    const r = check(["src/x.ts"], (s) => ({ ...prod(s), VERCEL_ENV: "preview" }));
    expect(r.code).toBe(0);
    expect(r.out).toContain("not production");
  });

  it("skips a production build that only changed ios/ and docs/ (exit 0)", () => {
    const r = check(["ios/App/A.swift", "docs/x.md", "README.md"], prod);
    expect(r.code).toBe(0);
  });

  it("builds a production build that changed src/ (exit 1)", () => {
    const r = check(["ios/App/A.swift", "src/lib/x.ts"], prod);
    expect(r.code).toBe(1);
    expect(r.out).toContain("src/lib/x.ts");
  });

  it("builds when package.json or bun.lock changed (exit 1)", () => {
    expect(check(["package.json"], prod).code).toBe(1);
    expect(check(["bun.lock"], prod).code).toBe(1);
  });

  it("builds a production build with no previous sha (exit 1)", () => {
    const r = check(["ios/App/A.swift"], (s) => ({ ...prod(s), VERCEL_GIT_PREVIOUS_SHA: "" }));
    expect(r.code).toBe(1);
    expect(r.out).toContain("no previous deployed commit");
  });

  it("builds when git diff fails, e.g. the previous commit is not in a shallow clone (exit 1)", () => {
    const r = check(["ios/App/A.swift"], (s) => ({
      ...prod(s),
      VERCEL_GIT_PREVIOUS_SHA: "0123456789abcdef0123456789abcdef01234567",
    }));
    expect(r.code).toBe(1);
    expect(r.out).toContain("git diff failed");
  });

  it("decides the same as shouldBuild for the same file lists", () => {
    const cases = [
      ["ios/A.swift"],
      ["android/app/x.kt", "supabase/migrations/1.sql"],
      ["supabase/config.toml"],
      ["docs/a.md", "src/a.ts"],
      ["notes/readme.md"],
      ["ios-notes/x.ts"],
    ];
    for (const files of cases) {
      const viaScript = check(files, prod).code === 1;
      expect(viaScript, files.join(",")).toBe(
        shouldBuild({ env: "production", changedFiles: files }).build,
      );
    }
  });
});
