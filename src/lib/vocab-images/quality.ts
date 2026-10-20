import type { ManifestEntry } from "./manifest";

export type QualityFlag =
  | "small-image"
  | "extreme-aspect-ratio"
  | "missing-provider-description"
  | "duplicate-image-hash"
  | "not-visually-reviewed";

export type QualityAssessment = {
  key: string;
  score: number;
  flags: QualityFlag[];
  width: number;
  height: number;
  duplicateOf?: string;
};

/**
 * Deterministic triage score (0–100), not a semantic or safety judgment.
 * It uses only manifest metadata; a high score never substitutes for looking
 * at the actual image and confirming it depicts the intended concept.
 */
export function scoreVocabImageCandidates(entries: ManifestEntry[]): QualityAssessment[] {
  const firstByHash = new Map<string, string>();
  return entries
    .filter((entry) => entry.candidate)
    .map((entry) => {
      const candidate = entry.candidate!;
      const flags: QualityFlag[] = [];
      let score = 100;

      if (Math.min(candidate.width, candidate.height) < 500) {
        flags.push("small-image");
        score -= Math.min(candidate.width, candidate.height) < 300 ? 35 : 15;
      }
      const ratio = candidate.width / candidate.height;
      if (!Number.isFinite(ratio) || ratio < 1 / 3 || ratio > 3) {
        flags.push("extreme-aspect-ratio");
        score -= 20;
      }
      if (!candidate.providerAlt.trim()) {
        flags.push("missing-provider-description");
        score -= 15;
      }
      const duplicateOf = firstByHash.get(candidate.sha8);
      if (duplicateOf) {
        flags.push("duplicate-image-hash");
        score -= 25;
      } else {
        firstByHash.set(candidate.sha8, entry.key);
      }
      if (!entry.review) {
        flags.push("not-visually-reviewed");
        score -= 20;
      }

      return {
        key: entry.key,
        score: Math.max(0, score),
        flags,
        width: candidate.width,
        height: candidate.height,
        ...(duplicateOf ? { duplicateOf } : {}),
      };
    })
    .sort((a, b) => a.score - b.score || a.key.localeCompare(b.key));
}
