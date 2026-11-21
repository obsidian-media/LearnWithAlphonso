import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * "Nothing hardcoded, everything real" as a test. The admin console may only put a data number on screen through
 * <Figure value reason>, which writes the reason (never a digit) when it has no value. This scans every console
 * source for the ways a sample could sneak in:
 *   (a) a number written straight into JSX (text like >128<, {128}, value={128} or value="128" on a Figure);
 *   (b) identifiers named SAMPLE / MOCK / DEMO / FIXTURE / PLACEHOLDER (outside tests);
 *   (c) an array literal of 2 or more row-like objects ({ name: ..}, { title: ..}, { id: ..} ..) in a component;
 *   (d) the sample strings lifted from the owner-approved mocks (maria.k, #4821, 3h 02m, 99.94% ...).
 * It reads the TypeScript syntax tree, so comments and tests are never mistaken for rendered text.
 *
 * Applies to src/components/console/** and every admin route that has been rebuilt. LEGACY_ROUTES are the old pages
 * not yet replaced: each rebuild PR deletes its entry here, so the guard grows with the rebuild.
 */
const MOCK_SAMPLES = [
  "maria.k",
  "j.okafor",
  "lucia_p",
  "spam_promo99",
  "xx_bot_xx",
  "#4821",
  "3h 02m",
  "99.94%",
  "$4.21",
  "196 clips",
  "2,041",
  "alex@alphonso.app",
];
const SAMPLE_IDENT =
  /^(SAMPLE|MOCK|DEMO|FIXTURE|PLACEHOLDER)([_A-Z0-9]|$)|^(sample|mock|demo|fixture|placeholder)s?([A-Z_]|$)/;
const ROW_KEYS = new Set(["name", "title", "id", "email", "subject", "ticketNo", "learner"]);
const NUMERIC_TEXT = /^[\s$€£]*\d[\d,.\s]*[%kKmM]?\s*$/;

/** Old pages not yet rebuilt (each rebuild PR removes its line). */
export const LEGACY_ROUTES = [
  "audit.tsx",
  "folder.$id.tsx",
  "folders.tsx",
  "health.tsx",
  "signin.tsx",
];

export function findViolations(source: string, file = "x.tsx"): string[] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const out: string[] = [];
  const at = (n: ts.Node) => sf.getLineAndCharacterOfPosition(n.getStart()).line + 1;
  const numericString = (e: ts.Expression) =>
    (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) &&
    /\d/.test(e.text) &&
    NUMERIC_TEXT.test(e.text);
  const isNumber = (e: ts.Expression) =>
    ts.isNumericLiteral(e) ||
    (ts.isPrefixUnaryExpression(e) && ts.isNumericLiteral(e.operand)) ||
    numericString(e);

  // (e) a fallback number: `x ?? 0` or `x || 0` anywhere inside what JSX renders turns "unknown" into a number.
  const fallbacks = (root: ts.Node) => {
    const walkFb = (m: ts.Node) => {
      if (
        ts.isBinaryExpression(m) &&
        (m.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken ||
          m.operatorToken.kind === ts.SyntaxKind.BarBarToken) &&
        isNumber(m.right)
      ) {
        out.push(`${file}:${at(m)} a numeric fallback in rendered data: ${m.getText()}`);
      }
      ts.forEachChild(m, walkFb);
    };
    walkFb(root);
  };

  const visit = (n: ts.Node) => {
    if (
      ts.isJsxExpression(n) &&
      n.expression &&
      (ts.isJsxElement(n.parent) || ts.isJsxFragment(n.parent))
    ) {
      fallbacks(n.expression);
    }
    if (ts.isJsxText(n) && NUMERIC_TEXT.test(n.text) && n.text.trim() !== "") {
      out.push(`${file}:${at(n)} a number written as JSX text: ${n.text.trim()}`);
    }
    // Only a number rendered as a child ({128}); an attribute such as width={34} or rows={3} is layout, not data.
    if (
      ts.isJsxExpression(n) &&
      (ts.isJsxElement(n.parent) || ts.isJsxFragment(n.parent)) &&
      n.expression &&
      isNumber(n.expression)
    ) {
      out.push(`${file}:${at(n)} a number literal rendered in JSX: ${n.expression.getText()}`);
    }
    if (
      ts.isJsxAttribute(n) &&
      ts.isIdentifier(n.name) &&
      n.name.text === "value" &&
      n.initializer
    ) {
      const el = n.parent.parent;
      const tag =
        ts.isJsxOpeningElement(el) || ts.isJsxSelfClosingElement(el) ? el.tagName.getText() : "";
      const v = ts.isJsxExpression(n.initializer) ? n.initializer.expression : n.initializer;
      if (tag === "Figure" && v) fallbacks(v);
      if (tag === "Figure" && v && isNumber(v as ts.Expression)) {
        out.push(`${file}:${at(n)} Figure value is a literal: ${n.getText()}`);
      }
    }
    if (ts.isIdentifier(n) && SAMPLE_IDENT.test(n.text)) {
      const p = n.parent;
      if (!(ts.isJsxAttribute(p) && p.name === n))
        out.push(`${file}:${at(n)} sample-like identifier: ${n.text}`);
    }
    if (ts.isArrayLiteralExpression(n) && n.elements.length >= 2) {
      const rows = n.elements.filter(
        (e): e is ts.ObjectLiteralExpression =>
          ts.isObjectLiteralExpression(e) &&
          e.properties.some((p) => p.name !== undefined && ROW_KEYS.has(p.name.getText())),
      );
      if (rows.length === n.elements.length)
        out.push(`${file}:${at(n)} an array of row-like objects`);
    }
    if (
      ts.isStringLiteral(n) ||
      ts.isNoSubstitutionTemplateLiteral(n) ||
      ts.isJsxText(n) ||
      ts.isTemplateHead(n) ||
      ts.isTemplateMiddle(n) ||
      ts.isTemplateTail(n)
    ) {
      const text = ts.isJsxText(n) ? n.text : (n as ts.StringLiteral).text;
      for (const s of MOCK_SAMPLES) {
        if (text.includes(s)) out.push(`${file}:${at(n)} a sample string from the mocks: ${s}`);
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
const isSource = (f: string) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f);

describe("the scanner itself (it must be able to fail)", () => {
  it("flags a number written into JSX, a literal Figure value, and sample identifiers", () => {
    expect(findViolations("const a = <p>128</p>;")).toHaveLength(1);
    expect(findViolations("const a = <p>{128}</p>;")).toHaveLength(1);
    expect(findViolations("const a = <p>$4.21</p>;").length).toBeGreaterThan(0);
    expect(findViolations("const a = <img width={34} />;")).toEqual([]);
    expect(findViolations("const a = <Figure value={128} reason='x' />;").length).toBeGreaterThan(
      0,
    );
    expect(findViolations('const a = <Figure value="1,204" reason="x" />;').length).toBeGreaterThan(
      0,
    );
    expect(findViolations("const SAMPLE_ROWS = [];")).toHaveLength(1);
    expect(findViolations("const mockTickets = [];")).toHaveLength(1);
  });
  it("flags a numeric fallback (?? 0, || 0) in JSX and in a Figure value", () => {
    expect(
      findViolations("const a = <Figure value={x ?? 0} reason='r' />;").length,
    ).toBeGreaterThan(0);
    expect(
      findViolations("const a = <Figure value={x || 0} reason='r' />;").length,
    ).toBeGreaterThan(0);
    expect(findViolations("const a = <p>{(counts.open ?? 0) + 1}</p>;").length).toBeGreaterThan(0);
    expect(findViolations("const a = <p>{x ?? 'none'}</p>;")).toEqual([]);
    expect(findViolations("const a = <Figure value={x} reason='r' />;")).toEqual([]);
  });
  it("does not flag real story content (a character name is not a sample)", () => {
    expect(findViolations("const a = <p>Mona walked in</p>;")).toEqual([]);
  });
  it("flags row-like arrays and the sample strings from the mocks", () => {
    expect(findViolations("const r = [{ name: 'a' }, { name: 'b' }];")).toHaveLength(1);
    expect(findViolations("const r = <p>maria.k wrote in</p>;").length).toBeGreaterThan(0);
    expect(findViolations("const r = <p>{'#4821'}</p>;").length).toBeGreaterThan(0);
    expect(findViolations("const x = `waited 3h 02m`;").length).toBeGreaterThan(0);
  });
  it("passes honest code", () => {
    const ok = `
      // 128 in a comment is fine
      export const T = [{ key: "a", label: "A" }, { key: "b", label: "B" }];
      export function C({ v }: { v: number | null }) {
        return <p><Figure value={v} reason="No data yet" /> learners <input placeholder="x" /></p>;
      }`;
    expect(findViolations(ok)).toEqual([]);
  });
});

describe("the console renders no hardcoded data", () => {
  const consoleFiles = walk("src/components/console").filter(isSource);
  const routeFiles = readdirSync("admin/routes")
    .filter((f) => /\.tsx?$/.test(f) && !LEGACY_ROUTES.includes(f))
    .map((f) => path.join("admin/routes", f));

  it("scans real files (a guard that scans nothing proves nothing)", () => {
    expect(consoleFiles.length).toBeGreaterThanOrEqual(5);
    expect(routeFiles.map((f) => path.basename(f))).toEqual(
      expect.arrayContaining(["index.tsx", "__root.tsx"]),
    );
  });

  it("the legacy list names only files that still exist (a rebuilt page must drop its entry)", () => {
    for (const f of LEGACY_ROUTES) expect(existsSync(path.join("admin/routes", f)), f).toBe(true);
  });

  it("no console file or rebuilt route trips a rule", () => {
    const violations = [...consoleFiles, ...routeFiles].flatMap((f) =>
      findViolations(readFileSync(f, "utf8"), f.replace(/\\/g, "/")),
    );
    expect(violations).toEqual([]);
  });

  it("the Figure component is the one place that formats a number (no toLocaleString elsewhere in components)", () => {
    for (const f of consoleFiles) {
      if (f.endsWith("Figure.tsx")) continue;
      expect(readFileSync(f, "utf8"), f).not.toMatch(/toLocaleString\(\s*"en-US"/);
    }
  });
});
