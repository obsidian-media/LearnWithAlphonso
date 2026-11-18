import { describe, expect, it } from "vitest";
import {
  allEndings,
  chooseOption,
  mergeEnding,
  nodeKind,
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
