import { buildFolderTree, type FolderNode } from "../../../lib/podcast-tree";
import type { AdminFolder } from "./podcastApi";

/** "8:12" from a count of seconds; null when the duration is not a usable number (never a 0 for unknown). */
export function formatDuration(seconds: number | null | undefined): string | null {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds <= 0) return null;
  const whole = Math.round(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

export type Flat = { folder: AdminFolder; depth: number };
/** The folder tree as one list in display order, each with its depth. */
export function flattenFolders(folders: AdminFolder[]): Flat[] {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const out: Flat[] = [];
  const walk = (nodes: FolderNode[], depth: number) => {
    for (const node of nodes) {
      const folder = byId.get(node.id);
      if (folder) out.push({ folder, depth });
      walk(node.children, depth + 1);
    }
  };
  walk(buildFolderTree(folders), 0);
  return out;
}

/** The folder and every folder under it. */
export function withDescendants(folders: AdminFolder[], id: string): Set<string> {
  const out = new Set<string>([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const f of folders) {
      if (f.parentId && out.has(f.parentId) && !out.has(f.id)) {
        out.add(f.id);
        grew = true;
      }
    }
  }
  return out;
}

/** "Morning Spanish" -> "morning-spanish": a starting point for the slug, which the person can still change. */
export function slugFromTitle(title: string): string {
  return title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
