/**
 * Pure logic behind the Library's Watch shelf (Alphonso tutor videos): states, resume, the speed list, the practice
 * link after a video. Nothing here reads a clock or the network; video.functions.ts supplies the rows. iOS and Android
 * carry the same rules (VideoShelf.swift, VideoShelf.kt); the contract is the same field names and thresholds.
 */
export type VideoCourse = "en" | "fr" | "es";
export type PracticeKind = "lesson" | "talk" | "campaign";

export type LibraryVideo = {
  id: string;
  slug: string;
  course: VideoCourse;
  title: string;
  description: string | null;
  level: string | null;
  durationSeconds: number;
  videoUrl: string;
  posterUrl: string | null;
  /** WebVTT. Always present on a published video (the database refuses to publish without it). */
  captionsUrl: string;
  tags: string[];
  practice: { kind: PracticeKind; id: string } | null;
  sortOrder: number;
  progressSeconds: number;
  completedAt: string | null;
};

export type VideoState = "new" | "inProgress" | "done";

/** Captions are ON when a video opens (accessibility, and viewing with the sound off). */
export const CAPTIONS_DEFAULT_ON = true;
/** A restart is offered instead of a resume inside the last stretch of a video. */
export const RESUME_END_GUARD_SECONDS = 3;
export const PLAYBACK_SPEEDS = [0.75, 1, 1.25, 1.5] as const;
/** Progress is saved at most this often while playing (and on pause, close and end). */
export const SAVE_EVERY_SECONDS = 5;

export function videoState(v: Pick<LibraryVideo, "progressSeconds" | "completedAt">): VideoState {
  if (v.completedAt) return "done";
  return v.progressSeconds > 0 ? "inProgress" : "new";
}

/** 0..1 watched. A finished video is 1 whatever its last position says. */
export function videoFraction(
  v: Pick<LibraryVideo, "progressSeconds" | "completedAt" | "durationSeconds">,
): number {
  if (v.completedAt) return 1;
  if (v.durationSeconds <= 0) return 0;
  return Math.min(1, Math.max(0, v.progressSeconds / v.durationSeconds));
}

/** Where playback starts: the saved position, or 0 for a finished video, a new one, or one saved at its very end. */
export function resumeSeconds(
  v: Pick<LibraryVideo, "progressSeconds" | "completedAt" | "durationSeconds">,
): number {
  if (v.completedAt) return 0;
  if (v.progressSeconds <= 0) return 0;
  if (v.progressSeconds >= v.durationSeconds - RESUME_END_GUARD_SECONDS) return 0;
  return v.progressSeconds;
}

/** The Watch shelf for one course: its videos in shelf order. Empty means the shelf is NOT drawn (no empty box). */
export function watchShelf(videos: readonly LibraryVideo[], course: VideoCourse): LibraryVideo[] {
  return videos
    .filter((v) => v.course === course)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));
}

/** The next speed in the cycle; an unknown current speed restarts the cycle at normal speed. */
export function nextSpeed(current: number): number {
  const i = PLAYBACK_SPEEDS.indexOf(current as (typeof PLAYBACK_SPEEDS)[number]);
  if (i < 0) return 1;
  return PLAYBACK_SPEEDS[(i + 1) % PLAYBACK_SPEEDS.length];
}

export const speedLabel = (speed: number) => `${speed}x`;

export type PracticeLink =
  | { to: "/lesson/$id"; params: { id: string } }
  | { to: "/converse/$scenarioId"; params: { scenarioId: string } }
  | { to: "/campaign/$campaignId"; params: { campaignId: string }; search: { scene: number } };

/** Where the one-tap "practice this" after a video goes, or null when the video names no practice. */
export function practiceLink(practice: LibraryVideo["practice"]): PracticeLink | null {
  if (!practice) return null;
  if (practice.kind === "lesson") return { to: "/lesson/$id", params: { id: practice.id } };
  if (practice.kind === "talk")
    return { to: "/converse/$scenarioId", params: { scenarioId: practice.id } };
  return {
    to: "/campaign/$campaignId",
    params: { campaignId: practice.id },
    search: { scene: 0 },
  };
}

export const PRACTICE_LABEL: Record<PracticeKind, string> = {
  lesson: "Practice this in a lesson",
  talk: "Practice this with Alphonso",
  campaign: "Practice this in a story",
};

export type VideoRow = {
  id: string;
  slug: string;
  course: string;
  title: string;
  description: string | null;
  level_id: string | null;
  duration_seconds: number;
  video_path: string;
  poster_path: string | null;
  captions_path: string | null;
  tags: string[] | null;
  practice_kind: string | null;
  practice_id: string | null;
  sort_order: number;
};
export type VideoWatchRow = {
  video_id: string;
  progress_seconds: number;
  completed_at: string | null;
};

const isCourse = (c: string): c is VideoCourse => c === "en" || c === "fr" || c === "es";
const isPracticeKind = (k: string | null): k is PracticeKind =>
  k === "lesson" || k === "talk" || k === "campaign";

/**
 * One database row plus this learner's watch row as the clients see it. A row the app cannot play (an unknown course, or
 * no captions) is dropped: showing it would break the captions-on promise, and the database already refuses to publish one.
 */
export function toLibraryVideo(
  row: VideoRow,
  watch: VideoWatchRow | undefined,
  publicUrl: (path: string) => string,
): LibraryVideo | null {
  if (!isCourse(row.course) || !row.captions_path) return null;
  return {
    id: row.id,
    slug: row.slug,
    course: row.course,
    title: row.title,
    description: row.description,
    level: row.level_id,
    durationSeconds: row.duration_seconds,
    videoUrl: publicUrl(row.video_path),
    posterUrl: row.poster_path ? publicUrl(row.poster_path) : null,
    captionsUrl: publicUrl(row.captions_path),
    tags: row.tags ?? [],
    practice:
      isPracticeKind(row.practice_kind) && row.practice_id
        ? { kind: row.practice_kind, id: row.practice_id }
        : null,
    sortOrder: row.sort_order,
    progressSeconds: watch?.progress_seconds ?? 0,
    completedAt: watch?.completed_at ?? null,
  };
}
