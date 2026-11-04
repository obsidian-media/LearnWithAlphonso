import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const YML = fs.readFileSync(
  path.join(process.cwd(), ".github", "workflows", "ios-release.yml"),
  "utf8",
);
const MARKER = "      - name: Summarize what this run did";

/** The `run: |` script of the summary step, de-indented. */
function summaryScript(): string {
  const lines = YML.slice(YML.indexOf(MARKER)).split(/\r?\n/);
  const at = lines.findIndex((l) => /^\s+run: \|\s*$/.test(l));
  expect(at).toBeGreaterThan(0);
  const body: string[] = [];
  for (const l of lines.slice(at + 1)) {
    if (l.trim() !== "" && l.length - l.trimStart().length <= 8) break;
    body.push(l.slice(10));
  }
  return body.join("\n");
}

type Env = { req: string; upload: string; exp: string; job: string };
function run(e: Env) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "iosrel-"));
  fs.mkdirSync(path.join(dir, "ios", "LearnWithAlphonso"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "ios", "LearnWithAlphonso", "project.yml"),
    '# CURRENT_PROJECT_VERSION: "1" in a comment\n  settings:\n    CURRENT_PROJECT_VERSION: "54"\n',
  );
  const summary = path.join(dir, "summary.md");
  fs.writeFileSync(summary, "");
  const r = spawnSync("bash", ["-c", summaryScript()], {
    cwd: dir,
    encoding: "utf8",
    env: {
      PATH: process.env.PATH,
      GITHUB_STEP_SUMMARY: summary,
      UPLOAD_REQUESTED: e.req,
      UPLOAD_OUTCOME: e.upload,
      EXPORT_OUTCOME: e.exp,
      JOB_STATUS: e.job,
    },
  });
  const text = fs.readFileSync(summary, "utf8");
  fs.rmSync(dir, { recursive: true, force: true });
  return { code: r.status, text };
}

describe("ios-release summary step, executed", () => {
  it("is the last step, whatever kind of step follows", () => {
    const after = YML.slice(YML.indexOf(MARKER) + MARKER.length);
    expect(after).not.toMatch(/^\s{6}- /m);
    expect(summaryScript()).not.toMatch(/secrets\./);
  });

  it("upload requested + upload success: exit 0, names the build from the real key", () => {
    const r = run({ req: "true", upload: "success", exp: "success", job: "success" });
    expect(r.code).toBe(0);
    expect(r.text).toContain("uploaded build 54 to TestFlight");
  });

  for (const upload of ["failure", "skipped", "cancelled", ""]) {
    for (const job of ["failure", "cancelled", "success"]) {
      it(`upload requested, upload step '${upload}', job ${job}: fails`, () => {
        const r = run({ req: "true", upload, exp: "success", job });
        expect(r.code).toBe(1);
        expect(r.text).not.toContain("uploaded build");
        expect(r.text).not.toContain("exported only");
      });
    }
  }

  it("cancelled with an empty outcome says cancelled before upload", () => {
    const r = run({ req: "true", upload: "", exp: "success", job: "cancelled" });
    expect(r.text).toContain("cancelled before upload");
    expect(r.text).not.toContain("skipped");
  });

  for (const upload of ["success", "failure", "skipped", "cancelled", ""]) {
    it(`upload not requested (upload step '${upload}'), export ok: exit 0, exported only`, () => {
      const r = run({ req: "false", upload, exp: "success", job: "success" });
      expect(r.code).toBe(0);
      expect(r.text).toContain("exported only");
      expect(r.text).not.toContain("uploaded build");
    });
  }

  for (const exp of ["failure", "skipped", "cancelled", ""]) {
    it(`upload not requested but export '${exp}': does not claim exported only, fails`, () => {
      const r = run({ req: "false", upload: "", exp, job: "failure" });
      expect(r.code).toBe(1);
      expect(r.text).not.toContain("exported only");
    });
  }
});
