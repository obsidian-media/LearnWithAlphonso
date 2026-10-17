import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LEFFF_MARKERS, LEFFF_ROW_LIMIT, LEFFF_ROW_SHAPE } from "./lefff-markers";
import { REPO_ROOT } from "./romance-bank.testutil";

/**
 * Gate 9: the conjugation libraries are a DEV tool. french-verbs-lefff ships
 * 6 MB of LGPL-LR data; if anything outside the one test helper imported it,
 * it would land in the web bundle.
 */
const LIBS = ["french-verbs", "french-verbs-lefff", "spanish-verbs"];
const ONLY_IMPORTER = "src/data/generative/romance-libs.testutil.ts";

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".git") continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const rel = (f: string) => path.relative(REPO_ROOT, f).split(path.sep).join("/");

/** Static import, export-from, dynamic import() and require() of any of the libraries. */
export function importsLibrary(source: string): string | null {
  for (const lib of LIBS) {
    const q = `["'\`]${lib.replace(/-/g, "\\-")}(?:/[^"'\`]*)?["'\`]`;
    const patterns = [
      new RegExp(`\\bfrom\\s*${q}`),
      new RegExp(`\\bimport\\s*${q}`),
      new RegExp(`\\bimport\\s*\\(\\s*${q}`),
      new RegExp(`\\brequire\\s*\\(\\s*${q}`),
    ];
    if (patterns.some((p) => p.test(source))) return lib;
  }
  return null;
}

describe("gate 9: runtime and licence isolation", () => {
  const sources = [
    ...walk(path.join(REPO_ROOT, "src")),
    ...walk(path.join(REPO_ROOT, "scripts")),
  ].filter((f) => /\.(ts|tsx|js|mjs|cjs)$/.test(f));

  it("only the one test helper imports a conjugation library (static, dynamic or require)", () => {
    const offenders = sources
      .filter((f) => rel(f) !== ONLY_IMPORTER)
      .map((f) => ({ file: rel(f), lib: importsLibrary(readFileSync(f, "utf8")) }))
      .filter((x) => x.lib !== null);
    expect(offenders).toEqual([]);
    expect(
      importsLibrary(readFileSync(path.join(REPO_ROOT, ONLY_IMPORTER), "utf8")),
    ).not.toBeNull();
  });

  it("the detector itself catches every import style", () => {
    // Assembled from pieces so this file does not itself import a library.
    const IMPORT = "imp" + "ort";
    const FROM = "fr" + "om";
    const REQUIRE = "req" + "uire";
    expect(importsLibrary(`${IMPORT} x ${FROM} "french-verbs-lefff/dist/conjugations.json"`)).toBe(
      "french-verbs-lefff",
    );
    expect(importsLibrary(`const m = await ${IMPORT}("spanish-verbs")`)).toBe("spanish-verbs");
    expect(importsLibrary(`const m = ${REQUIRE}('french-verbs')`)).toBe("french-verbs");
    expect(importsLibrary(`export * ${FROM} "spanish-verbs"`)).toBe("spanish-verbs");
    expect(importsLibrary(`${IMPORT} "french-verbs-lefff"`)).toBe("french-verbs-lefff");
    expect(importsLibrary(`${IMPORT} { hash } ${FROM} "../bank-engine"`)).toBeNull();
  });

  it("the libraries are devDependencies only, with exact versions", () => {
    const pkg = JSON.parse(readFileSync(path.join(REPO_ROOT, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    for (const lib of LIBS) {
      expect(pkg.dependencies?.[lib], `${lib} must not be a runtime dependency`).toBeUndefined();
      expect(pkg.devDependencies?.[lib], `${lib} must be a pinned devDependency`).toMatch(
        /^\d+\.\d+\.\d+$/,
      );
    }
  });

  it(
    "no tracked file contains Lefff lexicon data (markers, or a pasted run of rows)",
    { timeout: 120_000 },
    () => {
      const tracked = execFileSync("git", ["ls-files", "-z"], {
        cwd: REPO_ROOT,
        maxBuffer: 64 * 1024 * 1024,
      })
        .toString("utf8")
        .split("\0")
        .filter(Boolean);
      const offenders: string[] = [];
      for (const file of tracked) {
        if (/\.(png|jpg|jpeg|gif|webp|ico|woff2?|ttf|otf|mp3|wav|mp4|pdf|lock|lockb)$/i.test(file))
          continue;
        const full = path.join(REPO_ROOT, file);
        if (!existsSync(full) || statSync(full).size > 8 * 1024 * 1024) continue;
        const text = readFileSync(full, "utf8");
        if (LEFFF_MARKERS.some((m) => text.includes(m))) offenders.push(`${file} (marker)`);
        else if ((text.match(LEFFF_ROW_SHAPE) ?? []).length > LEFFF_ROW_LIMIT)
          offenders.push(`${file} (rows)`);
      }
      expect(offenders).toEqual([]);
    },
  );

  it("the markers really are in the library's data (so the scan can find them)", async () => {
    const lexicon = readFileSync(
      path.join(REPO_ROOT, "node_modules/french-verbs-lefff/dist/conjugations.json"),
      "utf8",
    );
    for (const marker of LEFFF_MARKERS) expect(lexicon.includes(marker), marker).toBe(true);
  });
});
