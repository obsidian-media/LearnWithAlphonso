/**
 * Interactive branching stories (docs/superpowers/specs/2026-11-18-interactive-branching-stories-design.md):
 * the pure rules behind the branching reader. A branching story is a tree of read-along nodes joined by choice
 * points, reaching one of several endings. These functions navigate the tree and re-walk a chosen path; the
 * server (public.finish_branching_story) is the authority on the ending reached and the reading credit, and
 * walk() here is its TypeScript twin — the same algorithm, used to drive the UI and guarded by the same tests.
 */

export type EndingQuality = "good" | "ok" | "lesser";

export type StoryEnding = {
  id: string;
  title: string;
  /** A short wrap shown on the ending screen. */
  wrap: string;
  quality: EndingQuality;
};

export type StoryChoiceOption = {
  label: string;
  /** The node this option leads to. */
  goto: string;
  /** True when this option reflects having understood the passage (the attentive path). Drives nothing punitive. */
  clue: boolean;
};

export type StoryChoice = {
  prompt: string;
  options: StoryChoiceOption[];
};

export type StoryNode = {
  /** The read-along text, one sentence/short paragraph per element (the v1 reader unit). */
  segments: string[];
  /** Scene-art object key inside the story-art bucket; optional. The server resolves it to a URL. */
  art?: string;
  /** The resolved public URL for the scene art, or null when there is none (graceful placeholder). */
  artUrl?: string | null;
  /** A choice node (2-3 blended options). Exactly one of choice / next / ending is present. */
  choice?: StoryChoice;
  /** A single linear link to the next node. */
  next?: string;
  /** A terminal ending node. */
  ending?: StoryEnding;
};

export type StoryGraph = {
  start: string;
  map: Record<string, StoryNode>;
};

export type NodeKind = "choice" | "link" | "ending" | "invalid";

/** What a node does: branch, link on, end, or (a content error) nothing. */
export function nodeKind(node: StoryNode | undefined): NodeKind {
  if (!node) return "invalid";
  if (node.ending) return "ending";
  if (node.choice) return "choice";
  if (node.next) return "link";
  return "invalid";
}

export type WalkResult =
  | { status: "awaiting"; nodeId: string; node: StoryNode }
  | { status: "ended"; nodeId: string; node: StoryNode; ending: StoryEnding }
  | { status: "invalid"; reason: string };

/**
 * Re-walks `path` (the option index chosen at each choice node, in order) from the graph's start, auto-following
 * linear links. Stops at the choice node that needs the next pick ("awaiting"), at an ending ("ended"), or reports
 * "invalid" for a missing node, an out-of-range option, a node with no continuation, extra unconsumed choices, or a
 * graph deep enough to look cyclic. This is the exact algorithm public.finish_branching_story runs server-side, so
 * the ending the learner sees and the ending the server credits can never disagree.
 */
export function walk(graph: StoryGraph, path: number[]): WalkResult {
  let cur = graph.start;
  let step = 0;
  for (let guard = 0; guard < 100; guard++) {
    const node = graph.map[cur];
    if (!node) return { status: "invalid", reason: "missing-node" };
    if (node.ending) {
      // Reaching an ending with choices still left in the path means the path was fabricated.
      if (step !== path.length) return { status: "invalid", reason: "unconsumed-path" };
      return { status: "ended", nodeId: cur, node, ending: node.ending };
    }
    if (node.choice) {
      if (step >= path.length) return { status: "awaiting", nodeId: cur, node };
      const idx = path[step];
      const option = node.choice.options[idx];
      if (!option) return { status: "invalid", reason: "bad-option" };
      cur = option.goto;
      step += 1;
      continue;
    }
    if (node.next) {
      cur = node.next;
      continue;
    }
    return { status: "invalid", reason: "dead-node" };
  }
  return { status: "invalid", reason: "too-deep" };
}

/** The next node id after picking option `optionIndex` at `nodeId`, or null if that is not a valid choice. */
export function chooseOption(
  graph: StoryGraph,
  nodeId: string,
  optionIndex: number,
): string | null {
  const node = graph.map[nodeId];
  const option = node?.choice?.options[optionIndex];
  return option ? option.goto : null;
}

/** Every ending in the graph, in a stable order, for the endings-found tracker and the stars total. */
export function allEndings(graph: StoryGraph): StoryEnding[] {
  return Object.keys(graph.map)
    .sort()
    .map((id) => graph.map[id].ending)
    .filter((e): e is StoryEnding => !!e);
}

