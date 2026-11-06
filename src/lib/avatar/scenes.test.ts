import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SCENARIOS } from "@/data/scenarios";
import { DEFAULT_SCENE, SCENARIO_SCENE_IDS, sceneArt } from "./scenes";

const root = path.resolve(import.meta.dirname, "../../..");

describe("the room behind Alphonso", () => {
  it("covers exactly the scenarios the app has", () => {
    expect([...SCENARIO_SCENE_IDS].sort()).toEqual(SCENARIOS.map((s) => s.id).sort());
  });

  it("falls back to the default study room for a scenario without art, a campaign scene, or nothing", () => {
    for (const id of [...SCENARIO_SCENE_IDS, "city-day", "free-talk", "", null, undefined])
      expect(sceneArt(id).id, String(id)).toBe(DEFAULT_SCENE);
  });

  it("uses a scenario's own image once it has one, dimmed (not swapped) in dark mode", () => {
    const art = sceneArt("coffee", new Set(["coffee"]));
    expect(art).toEqual({
      id: "coffee",
      light: "/avatar/scenes/coffee.webp",
      dark: "/avatar/scenes/coffee.webp",
      dimInDark: true,
    });
    expect(sceneArt("doctor", new Set(["coffee"])).id).toBe(DEFAULT_SCENE);
  });

  it("gives the default room its own evening image", () => {
    const art = sceneArt("anything");
    expect(art.light).not.toBe(art.dark);
    expect(art.dimInDark).toBe(false);
    for (const f of [art.light, art.dark])
      expect(fs.existsSync(path.join(root, "public", f)), f).toBe(true);
  });
});
