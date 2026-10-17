import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { findLefffLeak } from "./lefff-markers";
import { scanBuildOutput } from "./lefff-scan";
import { REPO_ROOT } from "./romance-bank.testutil";

/**
 * Gate 9, built-bundle half. A real build rewrites the lexicon: keys lose
 * their quotes and strings become backticks, so a check for the original JSON
 * text passed while 6 MB of data shipped. These fixtures are shaped like what
 * the bundler actually emits. Words are assembled from pieces so this file
 * does not itself contain a marker.
 */
const row = (q: string) =>
  ["sui" + "s", "sui" + "s", "sui" + "t", "suiv" + "ons", "suiv" + "ez", "suiv" + "ent"]
    .map((w) => `${q}${w}${q}`)
    .join(",");
const subjunctive = (q: string) =>
  ["suiv" + "e", "suiv" + "es", "suiv" + "e", "suiv" + "ions", "suiv" + "iez", "suiv" + "ent"]
    .map((w) => `${q}${w}${q}`)
    .join(",");

describe("findLefffLeak", () => {
  it("finds the lexicon however the bundler quoted it", () => {
    const fixtures = {
      "minified, backtick strings, bare keys": `var a={suivre:{P:[${row("`")}],S:[${subjunctive("`")}]}};`,
      "minified, single quotes": `var a={suivre:{P:[${row("'")}],S:[${subjunctive("'")}]}};`,
      "original JSON, double quotes": `{"suivre":{"P":[${row('"')}],"S":[${subjunctive('"')}]}}`,
      "spaces after commas": `x=[${row("`").replace(/,/g, ", ")}]`,
    };
    for (const [name, text] of Object.entries(fixtures))
      expect(findLefffLeak(text), name).not.toBeNull();
  });

  it("finds the real lexicon after a bundler-style rewrite", () => {
    const real = readFileSync(
      path.join(REPO_ROOT, "node_modules/french-verbs-lefff/dist/conjugations.json"),
      "utf8",
    );
    const minified = real.replace(/"([A-Za-z]+)":/g, "$1:").replace(/"/g, "`");
    expect(findLefffLeak(minified)).not.toBeNull();
  });

  it("leaves ordinary code, and our own few verb tables, alone", () => {
    const clean = [
      "var a=[`je`,`tu`,`il`],b={P:[1,2],Q:[3]};",
      `present: ["mange", "manges", "mange", "mangeons", "mangez", "mangent"]`,
      "export const x = { suivre: 1 }; // a word is not a row",
    ].join("\n");
    expect(findLefffLeak(clean)).toBeNull();
  });
});

describe("scanBuildOutput", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });
  const makeBuild = (assets: Record<string, string>) => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), "bundle-"));
    dirs.push(cwd);
    const out = path.join(cwd, ".output", "public", "assets");
    mkdirSync(out, { recursive: true });
    for (const [name, text] of Object.entries(assets)) writeFileSync(path.join(out, name), text);
    return cwd;
  };

  it("fails on a minified bundle that contains the lexicon", () => {
    const leaked = `var a={suivre:{P:[${row("`")}],S:[${subjunctive("`")}]}};export{a};`;
    const result = scanBuildOutput(makeBuild({ "index-abc.js": leaked, "app.css": "a{b:c}" }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("leak");
      expect(result.offenders[0]).toContain("index-abc.js");
    }
  });

  it("passes on a clean bundle", () => {
    const result = scanBuildOutput(makeBuild({ "index-abc.js": "var a=[`x`,`y`];export{a};" }));
    expect(result).toEqual({ ok: true, scanned: 1 });
  });

  it("cannot pass by scanning nothing", () => {
    const empty = mkdtempSync(path.join(os.tmpdir(), "bundle-"));
    dirs.push(empty);
    expect(scanBuildOutput(empty)).toMatchObject({ ok: false, reason: "no-output" });
    const noFiles = makeBuild({ "logo.png": "binary" });
    expect(scanBuildOutput(noFiles)).toMatchObject({ ok: false, reason: "nothing-scanned" });
  });
});
