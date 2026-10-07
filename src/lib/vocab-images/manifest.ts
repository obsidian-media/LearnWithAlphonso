import { slugForTerm, storagePathFor } from "./paths";
import type { ImageCategory } from "./imageability";
import type { PlannedTerm } from "./terms";
import {
  LICENSE_FOR_SOURCE,
  type ImageLang,
  type VocabImageRecord,
  type VocabImageSource,
} from "./types";

export const MAX_FETCH_ATTEMPTS = 3;

/** Spec W1 rejection criteria, one code each, plus the owner's own objection. */
export const REJECTION_REASONS = [
  "nudity-or-suggestive",
  "violence-weapons-disaster-injury",
  "alcohol-tobacco-drugs-gambling",
  "politics-protest-religion",
  "stereotype-demeaning-poverty-distress",
  "brand-logo-or-foreign-text",
  "off-term",
  "owner-objection",
] as const;
export type RejectionReason = (typeof REJECTION_REASONS)[number];

export type Candidate = {
  source: VocabImageSource;
  sourceId: string;
  sourcePageUrl: string;
  credit: string;
  providerAlt: string;
  /** Relative to scripts/vocab-images/work/. */
  stagingPath: string;
  sha8: string;
  width: number;
  height: number;
};

export type Review = {
  reviewedBy: string;
  reviewedAt: string;
  alt: string;
  peopleVisible: boolean;
  secondPassBy?: string;
};

export type EntryStatus = "pending-fetch" | "fetched" | "approved" | "uploaded" | "no-image";

export type ManifestEntry = {
  key: string;
  lang: ImageLang;
  slug: string;
  query: string;
  category: ImageCategory;
  meaning: string;
  status: EntryStatus;
  attempts: number;
  rejectedSourceIds: string[];
  candidate?: Candidate;
  review?: Review;
  url?: string;
  noImageReason?: string;
};

export type Manifest = { version: 1; entries: Record<string, ManifestEntry> };

export type Verdict =
  | { verdict: "approve"; alt: string; peopleVisible: boolean }
  | { verdict: "reject"; reasons: RejectionReason[]; note?: string };

export type Ban = { sourceId: string; key: string; reasons: RejectionReason[] };

export const emptyManifest = (): Manifest => ({ version: 1, entries: {} });

export function planManifest(prev: Manifest, planned: PlannedTerm[]): Manifest {
  const entries: Record<string, ManifestEntry> = {};
  for (const p of planned) {
    const old = prev.entries[p.key];
    if (old && old.lang === p.lang && old.query === p.query) {
      entries[p.key] = { ...old, category: p.category, meaning: p.meaning };
      continue;
    }
    entries[p.key] = {
      key: p.key,
      lang: p.lang,
      slug: slugForTerm(p.key),
      query: p.query,
      category: p.category,
      meaning: p.meaning,
      status: "pending-fetch",
      attempts: 0,
      rejectedSourceIds: old?.rejectedSourceIds ?? [],
    };
  }
  return { version: 1, entries };
}

function expectStatus(entry: ManifestEntry, ...allowed: EntryStatus[]): void {
  if (!allowed.includes(entry.status)) {
    throw new Error(`${entry.key}: expected status ${allowed.join(" or ")}, got ${entry.status}`);
  }
}

export function recordFetchResult(
  entry: ManifestEntry,
  candidate: Candidate | null,
): ManifestEntry {
  expectStatus(entry, "pending-fetch");
  if (!candidate) {
    return {
      ...entry,
      status: "no-image",
      noImageReason: "no acceptable provider result",
      candidate: undefined,
    };
  }
  if (entry.rejectedSourceIds.includes(candidate.sourceId)) {
    throw new Error(`${entry.key}: ${candidate.sourceId} was already rejected for this term`);
  }
  return {
    ...entry,
    status: "fetched",
    candidate,
    review: undefined,
    url: undefined,
    noImageReason: undefined,
  };
}

