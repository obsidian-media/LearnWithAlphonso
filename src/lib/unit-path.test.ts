import { describe, expect, it } from "vitest";
import { unitPathNodes } from "./unit-path";

const states = (ids: string[], done: string[], max?: number) =>
  unitPathNodes(ids, new Set(done), max).map((n) => `${n.id}:${n.state}`);

describe("unit path", () => {
  it("none done: first is next, rest locked", () => {
    expect(states(["a", "b", "c"], [])).toEqual(["a:next", "b:locked", "c:locked"]);
  });

  it("out of order: next is the first undone, later done lessons stay done", () => {
    expect(states(["a", "b", "c", "d"], ["a", "c"])).toEqual([
      "a:done",
      "b:next",
      "c:done",
      "d:locked",
    ]);
  });

  it("all done: no next, and the window shows the last lessons", () => {
    expect(states(["a", "b", "c", "d", "e", "f"], ["a", "b", "c", "d", "e", "f"], 3)).toEqual([
      "d:done",
      "e:done",
      "f:done",
    ]);
  });

  it("the window holds max nodes starting up to 2 before next", () => {
    const ids = ["a", "b", "c", "d", "e", "f", "g", "h"];
    expect(states(ids, ["a", "b", "c", "d"], 5)).toEqual([
      "c:done",
      "d:done",
      "e:next",
      "f:locked",
      "g:locked",
    ]);
    expect(states(ids, [], 5).map((s) => s.split(":")[0])).toEqual(["a", "b", "c", "d", "e"]);
    // Near the end the window slides back so it stays full.
    expect(states(ids, ["a", "b", "c", "d", "e", "f", "g"], 5).map((s) => s.split(":")[0])).toEqual(
      ["d", "e", "f", "g", "h"],
    );
  });

  it("an empty unit has no nodes", () => {
    expect(unitPathNodes([], new Set())).toEqual([]);
  });
});
