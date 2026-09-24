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
