/**
 * The "no raw values" ratchet (design system spec, visual round 6). Screens use tokens only; a raw colour or font
 * size in view code is a bug even when it matches a token. Today's code has some, so each platform has a baseline
 * (design/baselines/<platform>.json) with the count per file. A count may only go down, a file missing from the
 * baseline starts at zero, and a file built on the new system must have none.
 *
 * Used by src/lib/design-token-guards.test.ts (web), src/lib/ios-design-token-guards.test.ts (iOS) and
 * scripts/design-raw-value-baseline.ts. Android's guard, NoRawDesignValuesTest.kt, uses the same Android patterns.
 */
import fs from "node:fs";
import path from "node:path";

export type Platform = "web" | "ios" | "android";
export type Baseline = Record<string, number>;

type Config = {
  roots: string[];
  extensions: string[];
  /** Files that may hold values (token files) or are not view code. */
  exempt: (rel: string) => boolean;
  /** A file built on the new design system: it may hold no raw value at all. */
  isNewSystem: (rel: string, text: string) => boolean;
  patterns: RegExp[];
};

/** Android's "built on the new system" marker. NoRawDesignValuesTest.kt keeps the same regex. */
export const ANDROID_NEW_SYSTEM = /\bAlphonsoTokens\b|\bLocalAlphonsoTokens\b/;

const CONFIG: Record<Platform, Config> = {
  web: {
    roots: ["src/routes", "src/components"],
    extensions: [".ts", ".tsx"],
    exempt: (rel) => /\.(test|spec)\.tsx?$/.test(rel),
    isNewSystem: (rel, text) =>
      rel.startsWith("src/components/ds/") ||
      /var\(--c-|\bDsIcon\b|@\/design\/|\b(?:bg|text|border|fill|stroke|ring)-ds-/.test(text),
    patterns: [
      // Hex colours, including Tailwind arbitrary values such as bg-[#fff].
      /(?<![\w&/])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])/g,
      /\b(?:rgba?|hsla?|oklch|oklab)\(/g,
      // Raw font sizes.
      /\btext-\[\d+(?:\.\d+)?(?:px|rem|em)\]/g,
      /\bfontSize:\s*["'`]?\d/g,
      /font-size:\s*\d/g,
    ],
  },
  ios: {
    roots: ["ios/LearnWithAlphonso/Sources"],
    extensions: [".swift"],
    exempt: (rel) => rel.startsWith("ios/LearnWithAlphonso/Sources/DesignSystem/"),
    isNewSystem: (_rel, text) => /\bAlphonsoDS\b|\\\.alphonsoDS\b|\.dsText\(/.test(text),
    patterns: [
      /\bColor\(\s*(?:hex|red|white|hue)\s*:/g,
      /\bColor\(\s*\.sRGB/g,
      /\bUIColor\(\s*(?:red|white|hue|displayP3Red)\s*:/g,
      /#colorLiteral/g,
      /\.system\(\s*size:\s*\d/g,
      /(?:\bFont|\.font\(\s*)\.custom\(/g,
      /\bAlphonsoFont\.(?:display|sans)\(\s*\d/g,
      /\bUIFont\.(?:systemFont|boldSystemFont|italicSystemFont|monospacedDigitSystemFont)\(\s*ofSize:\s*\d/g,
    ],
  },
  android: {
    roots: ["android/LearnWithAlphonso/app/src/main/java"],
    extensions: [".kt"],
    exempt: (rel) => rel.includes("/ui/theme/"),
    isNewSystem: (_rel, text) => ANDROID_NEW_SYSTEM.test(text),
    // Keep in step with NoRawDesignValuesTest.kt (design-token-guards.test.ts checks).
    patterns: [
      /\bColor\(\s*0x/g,
      /\bColor\.parseColor\(/g,
      /\bColor\(\s*red\s*=/g,
      /\b\d+(?:\.\d+)?\.sp\b/g,
      /\bFontFamily\(/g,
    ],
  },
};

/** The patterns a platform counts; the Android list is checked against NoRawDesignValuesTest.kt's copy. */
export function rawValuePatterns(platform: Platform): readonly RegExp[] {
  return CONFIG[platform].patterns;
}

export function countRawValues(platform: Platform, text: string): number {
  return CONFIG[platform].patterns.reduce((sum, re) => sum + (text.match(re)?.length ?? 0), 0);
}

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function files(root: string, platform: Platform): { rel: string; text: string }[] {
  const cfg = CONFIG[platform];
  return cfg.roots
    .flatMap((r) => walk(path.join(root, r)))
    .map((full) => path.relative(root, full).split(path.sep).join("/"))
    .filter((rel) => cfg.extensions.some((e) => rel.endsWith(e)) && !cfg.exempt(rel))
    .sort()
    .map((rel) => ({ rel, text: fs.readFileSync(path.join(root, rel), "utf8") }));
}

/** Raw-value count per file, for files that have any. */
export function scanPlatform(root: string, platform: Platform): Baseline {
  const out: Baseline = {};
  for (const { rel, text } of files(root, platform)) {
    const count = countRawValues(platform, text);
    if (count > 0) out[rel] = count;
  }
  return out;
}

export function findViolations(root: string, platform: Platform, baseline: Baseline): string[] {
  const cfg = CONFIG[platform];
  const out: string[] = [];
  for (const { rel, text } of files(root, platform)) {
    const count = countRawValues(platform, text);
    if (count === 0) continue;
    if (cfg.isNewSystem(rel, text))
      out.push(`${rel}: ${count} raw value(s) in a design-system file, which must have none`);
    else if (count > (baseline[rel] ?? 0))
      out.push(`${rel}: ${count} raw value(s), baseline allows ${baseline[rel] ?? 0}`);
  }
  return out;
}

export const baselinePath = (root: string, platform: Platform) =>
  path.join(root, "design/baselines", `${platform}.json`);

export function loadBaseline(root: string, platform: Platform): Baseline {
  return (JSON.parse(fs.readFileSync(baselinePath(root, platform), "utf8")) as { files: Baseline })
    .files;
}
