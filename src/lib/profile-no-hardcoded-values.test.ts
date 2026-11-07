import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ACHIEVEMENTS } from "../data/achievements";
import { LEAGUE_TIER_COPY } from "./league-tier-copy";

/**
 * Owner rule (BACKLOG 0.0-bi): "dont let anything get hardcoded". Profile's counts, totals, dates, achievement
 * counts and league names all come from data. This scans Profile's own code (comments and SVG path data stripped)
 * for a number written into copy, and for a league or badge name typed in instead of read from its catalog.
 */
const root = path.resolve(import.meta.dirname, "../..");
const PROFILE_FILES = [
  "src/components/profile/ProfileSections.tsx",
  "src/routes/_authenticated/profile.tsx",
  "src/lib/share-card.ts",
];

const NAMES = [
  ...Object.values(LEAGUE_TIER_COPY).map((t) => t.label),
  ...ACHIEVEMENTS.map((a) => a.title),
];

function stripNonCopy(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1")
    .replace(/\bd="[^"]*"/g, "")
    .replace(/\bd=\{`[^`]*`\}/g, "");
}

export function hardcodedValues(src: string): string[] {
  const code = stripNonCopy(src);
  const found: string[] = [];
  // A number in JSX text: >12 day streak<, >of 40<.
  for (const m of code.matchAll(/>([^<>{}=;()?&|]*)</g)) {
    if (/\d/.test(m[1]!)) found.push(`number in text: ${m[1]!.trim()}`);
  }
  // A number written into a copy string next to what it counts: "12-day", "40 XP", "of 30", "3 months", "91%".
  for (const m of code.matchAll(
    /(?<![\w.[(-])\d+(?:[.,]\d+)?(?:-|\s)?(?:day|days|week|weeks|month|months|min|minutes?|XP|lessons?|words?|units?|times?|badges?|friends?)\b|\bof \d+\b|(?<![\w.[(-])\d+%(?![\w),\]])|["'`][^"'`\n]*[A-Za-z]: \d+[^"'`\n]*["'`]/g,
  )) {
    found.push(`number in copy: ${m[0]}`);
  }
  for (const name of NAMES) {
    if (new RegExp(`["'\`>]\\s*${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(code)) {
      found.push(`typed-in name: ${name}`);
    }
  }
  return found;
}

describe("Profile holds no number, league name or badge name of its own", () => {
  it.each(PROFILE_FILES)("%s", (rel) => {
    const src = fs.readFileSync(path.join(root, rel), "utf8");
    expect(hardcodedValues(src)).toEqual([]);
  });
});

describe("the guard catches each kind (fixtures)", () => {
  it.each([
    ["<b>12</b>", "number in text"],
    ["<span>of 40</span>", "number in text"],
    ['note="Longest: 21"', "number in copy"],
    ["`${n} of 30`", "number in copy"],
    ['title="Last 3 months"', "number in copy"],
    ['aside="65 days active"', "number in copy"],
    ['"+340 XP this week"', "number in copy"],
    ['"91% accuracy"', "number in copy"],
    ['label: "Sapling league"', "typed-in name"],
    ["<b>Warming up</b>", "typed-in name"],
  ])("%s", (src, kind) => {
    expect(hardcodedValues(src).some((f) => f.startsWith(kind))).toBe(true);
  });

  it("does not flag class names, sizes, SVG paths or comments", () => {
    expect(
      hardcodedValues(
        '<i className="size-[30px] h-3.5 grid-cols-7 gap-1" />\n<path d="M26 2l22 8v18" />\n// 12 days\nconst ms = 60_000;',
      ),
    ).toEqual([]);
  });
});
