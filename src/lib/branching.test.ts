import { describe, expect, it } from "vitest";
import {
  allEndings,
  branchMap,
  branchMapCaption,
  branchMapSummary,
  chooseOption,
  mergeEnding,
  nodeKind,
  pathNodes,
  sceneProgress,
  storyStars,
  walk,
  type StoryGraph,
} from "./branching";

// A small tree with one linear link and two choice points, modelled on the proof story:
//   n1 (choice) --run-->  n2 (choice) --return--> n4 (GOOD ending)
//                          |                 \--board--> n5 (lesser ending)
//                          \--breakfast--> mid (link) --> n3 (choice) --walk--> n7 (ok ending)
//                                                                       \--wait--> n6 (lesser ending)
const graph: StoryGraph = {
  start: "n1",
  map: {
    n1: {
      segments: ["The bus leaves at 8:20."],
      choice: {
        prompt: "What does Sam do first?",
        options: [
          { label: "Run", goto: "n2", clue: true },
          { label: "Breakfast", goto: "mid", clue: false },
        ],
      },
    },
    n2: {
      segments: ["A wallet: Mrs Patel, Flat 12."],
      choice: {
        prompt: "What does Sam do?",
        options: [
          { label: "Return it", goto: "n4", clue: true },
          { label: "Board", goto: "n5", clue: false },
        ],
      },
    },
    mid: { segments: ["Sam eats a big breakfast."], next: "n3" },
    n3: {
      segments: ["First class is PE, outside."],
      choice: {
        prompt: "What does Sam do?",
        options: [
          { label: "Walk", goto: "n7", clue: true },
          { label: "Wait", goto: "n6", clue: false },
        ],
      },
    },
    n4: {
      segments: ["On time and kind."],
      ending: { id: "good-end", title: "Kind", wrap: "w", quality: "good" },
    },
    n5: {
      segments: ["Uneasy."],
      ending: { id: "uneasy", title: "Uneasy", wrap: "w", quality: "lesser" },
    },
    n6: {
      segments: ["Calm."],
      ending: { id: "calm", title: "Calm", wrap: "w", quality: "lesser" },
    },
    n7: { segments: ["Ready."], ending: { id: "ready", title: "Ready", wrap: "w", quality: "ok" } },
  },
};

describe("nodeKind", () => {
  it("names each node's role", () => {
    expect(nodeKind(graph.map.n1)).toBe("choice");
    expect(nodeKind(graph.map.mid)).toBe("link");
    expect(nodeKind(graph.map.n4)).toBe("ending");
    expect(nodeKind(undefined)).toBe("invalid");
    expect(nodeKind({ segments: [] })).toBe("invalid");
  });
});

describe("walk", () => {
  it("stops at the first choice with an empty path", () => {
    const r = walk(graph, []);
    expect(r.status).toBe("awaiting");
    expect(r).toMatchObject({ nodeId: "n1" });
  });

  it("stops at the next choice once the first is answered", () => {
    expect(walk(graph, [0])).toMatchObject({ status: "awaiting", nodeId: "n2" });
  });

  it("reaches the good ending on the attentive path", () => {
    const r = walk(graph, [0, 0]);
    expect(r.status).toBe("ended");
    expect(r).toMatchObject({ ending: { id: "good-end", quality: "good" } });
  });

  it("reaches a lesser ending when a clue is skipped — never a dead-end (defaulted decision #2)", () => {
    expect(walk(graph, [0, 1])).toMatchObject({ status: "ended", ending: { id: "uneasy" } });
  });

  it("auto-follows a linear link through to the next choice and its endings", () => {
    expect(walk(graph, [1])).toMatchObject({ status: "awaiting", nodeId: "n3" });
    expect(walk(graph, [1, 0])).toMatchObject({
      status: "ended",
      ending: { id: "ready", quality: "ok" },
    });
    expect(walk(graph, [1, 1])).toMatchObject({ status: "ended", ending: { id: "calm" } });
  });

  it("rejects an out-of-range option", () => {
    expect(walk(graph, [9])).toMatchObject({ status: "invalid", reason: "bad-option" });
  });

  it("rejects extra choices after an ending (a fabricated path)", () => {
    expect(walk(graph, [0, 0, 0])).toMatchObject({ status: "invalid", reason: "unconsumed-path" });
  });

  it("rejects a path through a missing node", () => {
    const broken: StoryGraph = { start: "ghost", map: {} };
    expect(walk(broken, [])).toMatchObject({ status: "invalid", reason: "missing-node" });
  });

  it("stops a cyclic graph instead of looping forever", () => {
    const loop: StoryGraph = { start: "a", map: { a: { segments: [], next: "a" } } };
    expect(walk(loop, [])).toMatchObject({ status: "invalid", reason: "too-deep" });
  });
});

