/**
 * Planning for scripts/podcast-tool.ts `unpublish`. Pure, typechecked and tested; the script
 * is a thin wrapper that reads rows, prints this plan, and writes only with --confirm.
 *
 * Unpublishing hides the ROW. The podcast-audio bucket is public-read, so the MP3 stays
 * fetchable by URL until it is deleted (`--remove-audio`).
 */
import { isPublishableProvider } from "./podcast-provenance";
import { isValidSlug, resolveFolderPath, slugPathFor, type PodcastFolder } from "./podcast-tree";

type CourseId = "en" | "fr" | "es";

export type UnpublishEpisode = {
  id: string;
  folderId: string;
  slug: string;
  title: string;
  published: boolean;
  audioPath: string;
  course: CourseId | null;
  voiceProvider: string;
};

export type UnpublishTarget = { segments: string[]; slug: string; line: number };

export type UnpublishPlan = {
  toUnpublish: UnpublishEpisode[];
  alreadyUnpublished: UnpublishEpisode[];
  problems: string[];
};

export function parseUnpublishList(text: string): {
  targets: UnpublishTarget[];
  problems: string[];
} {
  const targets: UnpublishTarget[] = [];
  const problems: string[] = [];
  const seen = new Set<string>();
  text.split(/\r?\n/).forEach((raw, index) => {
    const line = index + 1;
    const value = raw.trim();
    if (!value || value.startsWith("#")) return;
    const parts = value.split("/").filter(Boolean);
    if (parts.length < 2) {
      problems.push(
        `line ${line}: "${value}" needs a folder path and a slug, e.g. en/c1/why-we-procrastinate.`,
      );
      return;
    }
    if (!parts.every(isValidSlug)) {
      problems.push(`line ${line}: "${value}" is not a lowercase kebab-case path.`);
      return;
    }
    const key = parts.join("/");
    if (seen.has(key)) {
      problems.push(`line ${line}: "${value}" is listed twice.`);
      return;
    }
    seen.add(key);
    targets.push({ segments: parts.slice(0, -1), slug: parts[parts.length - 1]!, line });
  });
  return { targets, problems };
}

export function planUnpublishTargets(
  targets: UnpublishTarget[],
  folders: PodcastFolder[],
  episodes: UnpublishEpisode[],
): UnpublishPlan {
  const plan: UnpublishPlan = { toUnpublish: [], alreadyUnpublished: [], problems: [] };
  for (const target of targets) {
    const folderPath = target.segments.join("/");
    const folder = resolveFolderPath(folders, target.segments);
    if (!folder) {
      plan.problems.push(`line ${target.line}: folder "${folderPath}" does not exist.`);
      continue;
    }
    const match = episodes.find(
      (episode) => episode.folderId === folder.id && episode.slug === target.slug,
    );
    if (!match) {
      plan.problems.push(`line ${target.line}: no episode "${target.slug}" in ${folderPath}.`);
      continue;
    }
    (match.published ? plan.toUnpublish : plan.alreadyUnpublished).push(match);
  }
  return plan;
}

/**
 * Every unlicensed episode: published ones to hide, unpublished ones listed so
 * `--remove-audio` can still delete their objects on a later run.
 */
export function planUnpublishUnlicensed(episodes: UnpublishEpisode[]): UnpublishPlan {
  const unlicensed = episodes.filter((episode) => !isPublishableProvider(episode.voiceProvider));
  return {
    toUnpublish: unlicensed.filter((episode) => episode.published),
    alreadyUnpublished: unlicensed.filter((episode) => !episode.published),
    problems: [],
  };
}

export function publishedCountsAfter(
  episodes: UnpublishEpisode[],
  removing: ReadonlySet<string>,
): Record<CourseId, number> {
  const counts: Record<CourseId, number> = { en: 0, fr: 0, es: 0 };
  for (const episode of episodes) {
    if (episode.published && episode.course && !removing.has(episode.id))
      counts[episode.course] += 1;
  }
  return counts;
}

export function coursesLeftEmpty(counts: Record<CourseId, number>): CourseId[] {
  return (["en", "fr", "es"] as const).filter((course) => counts[course] === 0);
}

export function episodePath(folders: PodcastFolder[], episode: UnpublishEpisode): string {
  const segments = slugPathFor(folders, episode.folderId);
  return `${segments ? segments.join("/") : "(unknown folder)"}/${episode.slug}`;
}
