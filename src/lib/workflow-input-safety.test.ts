import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const WORKFLOWS = path.join(process.cwd(), ".github", "workflows");
const files = fs.readdirSync(WORKFLOWS).filter((f) => f.endsWith(".yml"));
const read = (file: string) => fs.readFileSync(path.join(WORKFLOWS, file), "utf8");

/** The text of every `run:` step in a workflow, inline or block. */
export function runBlocks(yml: string): string[] {
  const lines = yml.split(/\r?\n/);
  const blocks: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = /^(\s*)(-\s+)?run:\s*(.*)$/.exec(lines[i]);
    if (!m) continue;
    const indent = m[1].length + (m[2] ? m[2].length : 0);
    const body = [m[3]];
    if (/^[|>][-+]?$/.test(m[3].trim())) {
      body.length = 0;
      for (let j = i + 1; j < lines.length; j++) {
        const next = lines[j];
        if (next.trim() !== "" && next.length - next.trimStart().length <= indent) break;
        body.push(next);
      }
    }
    blocks.push(body.join("\n"));
  }
  return blocks;
}

// A dispatch input expanded into a shell line is script injection for whoever can dispatch, and breaks on
// spaces. Inputs reach the shell through env: and a quoted variable instead.
const INPUT_IN_RUN = /\$\{\{\s*(github\.event\.)?inputs\./;

describe("workflow inputs never reach a run: script directly", () => {
  it("scans every workflow", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it("finds run blocks (the scanner is not blind)", () => {
    expect(
      runBlocks("steps:\n  - run: echo hi\n  - run: |\n      a\n      b\n    name: x\n"),
    ).toEqual(["echo hi", "      a\n      b"]);
  });

  for (const file of files) {
    it(`${file} has no \${{ inputs.* }} inside a run: block`, () => {
      for (const block of runBlocks(read(file))) expect(block).not.toMatch(INPUT_IN_RUN);
    });
  }
});

describe("asc-release-ops workflow", () => {
  const yml = read("asc-release-ops.yml");
  const run = runBlocks(yml).find((b) => b.includes("asc-release-ops.ts")) ?? "";

  it("passes every input as a quoted shell variable", () => {
    expect(run).toContain('"$COMMAND"');
    expect(run).toContain('"$ARG"');
    expect(run).toContain('"$APPLY_FLAG"');
  });

  it("gets the apply flag only from the apply input", () => {
    expect(yml).toMatch(/APPLY_FLAG: \$\{\{ inputs\.apply && '--apply' \|\| '' \}\}/);
  });

  it("tells the operator when expiring builds is allowed", () => {
    expect(yml).toMatch(/run only after the build 49 to 50 upgrade test has passed/);
  });
});
