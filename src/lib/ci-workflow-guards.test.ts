import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const WF = path.join(process.cwd(), ".github", "workflows");
const read = (f: string) => fs.readFileSync(path.join(WF, f), "utf8");

/** Text of one top-level job (from `  name:` to the next two-space key). */
export function jobBlock(yml: string, job: string): string {
  const lines = yml.split(/\r?\n/);
  const start = lines.findIndex((l) => l === `  ${job}:`);
  if (start < 0) return "";
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^  [A-Za-z0-9_-]+:\s*$/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join("\n");
}

describe("types-fresh compares against this PR's migrations, not production", () => {
  const ci = read("ci.yml");
  const job = jobBlock(ci, "types-fresh");
  const code = job.replace(/^\s*#.*$/gm, "");

  it("keeps its required-check name and exists", () => {
    expect(job).not.toBe("");
  });
  it("starts a local stack and generates with --local", () => {
    expect(code).toMatch(/supabase start/);
    expect(code).toMatch(/gen types typescript --local/);
  });
  it("does not generate from the production project or need the access token", () => {
    expect(code).not.toMatch(/--project-id/);
    expect(code).not.toMatch(/SUPABASE_ACCESS_TOKEN/);
  });
  it("keeps postgres-meta (gen types --local needs it)", () => {
    const start = /supabase start[^\n]*/.exec(code)?.[0] ?? "";
    expect(start).not.toContain("postgres-meta");
  });
  it("asserts graphql_public is present (MCP-style output omits it)", () => {
    expect(code).toMatch(/grep -q "graphql_public"/);
  });
  it("is not a deploy-supabase dependency", () => {
    const deploy = jobBlock(ci, "deploy-supabase");
    const needs = /needs:\s*\[([^\]]*)\]/.exec(deploy)?.[1] ?? "";
    expect(needs).not.toContain("types-fresh");
    expect(needs).not.toContain("types-match-production");
  });
  it("pins Postgres 17 locally to match production", () => {
    const toml = fs.readFileSync(path.join(process.cwd(), "supabase", "config.toml"), "utf8");
    expect(toml).toMatch(/^\[db\][\s\S]*?^major_version\s*=\s*17\s*$/m);
  });
});

describe("types-match-production keeps the production comparison on main", () => {
  const job = jobBlock(read("ci.yml"), "types-match-production");
  it("runs only on push to main and generates from the project", () => {
    expect(job).toMatch(/github\.event_name == 'push'/);
    expect(job).toMatch(/--project-id qhcjpfbxfcltjbiuknyt/);
    expect(job).toMatch(/git diff --quiet/);
  });
});

describe("ios-release says what it did and fails on a missing upload", () => {
  const yml = read("ios-release.yml");
  it("gives the upload step an id and reads its outcome in a final always() step", () => {
    expect(yml).toMatch(/name: Upload to TestFlight[^\n]*\n\s+id: upload/);
    const tail = yml.slice(yml.indexOf("Summarize what this run did"));
    expect(tail).toMatch(/if: always\(\)/);
    expect(tail).toMatch(/steps\.upload\.outcome/);
    expect(tail).toContain("GITHUB_STEP_SUMMARY");
    expect(tail).toContain("exported only");
    expect(tail).toContain("uploaded build");
  });
  it("exits non-zero when an upload was requested but did not succeed", () => {
    const tail = yml.slice(yml.indexOf("Summarize what this run did"));
    const failBranch = /elif \[ "\$UPLOAD_REQUESTED" = "true" \][\s\S]*?exit 1/.exec(tail);
    expect(failBranch).not.toBeNull();
  });
  it("is the last step and does not print secrets", () => {
    const tail = yml.slice(yml.indexOf("Summarize what this run did"));
    expect(tail).not.toMatch(/secrets\./);
    expect(yml.lastIndexOf("      - name:")).toBe(yml.indexOf("      - name: Summarize what this run did"));
  });
});
