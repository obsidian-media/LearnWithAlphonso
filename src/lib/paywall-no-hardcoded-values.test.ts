import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Owner rule (BACKLOG 0.0-bk): the paywall never types in a price, a currency, the yearly saving, the trial or its
 * length, or a number for the daily allowance. They all come from the offer for each learner. This scans the
 * paywall's own code (comments stripped) for any of them.
 */
const root = path.resolve(import.meta.dirname, "../..");
const PAYWALL_FILES = [
  "src/components/WebPaywall.tsx",
  "src/components/paywall/PaywallParts.tsx",
  "src/components/paywall/ProWelcome.tsx",
  "src/lib/paywall-copy.ts",
  "src/lib/paywall-plans.ts",
  "src/routes/_authenticated/pro-return.tsx",
  "src/components/HectorInvite.tsx",
  "src/components/firstrun/AfterSignIn.tsx",
];

const FORBIDDEN: { what: string; re: RegExp }[] = [
  { what: "a price with a currency sign", re: /[$€£¥₹]\s?\d/ },
  // Not a CSS value such as scale-[0.67].
  { what: "a price amount", re: /(?<![\w.[-])\d+[.,]\d{2}(?![\w%\]])/ },
  { what: "a currency code", re: /\b(?:USD|EUR|GBP|CAD|AUD|JPY|INR|MXN|BRL|CHF)\b/ },
  { what: "a trial or period length", re: /\b\d+(?:\s|-)?(?:days?|weeks?|months?|years?)\b/i },
  // Not a gradient stop such as 35%) or 130%_90%.
  { what: "a percentage", re: /\b\d+\s?%(?![\w),\]])/ },
  { what: "a daily allowance", re: /\b\d+\s*(?:messages?|minutes?|calls?)\b/i },
];

/** Comments and SVG path data (d="…") are not copy. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1")
    .replace(/\bd="[^"]*"/g, "");
}

export function hardcodedValues(src: string): string[] {
  const code = stripComments(src);
  return FORBIDDEN.filter((f) => f.re.test(code)).map((f) => f.what);
}

describe("the paywall holds no price, currency, saving, trial or allowance of its own", () => {
  it.each(PAYWALL_FILES)("%s", (rel) => {
    const src = fs.readFileSync(path.join(root, rel), "utf8");
    expect(hardcodedValues(src)).toEqual([]);
  });
});

describe("the guard catches each kind (fixtures)", () => {
  it.each([
    ['const p = "$9.99";', "a price with a currency sign"],
    ["<b>€59</b>", "a price with a currency sign"],
    ['const p = "59.99 a year";', "a price amount"],
    ['format("USD")', "a currency code"],
    ['"Free for 7 days"', "a trial or period length"],
    ['"1-week trial"', "a trial or period length"],
    ['"Save 50%"', "a percentage"],
    ['"150 messages a day"', "a daily allowance"],
  ])("%s", (src, what) => {
    expect(hardcodedValues(src)).toContain(what);
  });

  it("ignores comments, which may give examples", () => {
    expect(hardcodedValues('// "$9.99 / month"\n/* Save 50% */\nconst a = 1;')).toEqual([]);
  });
});
