import fs from "node:fs";
import path from "node:path";
import { emptyManifest, type Ban, type Manifest } from "../../src/lib/vocab-images/manifest";

export const VOCAB_IMAGES_DIR = path.resolve(import.meta.dirname);
export const WORK_DIR = path.join(VOCAB_IMAGES_DIR, "work");
export const MANIFEST_PATH = path.join(WORK_DIR, "manifest.json");
export const REVIEW_DIR = path.join(WORK_DIR, "review");
export const REVIEWS_DIR = path.join(VOCAB_IMAGES_DIR, "reviews");
export const REJECTED_SOURCES_PATH = path.join(VOCAB_IMAGES_DIR, "rejected-sources.json");
export const SIGNOFF_PATH = path.join(VOCAB_IMAGES_DIR, "signoff.json");

export function readManifest(): Manifest {
  return fs.existsSync(MANIFEST_PATH)
    ? (JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8")) as Manifest)
    : emptyManifest();
}

/** Write-then-rename, so a crash mid-write never leaves a truncated manifest. */
export function writeManifest(m: Manifest): void {
  fs.mkdirSync(WORK_DIR, { recursive: true });
  const tmp = `${MANIFEST_PATH}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(m, null, 2) + "\n");
  fs.renameSync(tmp, MANIFEST_PATH);
}

export type RejectedSources = Record<string, { key: string; reasons: string[] }>;

export function readRejected(): RejectedSources {
  return fs.existsSync(REJECTED_SOURCES_PATH)
    ? (JSON.parse(fs.readFileSync(REJECTED_SOURCES_PATH, "utf8")) as RejectedSources)
    : {};
}

export function addBans(bans: Ban[]): void {
  const current = readRejected();
  for (const b of bans) current[b.sourceId] = { key: b.key, reasons: b.reasons };
  const sorted = Object.fromEntries(Object.entries(current).sort(([a], [b]) => (a < b ? -1 : 1)));
  fs.writeFileSync(REJECTED_SOURCES_PATH, JSON.stringify(sorted, null, 2) + "\n");
}
