import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getCourse, type Course } from "@/data/courses";
import { LEVELS } from "@/data/curriculum";
import { PENDING_ROOMS, ROOMS } from "@/data/rooms";
import { UNIT_ROOMS, UNIT_ROOMS_PLANNED } from "@/data/unit-rooms";
import { planUnitRooms, roomsWithArt } from "./room-plan";
import { buildUnitRoomsBundle } from "./ios-content-export";

/**
 * The room plan (design system spec, "The room plan"): every unit has a room, the room behind Alphonso in its
 * lessons and its celebration. 35 rooms: the 14 call scenes plus the 21 lesson rooms. A future room without art
 * would sit in PENDING_ROOMS and its units would use a painted fallback, so the app only ever names a room that
 * exists.
 */
const root = path.resolve(import.meta.dirname, "../..");
const COURSES: Course[] = ["en", "es", "fr"];
const unitsOf = (c: Course) => getCourse(c).curriculum;
const ROOM_IDS = ROOMS.map((r) => r.id);

const SCENE_DIRS = [
  "public/avatar/scenes",
  "ios/LearnWithAlphonso/AlphonsoScenes",
  "android/LearnWithAlphonso/app/src/main/assets/scenes",
];

describe("room list", () => {
  it("has the spec's 35 rooms, all painted", () => {
    expect(ROOMS).toHaveLength(35);
    expect(new Set(ROOM_IDS).size).toBe(35);
    expect(PENDING_ROOMS).toEqual([]);
    expect(roomsWithArt()).toEqual(ROOM_IDS);
  });

  it.each(SCENE_DIRS)("every room not pending has its image in %s", (dir) => {
    for (const id of roomsWithArt())
      expect(fs.existsSync(path.join(root, dir, `${id}.webp`)), `${dir}/${id}.webp`).toBe(true);
  });
});

describe.each(COURSES)("unit rooms, %s", (course) => {
  const units = unitsOf(course);

  it("every unit has a room, and the table names no unit that does not exist", () => {
    for (const u of units) {
      expect(UNIT_ROOMS[u.id], u.id).toBeDefined();
      expect(UNIT_ROOMS_PLANNED[u.id], u.id).toBeDefined();
    }
  });

  it("every room a unit uses has an image on all three platforms", () => {
    for (const u of units) {
      const room = UNIT_ROOMS[u.id];
      expect(
        PENDING_ROOMS as readonly string[],
        `${u.id} uses ${room}, which is not painted yet`,
      ).not.toContain(room);
      for (const dir of SCENE_DIRS)
        expect(
          fs.existsSync(path.join(root, dir, `${room}.webp`)),
          `${u.id}: ${dir}/${room}.webp`,
        ).toBe(true);
    }
  });

  it("every unit has its planned room now that all 35 are painted", () => {
    for (const u of units) expect(UNIT_ROOMS[u.id], u.id).toBe(UNIT_ROOMS_PLANNED[u.id]);
  });

  it("every planned room is one of the 35", () => {
    for (const u of units) expect(ROOM_IDS, u.id).toContain(UNIT_ROOMS_PLANNED[u.id]);
  });

  it.each(LEVELS.map((l) => l.id))("no two neighbouring %s units share a room", (level) => {
    const inLevel = units.filter((u) => u.level === level);
    for (let i = 1; i < inLevel.length; i++) {
      const [a, b] = [inLevel[i - 1], inLevel[i]];
      expect(UNIT_ROOMS[b.id], `${a.id} and ${b.id}`).not.toBe(UNIT_ROOMS[a.id]);
      expect(UNIT_ROOMS_PLANNED[b.id], `${a.id} and ${b.id} (plan)`).not.toBe(
        UNIT_ROOMS_PLANNED[a.id],
      );
    }
  });
});