/** Adds an ending id to the found set without duplicating it (the SQL dedupe's twin). */
export function mergeEnding(found: string[], id: string): string[] {
  return found.includes(id) ? found : [...found, id];
}

/**
 * The ending screen's stars, a blend (defaulted decision #1): 1 for reaching any ending, +1 for having reached a
 * `good` ending, +1 for having found every ending. Capped at 3. Soft: a lesser ending still earns the first star.
 */
export function storyStars(input: {
  endingsFound: number;
  endingsTotal: number;
  reachedGood: boolean;
}): number {
  let stars = 0;
  if (input.endingsFound >= 1) stars += 1;
  if (input.reachedGood) stars += 1;
  if (input.endingsTotal > 0 && input.endingsFound >= input.endingsTotal) stars += 1;
  return Math.min(3, stars);
}

/**
 * The node ids visited walking `path` from the start, links and the final node (the awaiting choice or the
 * ending) included, with the same guards as walk(). Mirrored in Swift and Kotlin.
 */
export function pathNodes(graph: StoryGraph, path: number[]): string[] {
  const out: string[] = [];
  let cur = graph.start;
  let step = 0;
  for (let guard = 0; guard < 100; guard++) {
    const node = graph.map[cur];
    if (!node) break;
    out.push(cur);
    if (node.ending) break;
    if (node.choice) {
      if (step >= path.length) break;
      const option = node.choice.options[path[step]];
      if (!option) break;
      cur = option.goto;
      step += 1;
      continue;
    }
    if (node.next) {
      cur = node.next;
      continue;
    }
    break;
  }
  return out;
}

/**
 * Progress dots for the reader: `current` is the 1-based scene (visitedCount) and `total` adds the shortest
 * remaining route (in nodes, excluding the current one) to any ending, capped at 12.
 */
export function sceneProgress(
  graph: StoryGraph,
  visitedCount: number,
  currentNodeId: string,
): { current: number; total: number } {
  let remaining = 0;
  const seen = new Set<string>([currentNodeId]);
  let frontier = [currentNodeId];
  let depth = 0;
  search: while (frontier.length > 0) {
    const nextFrontier: string[] = [];
    for (const id of frontier) {
      const node = graph.map[id];
      if (!node) continue;
      if (node.ending) {
        remaining = depth;
        break search;
      }
      const targets = node.choice
        ? node.choice.options.map((o) => o.goto)
        : node.next
          ? [node.next]
          : [];
      for (const t of targets) {
        if (!seen.has(t)) {
          seen.add(t);
          nextFrontier.push(t);
        }
      }
    }
    frontier = nextFrontier;
    depth += 1;
  }
  return { current: visitedCount, total: Math.min(12, visitedCount + remaining) };
}

export type BranchEndingState = "current" | "found" | "locked";
export type BranchMapNode = {
  id: string;
  kind: "start" | "branch" | "ending";
  x: number;
  y: number;
  depth: number;
  onPath: boolean;
  ending?: { id: string; title: string; state: BranchEndingState };
};
export type BranchMapEdge = {
  from: string;
  to: string;
  style: "taken" | "found" | "locked" | "plain";
};
export type BranchMap = {
  nodes: BranchMapNode[];
  edges: BranchMapEdge[];
  endingsTotal: number;
  endingsFound: number;
  lockedCount: number;
};

/** Follows `next` links from `id` to a choice or ending node; null for a missing/dead node or a link cycle. */
function resolveNode(graph: StoryGraph, id: string): string | null {
  const seen = new Set<string>();
  let cur = id;
  for (;;) {
    if (seen.has(cur)) return null;
    seen.add(cur);
    const node = graph.map[cur];
    if (!node) return null;
    if (node.ending || node.choice) return cur;
    if (!node.next) return null;
    cur = node.next;
  }
}

/**
 * The ending screen's tree: linear chains collapsed, endings at the right edge, branch nodes by depth, each
 * ending marked current / found / locked. Layout is in a unit box (x, y in 0..1). Mirrored in Swift and Kotlin.
 */
