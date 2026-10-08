import { createHash } from "node:crypto";
import type { VocabImageRecord } from "./types";

export const SIGNOFF_OWNER = "Shayan Salimi";

export type Signoff = {
  signedOffBy: string;
  signedOffAt: string;
  entryCount: number;
  digest: string;
};

/** sha256 over every key and its URL, alt, credit, source, source page and license, in key order: any change after sign-off is visible. */
export function vocabImagesDigest(images: Record<string, VocabImageRecord>): string {
  const h = createHash("sha256");
  for (const key of Object.keys(images).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))) {
    const i = images[key];
    h.update([key, i.url, i.alt, i.credit, i.source, i.sourcePageUrl, i.license].join("\t") + "\n");
  }
  return h.digest("hex");
}

export function buildSignoff(
  images: Record<string, VocabImageRecord>,
  by: string,
  date: string,
): Signoff {
  if (by !== SIGNOFF_OWNER) throw new Error(`only ${SIGNOFF_OWNER} can sign off vocab images`);
  return {
    signedOffBy: by,
    signedOffAt: date,
    entryCount: Object.keys(images).length,
    digest: vocabImagesDigest(images),
  };
}

export function signoffViolations(
  images: Record<string, VocabImageRecord>,
  signoff: Signoff | null,
): string[] {
  if (!signoff) return ["no owner sign-off (scripts/vocab-images/signoff.json)"];
  const out: string[] = [];
  if (signoff.signedOffBy !== SIGNOFF_OWNER)
    out.push(`signed off by "${signoff.signedOffBy}", not ${SIGNOFF_OWNER}`);
  const count = Object.keys(images).length;
  if (signoff.entryCount !== count)
    out.push(`sign-off covers ${signoff.entryCount} images, data has ${count}`);
  if (signoff.digest !== vocabImagesDigest(images)) {
    out.push(
      "images changed since the owner signed off: rebuild the owner sheet and get a new sign-off",
    );
  }
  return out;
}
