import { createHash } from "node:crypto";
import path from "node:path";
import { denylistHits } from "./guards";
import {
  REJECTION_REASONS,
  applyFirstVerdict,
  applyOwnerObjection,
  applySecondVerdict,
  type Ban,
  type Manifest,
  type ManifestEntry,
  type Verdict,
} from "./manifest";
import type { ImageLang } from "./types";

export type Pass = "first" | "second";
export type BatchItem = {
  key: string;
  lang: ImageLang;
  query: string;
  meaning: string;
  imagePath: string;
  sourcePageUrl: string;
  providerAlt: string;
  firstReviewer?: string;
};
export type ReviewBatch = { batch: string; pass: Pass; items: BatchItem[] };
export type VerdictFile = {
  batch: string;
  pass: Pass;
  reviewer: string;
  reviewedAt: string;
  verdicts: Record<string, Verdict>;
};

export const SECOND_PASS_RATE = 0.1;
export const SECOND_PASS_SEED = "w1-2026-10-07";

const byKey = (a: ManifestEntry, b: ManifestEntry) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);

export function buildBatches(
  entries: ManifestEntry[],
  size: number,
  prefix: string,
  pass: Pass,
  workDir: string,
): ReviewBatch[] {
  const sorted = [...entries].sort(byKey);
  const batches: ReviewBatch[] = [];
  for (let i = 0; i < sorted.length; i += size) {
    batches.push({
      batch: `${prefix}-b${String(i / size + 1).padStart(3, "0")}`,
      pass,
      items: sorted.slice(i, i + size).map((e) => {
        if (!e.candidate) throw new Error(`${e.key}: no candidate to review`);
        return {
          key: e.key,
          lang: e.lang,
          query: e.query,
          meaning: e.meaning,
          imagePath: path.join(workDir, e.candidate.stagingPath),
          sourcePageUrl: e.candidate.sourcePageUrl,
          providerAlt: e.candidate.providerAlt,
          ...(pass === "second" && e.review ? { firstReviewer: e.review.reviewedBy } : {}),
        };
      }),
    });
  }
  return batches;
}

export function firstPassEntries(m: Manifest): ManifestEntry[] {
  return Object.values(m.entries).filter((e) => e.status === "fetched");
}

function sampled(key: string, rate: number, seed: string): boolean {
  const h = createHash("sha256").update(`${seed}:${key}`).digest();
  return h.readUInt32BE(0) / 0x1_0000_0000 < rate;
}

/** Approved images that still need an independent look: every one showing people, plus a seeded sample. */
export function secondPassEntries(m: Manifest, rate: number, seed: string): ManifestEntry[] {
  return Object.values(m.entries).filter(
    (e) =>
      (e.status === "approved" || e.status === "uploaded") &&
      !!e.review &&
      !e.review.secondPassBy &&
      (e.review.peopleVisible || sampled(e.key, rate, seed)),
  );
}

const REVIEWER = /^agent:[a-z0-9-]+$/;
const AGENT_REASONS = new Set<string>(REJECTION_REASONS.filter((r) => r !== "owner-objection"));

export function validateVerdictFile(
  file: VerdictFile,
  batch: ReviewBatch,
  today: string,
): string[] {
  const p: string[] = [];
  if (file.batch !== batch.batch) p.push(`verdicts are for ${file.batch}, not ${batch.batch}`);
  if (file.pass !== batch.pass)
    p.push(`verdicts are for the ${file.pass} pass, batch is ${batch.pass}`);
  if (!REVIEWER.test(file.reviewer)) p.push(`reviewer "${file.reviewer}" is not agent:<id>`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(file.reviewedAt) || file.reviewedAt > today) {
    p.push(`reviewedAt "${file.reviewedAt}" is not a past-or-today YYYY-MM-DD`);
  }
  const keys = new Set(batch.items.map((i) => i.key));
  for (const item of batch.items) {
    if (!file.verdicts[item.key]) p.push(`${item.key}: no verdict`);
    if (batch.pass === "second" && item.firstReviewer === file.reviewer) {
      p.push(`${item.key}: second pass by the first-pass reviewer`);
    }
  }
  for (const [key, v] of Object.entries(file.verdicts)) {
    if (!keys.has(key)) {
      p.push(`${key}: not in this batch`);
      continue;
    }
    if (v.verdict === "approve") {
      const alt = typeof v.alt === "string" ? v.alt.trim() : "";
      if (alt.length < 8 || alt.length > 160) p.push(`${key}: alt must be 8-160 characters`);
      if (alt.includes("--")) p.push(`${key}: alt contains "--"`);
      for (const hit of denylistHits(alt)) p.push(`${key}: alt contains "${hit}"`);
      if (typeof v.peopleVisible !== "boolean")
        p.push(`${key}: peopleVisible must be true or false`);
    } else if (v.verdict === "reject") {
      if (!Array.isArray(v.reasons) || v.reasons.length === 0)
        p.push(`${key}: a rejection needs at least one reason`);
      else
        for (const r of v.reasons)
          if (!AGENT_REASONS.has(r)) p.push(`${key}: unknown rejection reason "${r}"`);
    } else {
      p.push(`${key}: verdict must be "approve" or "reject"`);
    }
  }
  return p;
}

export function applyVerdictFile(
  m: Manifest,
  file: VerdictFile,
): { manifest: Manifest; bans: Ban[]; approved: number; rejected: number } {
  const entries = { ...m.entries };
  const bans: Ban[] = [];
  let approved = 0;
  let rejected = 0;
  for (const [key, v] of Object.entries(file.verdicts)) {
    const entry = entries[key];
    if (!entry) throw new Error(`${key}: not in the manifest`);
    const r =
      file.pass === "first"
        ? applyFirstVerdict(entry, v, file.reviewer, file.reviewedAt)
        : applySecondVerdict(entry, v, file.reviewer);
    entries[key] = r.entry;
    if (r.ban) bans.push(r.ban);
    if (v.verdict === "approve") approved++;
    else rejected++;
  }
  return { manifest: { ...m, entries }, bans, approved, rejected };
}

export function applyOwnerObjections(
  m: Manifest,
  keys: string[],
): { manifest: Manifest; bans: Ban[]; missing: string[] } {
  const entries = { ...m.entries };
  const bans: Ban[] = [];
  const missing: string[] = [];
  for (const key of keys) {
    const entry = entries[key];
    if (!entry) {
      missing.push(key);
      continue;
    }
    const r = applyOwnerObjection(entry);
    entries[key] = r.entry;
    if (r.ban) bans.push(r.ban);
  }
  return { manifest: { ...m, entries }, bans, missing };
}
