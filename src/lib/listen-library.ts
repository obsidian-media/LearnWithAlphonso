import { episodeCourse, type PodcastFolder } from "./podcast-tree";

/**
 * Pure logic behind the Listen shelf (rooms per folder, continue listening, per-episode progress).
 * Nothing here reads a clock or the network, so every rule is testable; the server function in
 * podcast.functions.ts supplies the rows.
 */
export type Course = "en" | "fr" | "es";

export type LibraryEpisode = {
  id: string;
  folderId: string;
  title: string;
  durationSeconds: number;
  sortOrder: number;
  course?: Course | null;
};

export type ListenProgressRow = {
  episodeId: string;
  positionS: number;
  completedAt: string | null;
  updatedAt: string;
};

export type EpisodeState = "new" | "inProgress" | "done";

export function episodeState(p: ListenProgressRow | undefined): EpisodeState {
  if (!p) return "new";
  if (p.completedAt) return "done";
  return p.positionS > 0 ? "inProgress" : "new";
}

/** 0..1 of an episode heard. A finished episode is 1 whatever its last position says. */
export function episodeFraction(ep: LibraryEpisode, p: ListenProgressRow | undefined): number {
  if (!p) return 0;
  if (p.completedAt) return 1;
  if (ep.durationSeconds <= 0) return 0;
  return Math.min(1, Math.max(0, p.positionS / ep.durationSeconds));
}

export function secondsLeft(ep: LibraryEpisode, p: ListenProgressRow | undefined): number {
  if (p?.completedAt || !p) return ep.durationSeconds;
  return Math.max(0, ep.durationSeconds - p.positionS);
}

/** 372 -> "6:12". */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** 11520 -> "3 h 12 m", 2400 -> "40 m", 0 -> "0 m". */
export function hoursMinutes(seconds: number): string {
  const m = Math.floor(Math.max(0, seconds) / 60);
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} m` : `${m} m`;
}

const LEVEL = /^([abc][12])$/i;

/** The CEFR level named by any segment of the folder's path (slug or title), or null. */
export function folderLevel(folders: PodcastFolder[], folderId: string): string | null {
  const byId = new Map(folders.map((f) => [f.id, f]));
  let cur = byId.get(folderId);
  for (let depth = 0; cur && depth < 64; depth++) {
    const hit = LEVEL.exec(cur.slug) ?? LEVEL.exec(cur.title.trim());
    if (hit) return hit[1]!.toUpperCase();
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return null;
}

/** Painted rooms that exist on every platform (public/avatar/scenes). */
export const SHELF_ROOMS = [
  "library",
  "kitchen",
  "market",
  "seaside",
  "station",
  "garden",
  "classroom",
  "bank",
  "coffee",
  "radio",
] as const;

const ROOM_KEYWORDS: [RegExp, (typeof SHELF_ROOMS)[number]][] = [
  [/book|librar|read|story|stories/i, "library"],
  [/kitchen|cook|food|recipe/i, "kitchen"],
  [/market|shop|buy/i, "market"],
  [/sea|beach|travel|holiday/i, "seaside"],
  [/station|train|transport/i, "station"],
  [/garden|nature|farm/i, "garden"],
  [/class|school|study/i, "classroom"],
  [/bank|money|post/i, "bank"],
  [/cafe|café|coffee|chat/i, "coffee"],
];

/** A folder's room: by what it is about when the name says, otherwise a stable pick from its slug. */
export function roomForFolder(folder: Pick<PodcastFolder, "slug" | "title">): string {
  for (const [re, room] of ROOM_KEYWORDS) if (re.test(folder.slug) || re.test(folder.title)) return room;
  let h = 0;
  for (const ch of folder.slug) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return SHELF_ROOMS[h % SHELF_ROOMS.length]!;
}

export type Shelf = {
  folder: PodcastFolder;
  level: string | null;
  room: string;
  episodes: LibraryEpisode[];
  doneCount: number;
  /** Whole percent heard across the folder; a finished folder is exactly 100. */
  percent: number;
  totalSeconds: number;
};

/** One shelf per folder that directly holds episodes of `course`, in tree order. Empty folders are not shelves. */
export function buildShelves(
  folders: PodcastFolder[],
  episodes: LibraryEpisode[],
  progress: ListenProgressRow[],
  course: Course,
): Shelf[] {
  const prog = new Map(progress.map((p) => [p.episodeId, p]));
  const byFolder = new Map<string, LibraryEpisode[]>();
  for (const ep of episodes) {
    if ((ep.course ?? episodeCourse(folders, ep.folderId)) !== course) continue;
    byFolder.set(ep.folderId, [...(byFolder.get(ep.folderId) ?? []), ep]);
  }
  const shelves: Shelf[] = [];
  for (const folder of folders) {
    const eps = byFolder.get(folder.id);
    if (!eps?.length) continue;
    eps.sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));
    const fractions = eps.map((e) => episodeFraction(e, prog.get(e.id)));
    const doneCount = eps.filter((e) => episodeState(prog.get(e.id)) === "done").length;
    shelves.push({
      folder,
      level: folderLevel(folders, folder.id),
      room: roomForFolder(folder),
      episodes: eps,
      doneCount,
      percent: doneCount === eps.length ? 100 : Math.floor((fractions.reduce((a, b) => a + b, 0) / eps.length) * 100),
      totalSeconds: eps.reduce((a, e) => a + e.durationSeconds, 0),
    });
  }
  const order = new Map(folders.map((f, i) => [f.id, i]));
  return shelves.sort(
    (a, b) =>
      a.folder.sortOrder - b.folder.sortOrder || order.get(a.folder.id)! - order.get(b.folder.id)!,
  );
}

/** Levels that actually have a shelf, A1 first. The "All" chip is the UI's own. */
export function shelfLevels(shelves: Shelf[]): string[] {
  return [...new Set(shelves.map((s) => s.level).filter((l): l is string => l !== null))].sort();
}

export type ContinueTarget = { shelf: Shelf; episode: LibraryEpisode; progress: ListenProgressRow | undefined };

/**
 * What "Continue listening" offers: the most recently touched episode that is part-way through; failing that, the
 * first unheard episode of the shelf the learner finished something in most recently. Null when they have never
 * listened (the card is then not drawn).
 */
export function continueListening(shelves: Shelf[], progress: ListenProgressRow[]): ContinueTarget | null {
  const prog = new Map(progress.map((p) => [p.episodeId, p]));
  const flat = shelves.flatMap((shelf) => shelf.episodes.map((episode) => ({ shelf, episode })));
  const touched = flat
    .map((x) => ({ ...x, p: prog.get(x.episode.id) }))
    .filter((x) => x.p)
    .sort((a, b) => (a.p!.updatedAt < b.p!.updatedAt ? 1 : -1));
  const partial = touched.find((x) => episodeState(x.p) === "inProgress");
  if (partial) return { shelf: partial.shelf, episode: partial.episode, progress: partial.p };
  const last = touched[0];
  if (!last) return null;
  const next = last.shelf.episodes.find((e) => episodeState(prog.get(e.id)) === "new");
  return next ? { shelf: last.shelf, episode: next, progress: undefined } : null;
}
