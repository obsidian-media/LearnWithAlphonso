import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

// scripts/ sits outside tsconfig's include, so nothing type-checks it. A script that uses a name it never
// imported (upload-vocab-images.ts called keepPathsFromImages and planPrune without importing them) fails
// only when someone runs that branch by hand. This compiles every script and fails on unresolved names.
const SCRIPTS_DIR = path.resolve(__dirname, "../../scripts");
// "Cannot find name", "Cannot find name. Did you mean", "has no exported member", "Cannot find module".
const UNRESOLVED = new Set([2304, 2552, 2305, 2724, 2307]);

function scriptFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) return d.name === "node_modules" ? [] : scriptFiles(p);
    return /\.ts$/.test(d.name) && !/\.test\.ts$/.test(d.name) ? [p] : [];
  });
}

export function unresolvedNames(files: string[]): string[] {
  const program = ts.createProgram(files, {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    allowImportingTsExtensions: true,
    noEmit: true,
    skipLibCheck: true,
    types: ["node"],
  });
  return ts
    .getPreEmitDiagnostics(program)
    .filter(
      (d) => UNRESOLVED.has(d.code) && d.file && files.includes(path.normalize(d.file.fileName)),
    )
    .map((d) => {
      const { line } = d.file!.getLineAndCharacterOfPosition(d.start ?? 0);
      return `${path.relative(SCRIPTS_DIR, d.file!.fileName)}:${line + 1} ${ts.flattenDiagnosticMessageText(d.messageText, " ")}`;
    });
}

describe("scripts", () => {
  it("use no name they never import", () => {
    expect(unresolvedNames(scriptFiles(SCRIPTS_DIR))).toEqual([]);
  }, 120_000);
});
