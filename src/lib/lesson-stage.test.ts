import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { UNIT_ROOMS } from "../data/unit-rooms";
import {
  LESSON_EXPRESSIONS,
  expressionSrc,
  lessonExpression,
  roomLayout,
  roomSrcForUnit,
} from "./lesson-stage";

describe("roomSrcForUnit", () => {
  it("uses the unit's own room from the room map, so the header changes per unit", () => {
    expect(UNIT_ROOMS.u1).toBe("smalltalk");
    expect(UNIT_ROOMS.u2).toBe("bedroom");
    expect(roomSrcForUnit("u1")).toBe("/avatar/scenes/smalltalk.webp");
    expect(roomSrcForUnit("u2")).toBe("/avatar/scenes/bedroom.webp");
  });

  it("falls back to Alphonso's study for a unit the map does not know", () => {
    expect(roomSrcForUnit("no-such-unit")).toBe("/avatar/scenes/room-light.webp");
    expect(roomSrcForUnit(undefined)).toBe("/avatar/scenes/room-light.webp");
  });

  it("every mapped room is a file the web app ships", () => {
    const missing = [...new Set(Object.values(UNIT_ROOMS))].filter(
      (room) => !fs.existsSync(path.join("public/avatar/scenes", `${room}.webp`)),
    );
    expect(missing).toEqual([]);
  });
});

describe("lessonExpression", () => {
  it("talks while asking, listens once an answer is picked, smiles when right, hmms when wrong", () => {
    expect(lessonExpression({ picked: false, verdict: null })).toBe("talk");
    expect(lessonExpression({ picked: true, verdict: null })).toBe("neutral");
    expect(lessonExpression({ picked: true, verdict: "right" })).toBe("happy");
    expect(lessonExpression({ picked: true, verdict: "wrong" })).toBe("hmm");
  });

  it("every expression is a bundled image with the same framing", () => {
    for (const e of LESSON_EXPRESSIONS) {
      expect(fs.existsSync(path.join("public", expressionSrc(e)))).toBe(true);
    }
    expect(expressionSrc("wow")).toBe("/alphonso/lesson/wow.webp");
  });
});

describe("roomLayout", () => {
  it("a short question on a tall phone gets the full room: 380 high, Alphonso 270 wide", () => {
    expect(roomLayout({ viewportHeight: 852, prompt: "Which one is a formal greeting?" })).toEqual({
      size: "full",
      roomHeight: 380,
      alphonsoWidth: 270,
    });
  });

  it("a question past two lines drops the room to 300 and Alphonso to 220", () => {
    const long =
      'Your client says the price is "a bit higher than we hoped". Which reply keeps the talks open?';
    expect(roomLayout({ viewportHeight: 852, prompt: long })).toEqual({
      size: "long",
      roomHeight: 300,
      alphonsoWidth: 220,
    });
  });

  it("below 700 of height the room drops to 224 and Alphonso to 180, whatever the question", () => {
    expect(roomLayout({ viewportHeight: 667, prompt: "Hi?" })).toEqual({
      size: "small",
      roomHeight: 224,
      alphonsoWidth: 180,
    });
  });

  it("before the browser reports a height (server render) it assumes a tall phone", () => {
    expect(roomLayout({ viewportHeight: 0, prompt: "Hi?" }).size).toBe("full");
  });
});