describe("the table", () => {
  it("lists exactly the units of the three courses", () => {
    const ids = COURSES.flatMap((c) => unitsOf(c).map((u) => u.id)).sort();
    expect(Object.keys(UNIT_ROOMS).sort()).toEqual(ids);
    expect(Object.keys(UNIT_ROOMS_PLANNED).sort()).toEqual(ids);
  });

  it("follows the spec's topic rules", () => {
    const plan = planUnitRooms(
      [
        { id: "a", level: "A1", title: "Everyday Basics" },
        { id: "b", level: "A1", title: "Food & Drink" },
        { id: "c", level: "A1", title: "Restaurant Talk" },
        { id: "d", level: "B2", title: "Listening: Minimal Pairs" },
        { id: "e", level: "A2", title: "Plurals" },
      ],
      new Set(ROOM_IDS),
    );
    expect(plan.map((p) => p.planned)).toEqual([
      "smalltalk",
      "restaurant",
      "coffee",
      "radio",
      "classroom",
    ]);
  });

  /**
   * Keywords match whole words only. Each title here holds a short keyword inside a longer word ("art" in
   * "Articles" and "Participle", "sport" in "Transport", "tech" in "Technical") or a keyword used in another
   * sense ("Devices" in a writing unit). Titles marked real are live units; the rest are titles a writer could
   * add tomorrow. Planned one at a time, so no neighbour moves them.
   */
  it.each([
    ["Articles", "A1", "classroom"],
    ["Definite Articles", "A1", "classroom"],
    ["Definite & Indefinite Articles", "A2", "classroom"],
    ["Past Participle", "A2", "classroom"],
    ["Parts of Speech", "A1", "classroom"],
    ["Gerund & Present Participle", "B2", "library"], // real: fr B2
    ["Scientific & Technical Prose", "C1", "lab"], // real: en C1
    ["Literary & Narrative Devices", "C1", "gallery"], // real: es C1
    ["Rhetorical Devices & Style", "C1", "gallery"], // real: fr C1
    ["Public Transport", "A2", "station"],
    ["Art & Culture", "B2", "gallery"],
    ["Arts & Culture", "B2", "gallery"],
    ["Technology & Devices", "A2", "techshop"],
  ] as const)("%s (%s) plans %s", (title, level, room) => {
    expect(planUnitRooms([{ id: "x", level, title }], new Set(ROOM_IDS))[0].planned).toBe(room);
  });

  it("the live table keeps the participle and technical-prose units in their topic rooms", () => {
    expect(UNIT_ROOMS["frb2p8u1"]).not.toBe("gallery");
    expect(UNIT_ROOMS["c1p10u1"]).not.toBe("techshop");
  });

  it.each([
    ["Summer Holidays", "A2"],
    ["At the Beach", "A1"],
    ["Travel Phrases", "B1"], // real: fr B1
    ["Environment & Climate Change", "B2"], // real: fr B2
  ] as const)("%s (%s) goes to the seaside", (title, level) => {
    expect(planUnitRooms([{ id: "x", level, title }], new Set(ROOM_IDS))[0].planned).toBe(
      "seaside",
    );
  });

  it("the seaside has units in the live table", () => {
    const seaside = Object.entries(UNIT_ROOMS).filter(([, r]) => r === "seaside");
    expect(seaside.map(([id]) => id).sort()).toEqual(["frb1p3u1", "frb2p12u1"]);
  });

  it("falls back to a painted room while a planned one is pending, still never repeating a neighbour", () => {
    const plan = planUnitRooms(
      [
        { id: "a", level: "A1", title: "Plurals" },
        { id: "b", level: "A1", title: "Possessives" },
        { id: "c", level: "A1", title: "Pronouns" },
      ],
      new Set(["room-light", "smalltalk", "coffee"]),
    );
    expect(plan.map((p) => p.planned)).toEqual(["classroom", "room-light", "classroom"]);
    expect(plan.map((p) => p.room)).toEqual(["room-light", "smalltalk", "room-light"]);
  });
});

describe("native bundles", () => {
  const bundled = [
    "ios/LearnWithAlphonso/Resources/unit-rooms.json",
    "ios/LearnWithAlphonsoKit/Sources/LearnWithAlphonsoKit/Resources/unit-rooms.json",
    "android/LearnWithAlphonso/app/src/main/assets/content/unit-rooms.json",
  ];

  it("the bundle has every room with its painted flag, and the table", () => {
    const bundle = buildUnitRoomsBundle();
    expect(bundle.rooms.map((r) => r.id)).toEqual(ROOM_IDS);
    expect(bundle.rooms.filter((r) => !r.painted).map((r) => r.id)).toEqual([...PENDING_ROOMS]);
    expect(bundle.units).toEqual(UNIT_ROOMS);
  });

  it.each(bundled)(
    "%s carries the same table (bun scripts/export-ios-content.ts / export-android-content.ts)",
    (rel) => {
      const file = path.join(root, rel);
      expect(fs.existsSync(file), rel).toBe(true);
      expect(JSON.parse(fs.readFileSync(file, "utf8"))).toEqual(buildUnitRoomsBundle());
    },
  );
});
