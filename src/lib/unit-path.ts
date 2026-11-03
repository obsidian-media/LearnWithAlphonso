/**
 * Entrance stagger for a lesson node, from its place in its own unit. Capped so every node is visible within half a
 * second: a stagger from a page-wide index kept later units blank for many seconds.
 */
export function pathNodeDelay(placeInUnit: number): number {
  return Math.min(placeInUnit, 10) * 0.05;
}

export type UnitPathState = "done" | "next" | "locked";
export type UnitPathNode = { id: string; state: UnitPathState };

/**
 * The Learn screen's lesson path for one unit: completed lessons are "done"
 * wherever they sit, the first lesson not yet done is "next", the rest are
 * "locked". Shows `max` nodes, starting up to two before "next" (or the last
 * `max` when everything is done). Mirrors UnitPath.nodes in the Kit.
 */
export function unitPathNodes(
  lessonIds: readonly string[],
  completed: ReadonlySet<string>,
  max = 5,
): UnitPathNode[] {
  const nextIndex = lessonIds.findIndex((id) => !completed.has(id));
  const nodes = lessonIds.map((id, i): UnitPathNode => ({
    id,
    state: completed.has(id) ? "done" : i === nextIndex ? "next" : "locked",
  }));
  const anchor = nextIndex === -1 ? nodes.length : nextIndex;
  const start = Math.max(0, Math.min(anchor - 2, nodes.length - max));
  return nodes.slice(start, start + max);
}