function reject(
  entry: ManifestEntry,
  reasons: RejectionReason[],
): { entry: ManifestEntry; ban?: Ban } {
  const candidate = entry.candidate;
  if (!candidate) throw new Error(`${entry.key}: nothing to reject`);
  const attempts = entry.attempts + 1;
  const exhausted = attempts >= MAX_FETCH_ATTEMPTS;
  const next: ManifestEntry = {
    ...entry,
    attempts,
    rejectedSourceIds: [...entry.rejectedSourceIds, candidate.sourceId],
    candidate: undefined,
    review: undefined,
    url: undefined,
    status: exhausted ? "no-image" : "pending-fetch",
    noImageReason: exhausted ? `${attempts} candidates rejected` : undefined,
  };
  const contentProblem = reasons.some((r) => r !== "off-term");
  return contentProblem
    ? { entry: next, ban: { sourceId: candidate.sourceId, key: entry.key, reasons } }
    : { entry: next };
}

export function applyFirstVerdict(
  entry: ManifestEntry,
  verdict: Verdict,
  reviewer: string,
  date: string,
): { entry: ManifestEntry; ban?: Ban } {
  expectStatus(entry, "fetched");
  if (verdict.verdict === "reject") return reject(entry, verdict.reasons);
  return {
    entry: {
      ...entry,
      status: "approved",
      review: {
        reviewedBy: reviewer,
        reviewedAt: date,
        alt: verdict.alt.trim(),
        peopleVisible: verdict.peopleVisible,
      },
    },
  };
}

export function applySecondVerdict(
  entry: ManifestEntry,
  verdict: Verdict,
  reviewer: string,
): { entry: ManifestEntry; ban?: Ban } {
  expectStatus(entry, "approved", "uploaded");
  if (verdict.verdict === "reject") return reject(entry, verdict.reasons);
  if (!entry.review) throw new Error(`${entry.key}: approved without a review`);
  return { entry: { ...entry, review: { ...entry.review, secondPassBy: reviewer } } };
}

export function applyOwnerObjection(entry: ManifestEntry): { entry: ManifestEntry; ban?: Ban } {
  expectStatus(entry, "approved", "uploaded");
  return reject(entry, ["owner-objection"]);
}

export function recordUpload(entry: ManifestEntry, url: string): ManifestEntry {
  expectStatus(entry, "approved", "uploaded");
  return { ...entry, status: "uploaded", url };
}

/** Object paths the data references. Anything else in the bucket is pruned. */
export function referencedObjectPaths(m: Manifest): Set<string> {
  return new Set(
    Object.values(m.entries)
      .filter((e) => e.status === "uploaded" && e.url)
      .map((e) => storagePathFor(e.key, e.lang)),
  );
}

export function toVocabImages(m: Manifest): Record<string, VocabImageRecord> {
  const out: Record<string, VocabImageRecord> = {};
  const keys = Object.keys(m.entries).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  for (const key of keys) {
    const e = m.entries[key];
    if (e.status !== "uploaded" || !e.url || !e.candidate || !e.review) continue;
    out[key] = {
      url: e.url,
      alt: e.review.alt,
      credit: e.candidate.credit,
      source: e.candidate.source,
      sourcePageUrl: e.candidate.sourcePageUrl,
      license: LICENSE_FOR_SOURCE[e.candidate.source],
      reviewedBy: e.review.secondPassBy
        ? `${e.review.reviewedBy}+${e.review.secondPassBy}`
        : e.review.reviewedBy,
      reviewedAt: e.review.reviewedAt,
    };
  }
  return out;
}

export function statusCounts(m: Manifest): Record<EntryStatus, number> {
  const counts: Record<EntryStatus, number> = {
    "pending-fetch": 0,
    fetched: 0,
    approved: 0,
    uploaded: 0,
    "no-image": 0,
  };
  for (const e of Object.values(m.entries)) counts[e.status]++;
  return counts;
}
