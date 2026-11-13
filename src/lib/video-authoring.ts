import { CAMPAIGNS } from "@/data/campaigns";
import { getCourse, type Course } from "@/data/courses";
import { SCENARIOS } from "@/data/scenarios";
import { isValidSlug } from "./podcast-tree";

/**
 * The pure half of scripts/video-tool.ts (the owner-run uploader for the Library's Watch shelf): slug and path rules,
 * tag and practice-target parsing, the file-type sniffing, the row it writes and the checks `publish` runs. It lives here
 * because scripts/ is outside the typecheck and the test run, and a typo in a flag must fail on the typo, not on a raw
 * Postgres constraint after a multi-megabyte upload.
 */

export const VIDEO_BUCKET = "videos";
/** The byte-order mark some editors put first in a text file (spelled as a code point: it is invisible). */
const BOM = String.fromCharCode(0xfeff);
export const VIDEO_COURSES: readonly Course[] = ["en", "fr", "es"];
export const PRACTICE_KINDS = ["lesson", "talk", "campaign"] as const;
export type PracticeKind = (typeof PRACTICE_KINDS)[number];
export const MAX_TAGS = 12;
/** The bucket's own cap (see the migration); a bigger file fails there, this fails first with a readable message. */
export const MAX_VIDEO_BYTES = 52_428_800;

/** Object paths inside the `videos` bucket: `<course>/<slug>.mp4`, `.jpg`, `.<course>.vtt`. */
export function videoStoragePaths(
  course: string,
  slug: string,
): { video: string; poster: string; captions: string } {
  return {
    video: `${course}/${slug}.mp4`,
    poster: `${course}/${slug}.jpg`,
    captions: `${course}/${slug}.${course}.vtt`,
  };
}

/** `food, Travel,food` becomes ["food", "travel"]: lower-case kebab labels, unique, in the order given. */
export function parseTags(raw: string | undefined): string[] {
  if (!raw) return [];
  const tags: string[] = [];
  for (const piece of raw.split(",")) {
    const tag = piece.trim().toLowerCase();
    if (!tag) continue;
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(tag)) {
      throw new Error(
        `tag "${piece.trim()}" must be lower-case letters and digits, joined by hyphens.`,
      );
    }
    if (!tags.includes(tag)) tags.push(tag);
  }
  if (tags.length > MAX_TAGS) throw new Error(`at most ${MAX_TAGS} tags, got ${tags.length}.`);
  return tags;
}

/** `talk:coffee` becomes {kind: "talk", id: "coffee"}; anything else is an error naming what is accepted. */
export function parsePracticeTarget(raw: string): { kind: PracticeKind; id: string } {
  const at = raw.indexOf(":");
  const kind = at > 0 ? raw.slice(0, at) : "";
  const id = at > 0 ? raw.slice(at + 1).trim() : "";
  if (!(PRACTICE_KINDS as readonly string[]).includes(kind) || !id) {
    throw new Error(
      `--practice must look like <kind>:<id> with kind one of ${PRACTICE_KINDS.join(", ")} (for example talk:coffee), but got "${raw}".`,
    );
  }
  return { kind: kind as PracticeKind, id };
}

/** Null when the target exists in this course's content, else the reason it does not (a typo opens nothing in the app). */
export function practiceTargetProblem(
  course: Course,
  target: { kind: PracticeKind; id: string },
): string | null {
  if (target.kind === "lesson") {
    const ids = getCourse(course).curriculum.flatMap((u) => u.lessons.map((l) => l.id));
    return ids.includes(target.id) ? null : `no ${course} lesson "${target.id}".`;
  }
  if (target.kind === "talk") {
    return SCENARIOS.some((s) => s.id === target.id) ? null : `no Talk scenario "${target.id}".`;
  }
  return CAMPAIGNS.some((c) => c.id === target.id) ? null : `no story campaign "${target.id}".`;
}

/** An MP4 starts with a box whose type, at byte 4, is `ftyp`. Rejects a renamed .mov, .webm or text file by name. */
export function isLikelyMp4(bytes: Uint8Array): boolean {
  return (
    bytes.length > 12 &&
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70
  );
}

