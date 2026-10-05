// @vitest-environment node
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * scripts/export-masked-env.sh reads KEY=VALUE lines on stdin and appends each
 * to $GITHUB_ENV after emitting `::add-mask::VALUE`.
 *
 * Why it exists (BACKLOG 0.0-aa): values appended to $GITHUB_ENV are NOT
 * secrets to GitHub, so a demo account's refresh token written there printed
 * in the clear in every later step's env dump of a PUBLIC repo's job log
 * (seen in run 36683940433). capture-app-store-screenshots.yml and
 * maestro-e2e.yml both appended mint-demo-session.ts's output straight to
 * $GITHUB_ENV; only the access token happened to be masked.
 */
const bash = spawnSync("bash", ["--version"]);
const hasBash = bash.status === 0;

function run(stdin: string) {
  const dir = mkdtempSync(join(tmpdir(), "masked-env-"));
  const envFile = join(dir, "github_env");
  writeFileSync(envFile, "");
  const result = spawnSync("bash", ["scripts/export-masked-env.sh"], {
    input: stdin,
    env: { ...process.env, GITHUB_ENV: envFile },
    encoding: "utf8",
  });
  return { ...result, envFile: readFileSync(envFile, "utf8") };
}

describe.skipIf(!hasBash)("scripts/export-masked-env.sh", () => {
  it("masks every value before it is written to GITHUB_ENV", () => {
    const r = run("UI_TEST_ACCESS_TOKEN=aaa.bbb.ccc\nUI_TEST_REFRESH_TOKEN=refresh-secret\n");
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("::add-mask::aaa.bbb.ccc");
    expect(r.stdout).toContain("::add-mask::refresh-secret");
  });

  it("writes every KEY=VALUE pair to GITHUB_ENV, unchanged", () => {
    const r = run("UI_TEST_USER_ID=u-123\nUI_TEST_REFRESH_TOKEN=refresh-secret\n");
    expect(r.envFile).toBe("UI_TEST_USER_ID=u-123\nUI_TEST_REFRESH_TOKEN=refresh-secret\n");
  });

  it("keeps '=' characters inside a value (base64 padding)", () => {
    const r = run("UI_TEST_REFRESH_TOKEN=abc==\n");
    expect(r.envFile).toBe("UI_TEST_REFRESH_TOKEN=abc==\n");
    expect(r.stdout).toContain("::add-mask::abc==");
  });

  it("never prints a secret on any line that is not a mask command", () => {
    // The whole point: the only place the value may appear in the job log is
    // inside ::add-mask::, which GitHub redacts from then on.
    const r = run("UI_TEST_REFRESH_TOKEN=refresh-secret\n");
    const leaked = r.stdout
      .split("\n")
      .filter((line) => line.includes("refresh-secret") && !line.startsWith("::add-mask::"));
    expect(leaked).toEqual([]);
    expect(r.stderr).not.toContain("refresh-secret");
  });

  it("does not mask an empty value (nothing to hide, and it would be a no-op mask)", () => {
    const r = run("UI_TEST_EXPIRES_AT=\nUI_TEST_USER_ID=u-1\n");
    expect(r.stdout).not.toMatch(/::add-mask::\s*$/m);
    expect(r.envFile).toBe("UI_TEST_EXPIRES_AT=\nUI_TEST_USER_ID=u-1\n");
  });

  it("ignores blank lines", () => {
    const r = run("\nUI_TEST_USER_ID=u-1\n\n");
    expect(r.envFile).toBe("UI_TEST_USER_ID=u-1\n");
  });

  it("fails loudly if GITHUB_ENV is not set, rather than leaking nowhere silently", () => {
    const r = spawnSync("bash", ["scripts/export-masked-env.sh"], {
      input: "K=v\n",
      env: { ...process.env, GITHUB_ENV: "" },
      encoding: "utf8",
    });
    expect(r.status).not.toBe(0);
    // It must be the script's own guard that fails (and before it masks or
    // writes anything), not bash tripping over a missing script or an empty
    // redirect target -- both of which would also exit non-zero.
    expect(r.stderr).toContain("GITHUB_ENV");
    expect(r.stdout).not.toContain("::add-mask::");
  });
});
