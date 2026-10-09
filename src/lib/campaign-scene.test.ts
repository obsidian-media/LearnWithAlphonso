import { describe, expect, it } from "vitest";
import { sceneIndexOfMessage } from "./campaign-scene";

const o = { opener: true };
const m = {};

describe("sceneIndexOfMessage", () => {
  const transcript = [o, m, m, o, m, o, m]; // scenes 0, 1, 2

  it("gives each message its own scene, not the current one", () => {
    expect(transcript.map((_, i) => sceneIndexOfMessage(transcript, i))).toEqual([
      0, 0, 0, 1, 1, 2, 2,
    ]);
  });

  it("survives a restarted scene (the transcript is cut back to the scene's opener)", () => {
    const restarted = transcript.slice(0, 4); // scene 1 restarted
    expect(sceneIndexOfMessage(restarted, 3)).toBe(1);
    expect(sceneIndexOfMessage([...restarted, m], 4)).toBe(1);
  });

  it("never goes below zero", () => {
    expect(sceneIndexOfMessage([m, m], 1)).toBe(0);
    expect(sceneIndexOfMessage([], 0)).toBe(0);
  });
});