export function isLikelyJpeg(bytes: Uint8Array): boolean {
  return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

/** A WebVTT file starts with the signature `WEBVTT` (after an optional byte-order mark) and holds at least one cue. */
export function isLikelyVtt(text: string): boolean {
  const body = text.startsWith(BOM) ? text.slice(1) : text;
  return /^WEBVTT(\s|$)/.test(body) && body.includes("-->");
}

export type VideoDraft = {
  slug: string;
  course: string | null;
  title: string;
  description: string | null;
  levelId: string | null;
  durationSeconds: number;
  tags: string[];
  practice: { kind: PracticeKind; id: string } | null;
  sortOrder: number;
};

/** Everything wrong with a draft, one readable line each; empty means it can be written. */
export function validateVideoDraft(draft: VideoDraft, levelIds: readonly string[]): string[] {
  const problems: string[] = [];
  if (!isValidSlug(draft.slug))
    problems.push(`invalid slug "${draft.slug}": use lowercase kebab-case.`);
  if (!draft.course) problems.push("--course is required (en, fr or es).");
  else if (!VIDEO_COURSES.includes(draft.course as Course))
    problems.push(`course "${draft.course}" is not one of ${VIDEO_COURSES.join(", ")}.`);
  else if (!draft.slug.startsWith(`${draft.course}-`))
    problems.push(
      `slug "${draft.slug}" should start with "${draft.course}-" so slugs stay unique across courses.`,
    );
  if (!draft.title.trim()) problems.push("--title is required.");
  if (draft.levelId && !levelIds.includes(draft.levelId))
    problems.push(`level "${draft.levelId}" is not one of ${levelIds.join(", ")}.`);
  if (!Number.isInteger(draft.durationSeconds) || draft.durationSeconds <= 0)
    problems.push(
      "the duration could not be read from the mp4; refusing to write a row without one.",
    );
  if (draft.practice && draft.course && VIDEO_COURSES.includes(draft.course as Course)) {
    const problem = practiceTargetProblem(draft.course as Course, draft.practice);
    if (problem) problems.push(`--practice: ${problem}`);
  }
  return problems;
}

/** The `videos` row `add` upserts: always unpublished, whatever the row held before (publishing is its own step). */
export function buildVideoRow(draft: VideoDraft) {
  const paths = videoStoragePaths(draft.course ?? "", draft.slug);
  return {
    slug: draft.slug,
    course: draft.course,
    title: draft.title.trim(),
    description: draft.description?.trim() || null,
    level_id: draft.levelId,
    duration_seconds: draft.durationSeconds,
    video_path: paths.video,
    poster_path: paths.poster,
    captions_path: paths.captions,
    tags: draft.tags,
    practice_kind: draft.practice?.kind ?? null,
    practice_id: draft.practice?.id ?? null,
    sort_order: draft.sortOrder,
    published: false,
    published_at: null,
  };
}

export type StoredVideo = {
  slug: string;
  published: boolean;
  video_path: string;
  poster_path: string | null;
  captions_path: string | null;
};

/** What `publish` checks before flipping the flag: captions set, and all three objects really in the bucket. */
export function publishProblems(row: StoredVideo, existingObjects: readonly string[]): string[] {
  const problems: string[] = [];
  if (!row.captions_path)
    problems.push(
      "the video has no captions: captions are ON by default in the player, so it cannot be published without them.",
    );
  for (const [label, path] of [
    ["video", row.video_path],
    ["poster", row.poster_path],
    ["captions", row.captions_path],
  ] as const) {
    if (path && !existingObjects.includes(path))
      problems.push(`the ${label} file ${path} is not in the ${VIDEO_BUCKET} bucket.`);
  }
  return problems;
}

/**
 * Reads the two variables the tool needs out of an env file's text (KEY=VALUE lines, optional `export `, optional
 * quotes, `#` comments). Only the wanted names are returned, so no other secret in the file is ever touched or printed.
 */
export function pickEnv(text: string, wanted: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!m || !wanted.includes(m[1])) continue;
    let value = m[2];
    if (/^(['"]).*\1$/.test(value)) value = value.slice(1, -1);
    if (value) out[m[1]] = value;
  }
  return out;
}
