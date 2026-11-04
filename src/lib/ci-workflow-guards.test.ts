import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const WF = path.join(process.cwd(), ".github", "workflows");
const read = (f: string) => fs.readFileSync(path.join(WF, f), "utf8");

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
    const marker = "      - name: Summarize what this run did";
    expect(yml.lastIndexOf("      - name:")).toBe(yml.indexOf(marker));
  });
});
