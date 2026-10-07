import type { ImageLang, VocabImageSource } from "./types";

/**
 * Browser-safe: imported by src/components/VocabImage.tsx. The project
 * origin is hardcoded on purpose (it matches ios/LearnWithAlphonso/Sources/
 * AppConfig.swift and VocabImagePolicy.swift): the guard must reject any
 * other host, including a different Supabase project.
 */
export const SUPABASE_PROJECT_ORIGIN = "https://qhcjpfbxfcltjbiuknyt.supabase.co";
export const VOCAB_IMAGE_BUCKET = "vocab-images";
export const VOCAB_IMAGE_PUBLIC_BASE = `${SUPABASE_PROJECT_ORIGIN}/storage/v1/object/public/${VOCAB_IMAGE_BUCKET}/`;
/** 512 KiB. A 700px JPEG at q80 is about 60-150 KB. */
export const VOCAB_IMAGE_MAX_BYTES = 524288;
export const VOCAB_IMAGE_MIME = "image/jpeg";

const URL_SHAPE =
  /^https:\/\/qhcjpfbxfcltjbiuknyt\.supabase\.co\/storage\/v1\/object\/public\/vocab-images\/(en|fr|es)\/([a-z0-9-]+)\.jpg\?v=([0-9a-f]{8})$/;

export function parseVocabImageUrl(
  url: string,
): { lang: ImageLang; slug: string; version: string } | null {
  const m = URL_SHAPE.exec(url);
  if (!m) return null;
  return { lang: m[1] as ImageLang, slug: m[2], version: m[3] };
}

/** True only for a self-hosted, versioned bucket URL. Anything else never renders. */
export function isRenderableVocabImageUrl(url: string): boolean {
  return parseVocabImageUrl(url) !== null;
}

const SOURCE_PAGE: Record<VocabImageSource, RegExp> = {
  pexels: /^https:\/\/www\.pexels\.com\/photo\/[^\s/?#]+\/?$/,
  pixabay: /^https:\/\/pixabay\.com\/(?:photos|illustrations|vectors)\/[^\s/?#]+\/?$/,
};

export function isSourcePageUrl(source: VocabImageSource, url: string): boolean {
  return SOURCE_PAGE[source].test(url);
}
