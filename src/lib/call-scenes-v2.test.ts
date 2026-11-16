import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SCENARIOS } from "@/data/scenarios";
import { UNIT_ROOMS } from "@/data/unit-rooms";
import { CALL_STUDY_ROOM, callSceneFile, sceneArt } from "./avatar/scenes";
import { ALPHONSO_KIT, HECTOR_KIT } from "./avatar/layers";
import { roomSrcForUnit } from "./lesson-stage";
import { SCENE_ROOMS, sceneRoom } from "./practice-catalog";
import { NIGHT_SCENES, SCENES, sceneSrc, type Scene } from "./scenes";
import { resolveDsLook } from "./theme";

const root = path.resolve(import.meta.dirname, "../..");
const file = (p: string) => path.join(root, "public", p);

describe("call scenes v2: the call has its own files, lessons and campaigns keep theirs", () => {
  it("the call resolves every scenario to call-<id>.webp, and the file exists", () => {
    for (const s of SCENARIOS) {
      const art = sceneArt(s.id);
      expect(art.light, s.id).toBe(`/avatar/scenes/call-${s.id}.webp`);
      expect(art.dark, s.id).toBe(art.light);
      expect(fs.existsSync(file(art.light)), art.light).toBe(true);
    }
  });

  it("the study room the call uses has a day and an evening picture of its own", () => {
    expect(CALL_STUDY_ROOM).toEqual({
      light: "/avatar/scenes/call-room-light.webp",
      dark: "/avatar/scenes/call-room-dark.webp",
    });
    for (const kit of [ALPHONSO_KIT, HECTOR_KIT]) expect(kit.defaultRoom).toEqual(CALL_STUDY_ROOM);
    expect(sceneArt(null).light).toBe(callSceneFile("room-light"));
    expect(sceneArt(null).dark).toBe(callSceneFile("room-dark"));
    for (const f of [CALL_STUDY_ROOM.light, CALL_STUDY_ROOM.dark])
      expect(fs.existsSync(file(f)), f).toBe(true);
  });

  it("lesson rooms still resolve to the old <room>.webp files, never a call file", () => {
    const rooms = new Set(Object.values(UNIT_ROOMS));
    for (const [unit, room] of Object.entries(UNIT_ROOMS)) {
      const src = roomSrcForUnit(unit);
      expect(src, unit).toBe(`/avatar/scenes/${room}.webp`);
      expect(src, unit).not.toContain("/call-");
      expect(fs.existsSync(file(src)), src).toBe(true);
    }
    // The 12 scenarios' rooms are lesson rooms too: they keep their old file next to the new call one.
    for (const s of SCENARIOS) {
      expect(rooms.has(s.id) || fs.existsSync(file(`/avatar/scenes/${s.id}.webp`)), s.id).toBe(
        true,
      );
      expect(
        fs
          .readFileSync(file(`/avatar/scenes/${s.id}.webp`))
          .equals(fs.readFileSync(file(`/avatar/scenes/call-${s.id}.webp`))),
        `${s.id}: old and new are different art`,
      ).toBe(false);
    }
    expect(roomSrcForUnit(undefined)).toBe("/avatar/scenes/room-light.webp");
  });

  it("campaign scenes keep the old room files", () => {
    for (const [key, room] of Object.entries(SCENE_ROOMS)) {
      const [campaign, scene] = key.split("/");
      expect(sceneRoom(campaign, scene), key).toBe(`/avatar/scenes/${room}.webp`);
      expect(sceneRoom(campaign, scene), key).not.toContain("/call-");
    }
  });
});

describe("screen scenes: Royal night swaps the picture, Royal light and Meadow keep the day one", () => {
  const withNight: Scene[] = ["learn", "hector", "listen", "profile", "practice"];

  it("names the five scenes with a night picture, and Lesson complete is not one", () => {
    expect([...NIGHT_SCENES].sort()).toEqual([...withNight].sort());
    expect(NIGHT_SCENES).not.toContain("complete");
    expect(SCENES).toContain("complete");
  });

  const cases = [
    ["Royal light", "royal", false, false],
    ["Royal night (Royal in a dark device)", "royal", true, true],
    ["Meadow in a light device", "meadow", false, false],
    ["Meadow in a dark device", "meadow", true, false],
  ] as const;

  for (const [name, theme, deviceDark, wantNight] of cases) {
    it(`${name}: ${wantNight ? "the night picture" : "the day picture"}`, () => {
      const night = resolveDsLook(theme, deviceDark).mode === "night";
      expect(night).toBe(wantNight);
      for (const s of withNight)
        expect(sceneSrc(s, night), s).toBe(
          wantNight ? `/scenes/night-${s}.jpg` : `/scenes/${s}.jpg`,
        );
    });
  }

  it("Lesson complete stays light, even in Royal night", () => {
    expect(sceneSrc("complete", true)).toBe("/scenes/complete.jpg");
  });

  it("every night picture exists, is a different file from its day picture, and stays small", () => {
    for (const s of withNight) {
      const day = fs.readFileSync(file(sceneSrc(s)));
      const nightFile = fs.readFileSync(file(sceneSrc(s, true)));
      expect(nightFile.equals(day), s).toBe(false);
      expect(nightFile.length, s).toBeLessThan(500_000);
    }
  });
});
