import type { Course } from "../../data/courses";

/** A vocab image's language is the course whose lessons it was chosen for. */
export type ImageLang = Course;
export const IMAGE_LANGS: readonly ImageLang[] = ["en", "fr", "es"];

export type VocabImageSource = "pexels" | "pixabay";

export const LICENSE_FOR_SOURCE: Record<VocabImageSource, string> = {
  pexels: "Pexels License (https://www.pexels.com/license/)",
  pixabay: "Pixabay Content License (https://pixabay.com/service/license-summary/)",
};

/**
 * One vocab-card image (App Store remediation W1). Self-hosted in the
 * `vocab-images` bucket, visually reviewed, provenance recorded. Every
 * field is required: src/data/vocab-images.guard.test.ts enforces the
 * values, the type enforces their presence.
 */
export type VocabImageRecord = {
  /** Public bucket URL with a `?v=<sha8>` content version. */
  url: string;
  /** Reviewer-written description. User-facing (screen readers). */
  alt: string;
  /** Photographer, as the provider names them. */
  credit: string;
  source: VocabImageSource;
  /** The provider's photo page (never a download URL). */
  sourcePageUrl: string;
  license: string;
  /** `agent:<id>` of the first-pass reviewer, `+agent:<id>` for a second pass. */
  reviewedBy: string;
  /** YYYY-MM-DD (UTC) of the first-pass review. */
  reviewedAt: string;
};
