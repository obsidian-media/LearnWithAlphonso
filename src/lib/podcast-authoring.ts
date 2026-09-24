/**
 * Validation and path logic for podcast authoring (Phase 1a, see
 * docs/superpowers/specs/2026-09-24-podcast-library-phase1-design.md).
 *
 * All the real logic lives here -- scripts/podcast-tool.ts is a thin
 * argv/fs wrapper, the same split scripts/pack-tool.ts uses, because
 * scripts/ sits outside the typecheck include and gets no test coverage.
 */
import { isValidSlug } from "./podcast-tree";

export type EpisodeDraft = {
  folderSlugPath: string[];
  slug: string;
  title: string;
  description: string | null;
  source: "upload" | "tts";
  course: "en" | "fr" | "es" | null;
  levelId: string | null;
};

/** Returns human-readable problems; an empty array means the draft is valid. */
export function validateEpisodeDraft(draft: EpisodeDraft, existingSlugs: string[]): string[] {
  const problems: string[] = [];
  if (!isValidSlug(draft.slug)) {
    problems.push(`Invalid slug "${draft.slug}": use lowercase kebab-case, e.g. ordering-coffee.`);
  }
  if (existingSlugs.includes(draft.slug)) {
    problems.push(`An episode with slug "${draft.slug}" already exists in this folder.`);
  }
  if (!draft.title.trim()) problems.push("Episode title must not be empty.");
  if (draft.folderSlugPath.length === 0) {
    problems.push("Episode must name a folder path, e.g. --folder en/a1.");
  }
  for (const segment of draft.folderSlugPath) {
    if (!isValidSlug(segment)) problems.push(`Invalid folder path segment "${segment}".`);
  }
  return problems;
}

/**
 * The object key inside the podcast-audio bucket. Derived from the
 * folder path rather than stored separately so the bucket browses the
 * same way the app does.
 */
export function storagePathFor(draft: EpisodeDraft): string {
  return `${draft.folderSlugPath.join("/")}/${draft.slug}.mp3`;
}
