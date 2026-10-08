import { createHash } from "node:crypto";
import type { ImageLang } from "./types";
import { VOCAB_IMAGE_PUBLIC_BASE } from "./url-policy";

const PLAIN = /^[a-z0-9]+(?: [a-z0-9]+)*$/;

/**
 * Storage slug for a VOCAB_IMAGES key. Plain ASCII keys stay readable
 * ("ice cream" -> "ice-cream"). Any other key gets an 8-hex hash of the
 * exact key appended, so "ice-cream", "café" and "cafe" can never share
 * an object path.
 */
export function slugForTerm(key: string): string {
  const ascii = key
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (PLAIN.test(key)) return ascii;
  const hash = createHash("sha256").update(key, "utf8").digest("hex").slice(0, 8);
  return ascii ? `${ascii}-${hash}` : hash;
}

export function storagePathFor(key: string, lang: ImageLang): string {
  return `${lang}/${slugForTerm(key)}.jpg`;
}

/** `?v=` is the bytes' hash: a replacement at the same path is a new CDN cache key. */
export function publicUrlFor(path: string, sha8: string): string {
  if (!/^[0-9a-f]{8}$/.test(sha8)) throw new Error(`invalid version "${sha8}"`);
  return `${VOCAB_IMAGE_PUBLIC_BASE}${path}?v=${sha8}`;
}

export function sha8Of(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex").slice(0, 8);
}
