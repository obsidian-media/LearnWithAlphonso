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

describe("pathNodeDelay", () => {
  it("staggers a unit's nodes by their place in that unit, never by the unit, and caps the wait", async () => {
    const { pathNodeDelay } = await import("./unit-path");
    expect(pathNodeDelay(0)).toBe(0);
    expect(pathNodeDelay(1)).toBeCloseTo(0.05);
    // Every node is on screen within half a second, however long the unit.
    expect(pathNodeDelay(40)).toBeLessThanOrEqual(0.5);
  });

  it("the Learn page never staggers entrances by a page-wide index (round 6.1 draws no path nodes)", async () => {
    const fs = await import("node:fs");
    const src = fs.readFileSync("src/routes/_authenticated/learn.tsx", "utf8");
    expect(src).not.toMatch(/delay:\s*index\s*\*/);
  });
});
