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
