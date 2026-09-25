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

/**
 * Exit code for a command that collected `problems`.
 *
 * Exists because the alternative kept happening: a check finds a real defect,
 * prints it, and exits 0 anyway. `podcast-tool validate` printed
 * "[ERROR] folder tree contains a cycle" and then reported success, so any
 * script, CI step or `&&` chain reading its exit code saw a clean run. The
 * repo's curriculum-consistency.test.ts had the same shape from the other
 * direction: it console.logged 57 Spanish and 7 English duplicate prompts
 * into output vitest swallowed, and a reader reasonably took the silence for
 * zero.
 *
 * A finding that does not reach the exit code is a finding thrown away.
 */
export function exitCodeForProblems(problems: readonly string[]): 0 | 1 {
  return problems.length === 0 ? 0 : 1;
}

/**
 * A one-line summary, or null when there is nothing to summarise.
 *
 * Carries the count because the individual lines may have scrolled away by
 * the time anyone looks.
 */
export function formatProblemSummary(problems: readonly string[]): string | null {
  if (problems.length === 0) return null;
  const noun = problems.length === 1 ? "problem" : "problems";
  return `Found ${problems.length} ${noun}.`;
}
