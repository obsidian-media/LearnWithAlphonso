import { readFileSync } from "node:fs";
import path from "node:path";
import { BANK_ES } from "../lesson-bank-es";
import { BANK_FR } from "../lesson-bank-fr";
import type { Pack } from "../bank-engine";

/** Generated packs carry these id prefixes; "existing course content" excludes them. */
export const GENERATED_PREFIX = { fr: "frg", es: "esg" } as const;

export function allPacks(lang: "fr" | "es", includeGenerated = false): Pack[] {
  const bank = lang === "fr" ? BANK_FR : BANK_ES;
  return Object.values(bank)
    .flat()
    .filter((p) => includeGenerated || !p.id.startsWith(GENERATED_PREFIX[lang]));
}

export type BankLine = { pack: Pack; left: string; right: string };

export function bankLines(lang: "fr" | "es"): BankLine[] {
  return allPacks(lang).flatMap((pack) =>
    pack.data
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const [left = "", right = ""] = l.split("|").map((p) => p.trim());
        return { pack, left, right };
      }),
  );
}

const REPO_ROOT = path.resolve(import.meta.dirname, "../../..");

export type WiktionarySummary = {
  generated: string;
  source: string;
  fr: {
    verbs: Record<string, { present: string[]; participles: string[]; status: string }>;
    nouns: Record<string, { gender: string; status: string }>;
  };
  es: {
    verbs: Record<string, { present: string[]; preterite: string[]; status: string }>;
    nouns: Record<string, { gender: string; status: string }>;
  };
  disagreements: string[];
};

export function readWiktionarySummary(): WiktionarySummary {
  return JSON.parse(
    readFileSync(path.join(REPO_ROOT, "docs/superpowers/generative-wiktionary-check.json"), "utf8"),
  ) as WiktionarySummary;
}

export { REPO_ROOT };