describe("chooseOption", () => {
  it("returns the goto for a valid pick and null otherwise", () => {
    expect(chooseOption(graph, "n1", 0)).toBe("n2");
    expect(chooseOption(graph, "n1", 5)).toBeNull();
    expect(chooseOption(graph, "n4", 0)).toBeNull();
  });
});

describe("allEndings", () => {
  it("lists every ending once, in a stable order", () => {
    expect(allEndings(graph).map((e) => e.id)).toEqual(["good-end", "uneasy", "calm", "ready"]);
  });
});

describe("mergeEnding", () => {
  it("adds a new ending and never duplicates one", () => {
    expect(mergeEnding([], "a")).toEqual(["a"]);
    expect(mergeEnding(["a"], "b")).toEqual(["a", "b"]);
    expect(mergeEnding(["a", "b"], "a")).toEqual(["a", "b"]);
  });
});

describe("storyStars (blend)", () => {
  it("gives one star for reaching any ending", () => {
    expect(storyStars({ endingsFound: 1, endingsTotal: 4, reachedGood: false })).toBe(1);
  });
  it("adds a star for reaching a good ending", () => {
    expect(storyStars({ endingsFound: 1, endingsTotal: 4, reachedGood: true })).toBe(2);
  });
  it("adds a star for finding every ending", () => {
    expect(storyStars({ endingsFound: 4, endingsTotal: 4, reachedGood: false })).toBe(2);
    expect(storyStars({ endingsFound: 4, endingsTotal: 4, reachedGood: true })).toBe(3);
  });
  it("is zero before any ending and capped at three", () => {
    expect(storyStars({ endingsFound: 0, endingsTotal: 4, reachedGood: false })).toBe(0);
    expect(storyStars({ endingsFound: 9, endingsTotal: 4, reachedGood: true })).toBe(3);
  });
});

// --- Stories reader redesign: pathNodes, sceneProgress, branchMap (shared spec fixtures) ---
const end = (id: string, title: string) => ({
  segments: ["x"],
  ending: { id, title, wrap: "w", quality: "ok" as const },
});
const opts = (...gotos: string[]) =>
  gotos.map((goto, i) => ({ label: `o${i}`, goto, clue: false }));

// Fixture A (the mock's shape).
const fixA: StoryGraph = {
  start: "start",
  map: {
    start: { segments: ["s"], choice: { prompt: "p", options: opts("a", "b") } },
    a: { segments: ["a"], choice: { prompt: "p", options: opts("e1", "e2") } },
    b: { segments: ["b"], next: "b2" },
    b2: { segments: ["b2"], choice: { prompt: "p", options: opts("e3", "e4") } },
    e1: end("end1", "T1"),
    e2: end("end2", "T2"),
    e3: end("end3", "T3"),
    e4: end("end4", "T4"),
  },
};

describe("pathNodes", () => {
  it("includes link nodes and the final node", () => {
    const g: StoryGraph = {
      start: "start",
      map: {
        start: { segments: ["s"], choice: { prompt: "p", options: opts("a") } },
        a: { segments: ["a"], next: "b" },
        b: end("x", "X"),
      },
    };
    expect(pathNodes(g, [0])).toEqual(["start", "a", "b"]);
    expect(pathNodes(g, [])).toEqual(["start"]);
  });
  it("stops cleanly on a bad option and on a missing node", () => {
    expect(pathNodes(fixA, [5])).toEqual(["start"]);
    expect(pathNodes({ start: "nope", map: {} }, [])).toEqual([]);
  });
  it("stops after 100 steps on a cycle", () => {
    const g: StoryGraph = { start: "a", map: { a: { segments: [], next: "a" } } };
    expect(pathNodes(g, [])).toHaveLength(100);
  });
});

describe("sceneProgress", () => {
  it("counts the shortest remaining route", () => {
    expect(sceneProgress(fixA, 1, "start")).toEqual({ current: 1, total: 3 });
    expect(sceneProgress(fixA, 2, "b")).toEqual({ current: 2, total: 4 });
  });
  it("is (n, n) at an ending and caps the total at 12", () => {
    expect(sceneProgress(fixA, 3, "e1")).toEqual({ current: 3, total: 3 });
    expect(sceneProgress(fixA, 20, "e1").total).toBe(12);
  });
});

