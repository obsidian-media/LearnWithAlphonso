import { IMAGEABILITY_DATA, classifyImageability, type ImageabilityData } from "./imageability";
import { slugForTerm } from "./paths";
import type { TermIndex } from "./terms";
import { LICENSE_FOR_SOURCE, type VocabImageRecord } from "./types";
import { isSourcePageUrl, parseVocabImageUrl } from "./url-policy";

type Images = Record<string, VocabImageRecord>;

/** Spec guard 2, extended. Whole-word, case-insensitive. Kitchen "knife" is deliberately absent. */
export const ALT_CREDIT_DENYLIST: readonly string[] = [
  "nude",
  "nudes",
  "nudity",
  "naked",
  "topless",
  "underwear",
  "lingerie",
  "bra",
  "bikini",
  "bikinis",
  "swimsuit",
  "swimsuits",
  "swimwear",
  "alluring",
  "sensual",
  "erotic",
  "sexy",
  "seductive",
  "provocative",
  "gun",
  "guns",
  "handgun",
  "pistol",
  "rifle",
  "shotgun",
  "weapon",
  "weapons",
  "firearm",
  "ammunition",
  "bullet",
  "bullets",
  "blood",
  "bloody",
  "injury",
  "injured",
  "wound",
  "corpse",
  "war",
  "bomb",
  "explosion",
  "drunk",
  "beer",
  "wine",
  "whisky",
  "whiskey",
  "vodka",
  "cocktail",
  "alcohol",
  "liquor",
  "cigarette",
  "cigarettes",
  "cigar",
  "smoking",
  "tobacco",
  "vape",
  "drug",
  "drugs",
  "cannabis",
  "marijuana",
  "casino",
  "gamble",
  "gambling",
  "roulette",
  "poker",
  "protest",
  "protester",
  "riot",
  "politician",
  "election",
  "homeless",
  "beggar",
];
const DENY = new Set(ALT_CREDIT_DENYLIST);

/** The word itself plus simple plural stems, so "wines" and "injuries" are caught. */
function baseForms(token: string): string[] {
  const forms = [token];
  if (token.endsWith("ies")) forms.push(`${token.slice(0, -3)}y`);
  if (token.endsWith("es")) forms.push(token.slice(0, -2));
  if (token.endsWith("s")) forms.push(token.slice(0, -1));
  return forms;
}

export function denylistHits(text: string): string[] {
  const tokens = text
    .normalize("NFC")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u);
  const hits = new Set<string>();
  for (const t of tokens) {
    for (const form of baseForms(t)) {
      if (DENY.has(form)) {
        hits.add(form);
        break;
      }
    }
  }
  return [...hits];
}

export function hostViolations(images: Images): string[] {
  const out: string[] = [];
  for (const [key, img] of Object.entries(images)) {
    const parsed = parseVocabImageUrl(img.url);
    if (!parsed) {
      out.push(`${key}: url is not a vocab-images bucket URL: ${img.url}`);
      continue;
    }
    const expected = slugForTerm(key);
    if (parsed.slug !== expected)
      out.push(`${key}: url slug "${parsed.slug}" != expected "${expected}"`);
  }
  return out;
}

export function denylistViolations(images: Images): string[] {
  const out: string[] = [];
  for (const [key, img] of Object.entries(images)) {
    for (const hit of denylistHits(img.alt)) out.push(`${key}: alt contains "${hit}"`);
    for (const hit of denylistHits(img.credit)) out.push(`${key}: credit contains "${hit}"`);
  }
  return out;
}

const REVIEWER = /^agent:[a-z0-9-]+(?:\+agent:[a-z0-9-]+)?$/;
const PROGRAM_START = "2026-10-07";

export function reviewStampViolations(
  images: Images,
  today: string = new Date().toISOString().slice(0, 10),
): string[] {
  const out: string[] = [];
  for (const [key, img] of Object.entries(images)) {
    if (!REVIEWER.test(img.reviewedBy)) {
      out.push(`${key}: reviewedBy "${img.reviewedBy}" is not agent:<id>[+agent:<id>]`);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(img.reviewedAt)) {
      out.push(`${key}: reviewedAt "${img.reviewedAt}" is not YYYY-MM-DD`);
    } else if (img.reviewedAt < PROGRAM_START) {
      out.push(
        `${key}: reviewedAt "${img.reviewedAt}" predates the ${PROGRAM_START} review program`,
      );
    } else if (img.reviewedAt > today) {
      out.push(`${key}: reviewedAt "${img.reviewedAt}" is in the future`);
    }
  }
  return out;
}

export function provenanceViolations(images: Images): string[] {
  const out: string[] = [];
  for (const [key, img] of Object.entries(images)) {
    if (img.source !== "pexels" && img.source !== "pixabay") {
      out.push(`${key}: unknown source "${String(img.source)}"`);
      continue;
    }
    if (img.license !== LICENSE_FOR_SOURCE[img.source])
      out.push(`${key}: license does not match source ${img.source}`);
    if (!isSourcePageUrl(img.source, img.sourcePageUrl)) {
      out.push(`${key}: sourcePageUrl is not a ${img.source} photo page: ${img.sourcePageUrl}`);
    }
    if (img.alt.includes("--")) out.push(`${key}: alt contains "--"`);
    if (img.alt.trim().length < 1 || img.alt.length > 160)
      out.push(`${key}: alt must be 1-160 characters`);
    if (!img.credit.trim()) out.push(`${key}: credit is empty`);
  }
  return out;
}

export function imageabilityViolations(
  images: Images,
  index: TermIndex,
  data: ImageabilityData = IMAGEABILITY_DATA,
): string[] {
  const out: string[] = [];
  for (const [key, img] of Object.entries(images)) {
    const lang = parseVocabImageUrl(img.url)?.lang;
    if (!lang) continue; // hostViolations reports it
    const own = classifyImageability(key, lang, data);
    if (!own.imageable) {
      out.push(`${key}: not imageable in ${lang} (${own.reason})`);
      continue;
    }
    for (const other of index.get(key)?.langs ?? []) {
      if (other === lang) continue;
      const there = classifyImageability(key, other, data);
      if (!there.imageable) {
        out.push(
          `${key}: also a ${other} vocab term, where it is not imageable (${there.reason}); the ${lang} picture would show on ${other} cards`,
        );
      } else if (there.query.toLowerCase() !== own.query.toLowerCase()) {
        out.push(`${key}: ${lang} query "${own.query}" != ${other} query "${there.query}"`);
      }
    }
  }
  return out;
}

/** `pexels:590472` for a Pexels or Pixabay photo page, or null when the page has no trailing numeric id. */
export function sourceIdOf(source: string, sourcePageUrl: string): string | null {
  const m = /-(\d+)\/?$/.exec(sourcePageUrl);
  return m ? `${source}:${m[1]}` : null;
}

/**
 * No published image may come from a photo the review banned
 * (scripts/vocab-images/rejected-sources.json, keyed by `<source>:<id>`).
 * An entry whose id cannot be read from its page URL is a violation too: a
 * photo that cannot be checked cannot be shown to be clean.
 */
export function rejectedSourceViolations(
  images: Images,
  rejected: Record<string, unknown>,
): string[] {
  const out: string[] = [];
  for (const [key, img] of Object.entries(images)) {
    const id = sourceIdOf(img.source, img.sourcePageUrl);
    if (!id) out.push(`${key}: cannot read a photo id from ${img.sourcePageUrl}`);
    else if (id in rejected) out.push(`${key}: ${id} is on the rejected-sources list`);
  }
  return out;
}
