/**
 * Pure folder-tree logic for the podcast library (Phase 1a, see
 * docs/superpowers/specs/2026-09-24-podcast-library-phase1-design.md).
 *
 * The editorial shape the account owner publishes (Course -> Level ->
 * Series) is a convention for populating the tree, not a constraint in
 * the schema -- these functions handle arbitrary depth so the clients
 * can render a generic tree.
 *
 * Cycle detection lives here rather than in a Postgres trigger because
 * only service_role (scripts/podcast-tool.ts) ever writes folders -- the
 * same reasoning that keeps pack validation in pack-authoring.ts.
 */

export type PodcastFolder = {
  id: string;
  parentId: string | null;
  slug: string;
  title: string;
  description: string | null;
  sortOrder: number;
  /** Set on root folders (`en`, `fr`, `es`); null/absent on nested folders and on a root shown to every course. */
  course?: "en" | "fr" | "es" | null;
};

export type FolderNode = PodcastFolder & { children: FolderNode[] };

/** Lowercase kebab-case: safe in a URL path and in a storage object key. */
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function isValidSlug(slug: string): boolean {
  return SLUG.test(slug);
}

export function buildFolderTree(folders: PodcastFolder[]): FolderNode[] {
  const byId = new Map<string, FolderNode>();
  for (const folder of folders) byId.set(folder.id, { ...folder, children: [] });

  const roots: FolderNode[] = [];
  for (const node of byId.values()) {
    if (node.parentId === null) {
      roots.push(node);
      continue;
    }
    // A child whose parent is absent is dropped, not promoted to a root:
    // surfacing it at top level would misrepresent the tree.
    byId.get(node.parentId)?.children.push(node);
  }

  const sort = (nodes: FolderNode[]) => {
    nodes.sort((a, b) => a.sortOrder - b.sortOrder || a.slug.localeCompare(b.slug));
    for (const node of nodes) sort(node.children);
  };
  sort(roots);
  return roots;
}

/**
 * Walks a slug path one level at a time. Matching by (parentId, slug)
 * rather than by slug alone matters: the same slug can legitimately
 * appear under different parents, and a global slug lookup would resolve
 * "en/cafe" to a "cafe" folder living somewhere else entirely.
 */
export function resolveFolderPath(
  folders: PodcastFolder[],
  segments: string[],
): PodcastFolder | null {
  let parentId: string | null = null;
  let current: PodcastFolder | null = null;
  for (const segment of segments) {
    const match = folders.find((folder) => folder.parentId === parentId && folder.slug === segment);
    if (!match) return null;
    current = match;
    parentId = match.id;
  }
  return current;
}

/**
 * The slug path from the root down to `folderId`, root-first -- the
 * reverse walk of resolveFolderPath, and what storagePathFor's
 * `folderSlugPath` needs to place a new episode's audio object. Returns
 * null for an unknown id or a cyclic chain (should never happen --
 * findCycle guards every write -- but a caller building a storage key
 * deserves null, not an infinite loop).
 */
export function slugPathFor(folders: PodcastFolder[], folderId: string): string[] | null {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const slugs: string[] = [];
  const seen = new Set<string>();
  let currentId: string | null = folderId;
  while (currentId !== null) {
    if (seen.has(currentId)) return null;
    seen.add(currentId);
    const folder = byId.get(currentId);
    if (!folder) return null;
    slugs.push(folder.slug);
    currentId = folder.parentId;
  }
  return slugs.reverse();
}

/** Returns the ids involved in the first cycle found, or null if acyclic. */
export function findCycle(folders: PodcastFolder[]): string[] | null {
  const parentOf = new Map(folders.map((folder) => [folder.id, folder.parentId]));
  for (const folder of folders) {
    const seen: string[] = [];
    let cursor: string | null | undefined = folder.id;
    while (cursor != null) {
      if (seen.includes(cursor)) return seen.slice(seen.indexOf(cursor));
      seen.push(cursor);
      cursor = parentOf.get(cursor) ?? null;
    }
  }
  return null;
}

/**
 * The course an episode is in: the `course` of the root folder above its folder.
 * Null when the root carries none (it is shown to every course), the folder is
 * unknown, or the parent chain is broken or cyclic.
 */
export function episodeCourse(
  folders: PodcastFolder[],
  folderId: string,
): "en" | "fr" | "es" | null {
  const byId = new Map(folders.map((f) => [f.id, f]));
  let current = byId.get(folderId);
  for (let depth = 0; current && depth < 64; depth++) {
    if (current.parentId === null) return current.course ?? null;
    current = byId.get(current.parentId);
  }
  return null;
}

/**
 * The course a tapped transcript word is saved under: the episode's own course,
 * else its root folder's, and only when both are unknown the learner's active
 * course, never a fixed one.
 */
export function transcriptSaveCourse(
  folders: PodcastFolder[],
  folderId: string,
  activeCourse: "en" | "fr" | "es",
  ownCourse: "en" | "fr" | "es" | null = null,
): "en" | "fr" | "es" {
  return ownCourse ?? episodeCourse(folders, folderId) ?? activeCourse;
}