describe("branchMap fixture A", () => {
  const m = branchMap(fixA, [0, 0], ["end1", "end3"], "end1");
  it("lays out the collapsed tree", () => {
    expect(m.nodes[0]).toMatchObject({ id: "start", kind: "start", x: 0, y: 0.5 });
    expect(m.nodes.map((n) => n.id)).toEqual(["start", "a", "e1", "e2", "b2", "e3", "e4"]);
    const endings = m.nodes.filter((n) => n.kind === "ending");
    expect(endings.map((n) => n.x)).toEqual([1, 1, 1, 1]);
    expect(endings.map((n) => n.y)).toEqual([0.125, 0.375, 0.625, 0.875]);
    expect(m.nodes.find((n) => n.id === "a")).toMatchObject({ y: 0.25, x: 0.5, onPath: true });
    expect(m.nodes.find((n) => n.id === "b2")).toMatchObject({ y: 0.75, onPath: false });
    expect(m.nodes.find((n) => n.id === "b")).toBeUndefined();
  });
  it("styles the edges", () => {
    const e = (f: string, t: string) => m.edges.find((x) => x.from === f && x.to === t)?.style;
    expect(e("start", "a")).toBe("taken");
    expect(e("a", "e1")).toBe("taken");
    expect(e("a", "e2")).toBe("locked");
    expect(e("start", "b2")).toBe("plain");
    expect(e("b2", "e3")).toBe("found");
    expect(e("b2", "e4")).toBe("locked");
  });
  it("counts endings and words them", () => {
    expect(m).toMatchObject({ endingsFound: 2, endingsTotal: 4, lockedCount: 2 });
    expect(branchMapSummary(m)).toBe(
      "You found 2 of 4 endings: T1, T3. 2 endings are still hidden.",
    );
    expect(branchMapCaption(m)).toBe(
      "Gold = the path you just took · try the greyed branches for 2 more endings",
    );
    expect(m.nodes.find((n) => n.id === "e1")?.ending?.state).toBe("current");
    expect(m.nodes.find((n) => n.id === "e3")?.ending?.state).toBe("found");
  });
});

describe("branchMap other fixtures", () => {
  it("fixture B: a direct ending beside a deeper branch stays at x 1", () => {
    const g: StoryGraph = {
      start: "s",
      map: {
        s: { segments: [], choice: { prompt: "p", options: opts("e1", "m") } },
        m: { segments: [], choice: { prompt: "p", options: opts("e2", "e3") } },
        e1: end("a", "A"),
        e2: end("b", "B"),
        e3: end("c", "C"),
      },
    };
    const m = branchMap(g, [0], ["a"], "a");
    expect(m.nodes.filter((n) => n.kind === "ending").every((n) => n.x === 1)).toBe(true);
    expect(m.nodes.find((n) => n.id === "m")?.x).toBe(0.5);
  });
  it("fixture C: a DAG places a shared node once; a link cycle drops the branch", () => {
    const g: StoryGraph = {
      start: "s",
      map: {
        s: { segments: [], choice: { prompt: "p", options: opts("m", "m", "l1") } },
        m: { segments: [], choice: { prompt: "p", options: opts("e1", "e2") } },
        l1: { segments: [], next: "l2" },
        l2: { segments: [], next: "l1" },
        e1: end("a", "A"),
        e2: end("b", "B"),
      },
    };
    const m = branchMap(g, [0, 0], [], null);
    expect(m.nodes.filter((n) => n.id === "m")).toHaveLength(1);
    expect(m.nodes).toHaveLength(4);
    expect(m.edges.filter((e) => e.to === "m")).toHaveLength(1);
  });
  it("fixture D: all found and singular wording", () => {
    const all = branchMap(fixA, [0, 0], ["end1", "end2", "end3", "end4"], "end1");
    expect(branchMapSummary(all)).toBe("You found all 4 endings: T1, T2, T3, T4.");
    expect(branchMapCaption(all)).toBe("Gold = the path you just took · you found every ending");
    const one = branchMap(fixA, [0, 0], ["end1", "end2", "end3"], "end1");
    expect(branchMapSummary(one)).toBe(
      "You found 3 of 4 endings: T1, T2, T3. 1 ending is still hidden.",
    );
    expect(branchMapCaption(one)).toContain("for 1 more ending");
    const g: StoryGraph = { start: "e", map: { e: end("only", "Solo") } };
    expect(branchMapSummary(branchMap(g, [], ["only"], "only"))).toBe(
      "You found the only ending: Solo.",
    );
  });
});