export function branchMap(
  graph: StoryGraph,
  takenPath: number[],
  found: string[],
  currentEndingId: string | null,
): BranchMap {
  const empty: BranchMap = {
    nodes: [],
    edges: [],
    endingsTotal: 0,
    endingsFound: 0,
    lockedCount: 0,
  };
  const rootId = resolveNode(graph, graph.start);
  if (!rootId) return empty;

  const onPathIds = new Set(
    pathNodes(graph, takenPath).filter((id) => {
      const k = nodeKind(graph.map[id]);
      return k === "choice" || k === "ending";
    }),
  );
  const stateOf = (e: StoryEnding): BranchEndingState =>
    e.id === currentEndingId ? "current" : found.includes(e.id) ? "found" : "locked";

  type Raw = { id: string; depth: number; children: string[]; y: number };
  const raws = new Map<string, Raw>();
  const order: string[] = [];
  const edgePairs: Array<[string, string]> = [];
  const leafOrder: string[] = [];

  const visit = (id: string, depth: number): void => {
    const raw: Raw = { id, depth, children: [], y: 0 };
    raws.set(id, raw);
    order.push(id);
    const node = graph.map[id];
    if (node.choice) {
      for (const option of node.choice.options) {
        const child = resolveNode(graph, option.goto);
        if (!child || raws.has(child)) continue;
        raw.children.push(child);
        edgePairs.push([id, child]);
        visit(child, depth + 1);
      }
    }
    if (raw.children.length === 0) leafOrder.push(id);
  };
  visit(rootId, 0);

  leafOrder.forEach((id, i) => {
    raws.get(id)!.y = (i + 0.5) / leafOrder.length;
  });
  // Children follow their parent in `order`, so walking it in reverse settles every child before its parent.
  for (let i = order.length - 1; i >= 0; i--) {
    const raw = raws.get(order[i])!;
    if (raw.children.length > 0) {
      const first = raws.get(raw.children[0])!.y;
      const last = raws.get(raw.children[raw.children.length - 1])!.y;
      raw.y = (first + last) / 2;
    }
  }

  let maxInternalDepth = 0;
  for (const raw of raws.values()) {
    if (!graph.map[raw.id].ending) maxInternalDepth = Math.max(maxInternalDepth, raw.depth);
  }

  const nodes: BranchMapNode[] = order.map((id) => {
    const raw = raws.get(id)!;
    const ending = graph.map[id].ending;
    const base = { id, depth: raw.depth, y: raw.y, onPath: onPathIds.has(id) };
    if (ending) {
      return {
        ...base,
        kind: id === rootId ? "start" : "ending",
        x: id === rootId ? 0 : 1,
        ending: { id: ending.id, title: ending.title, state: stateOf(ending) },
      };
    }
    return {
      ...base,
      kind: id === rootId ? "start" : "branch",
      x: raw.depth / (maxInternalDepth + 1),
    };
  });

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const edges: BranchMapEdge[] = edgePairs.map(([from, to]) => {
    const t = byId.get(to)!;
    const f = byId.get(from)!;
    let style: BranchMapEdge["style"] = "plain";
    if (f.onPath && t.onPath) style = "taken";
    else if (t.ending?.state === "found") style = "found";
    else if (t.ending?.state === "locked") style = "locked";
    return { from, to, style };
  });

  const endingNodes = nodes.filter((n) => n.ending);
  const lockedCount = endingNodes.filter((n) => n.ending!.state === "locked").length;
  return {
    nodes,
    edges,
    endingsTotal: endingNodes.length,
    endingsFound: endingNodes.length - lockedCount,
    lockedCount,
  };
}

/** The text alternative for the (aria-hidden) diagram. */
export function branchMapSummary(map: BranchMap): string {
  const titles = map.nodes
    .filter((n) => n.ending && n.ending.state !== "locked")
    .map((n) => n.ending!.title)
    .join(", ");
  const n = map.endingsTotal;
  const m = map.endingsFound;
  if (m === n) {
    return n === 1
      ? `You found the only ending: ${titles}.`
      : `You found all ${n} endings: ${titles}.`;
  }
  const hidden =
    map.lockedCount === 1
      ? "1 ending is still hidden."
      : `${map.lockedCount} endings are still hidden.`;
  return m === 0
    ? `You found 0 of ${n} endings. ${hidden}`
    : `You found ${m} of ${n} endings: ${titles}. ${hidden}`;
}

/** The line under the diagram. */
export function branchMapCaption(map: BranchMap): string {
  const lead = "Gold = the path you just took · ";
  if (map.lockedCount === 0) return `${lead}you found every ending`;
  const k = map.lockedCount;
  return `${lead}try the greyed branches for ${k} more ${k === 1 ? "ending" : "endings"}`;
}
