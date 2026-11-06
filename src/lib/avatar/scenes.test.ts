import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SCENARIOS } from "@/data/scenarios";
import { DEFAULT_SCENE, EVENING_OVERLAY, SCENARIO_SCENE_IDS, sceneArt } from "./scenes";

const root = path.resolve(import.meta.dirname, "../../..");

describe("the room behind Alphonso", () => {
  it("covers exactly the scenarios the app has", () => {
    expect([...SCENARIO_SCENE_IDS].sort()).toEqual(SCENARIOS.map((s) => s.id).sort());
  });

  it("gives every scenario its own image, and the file exists", () => {
    for (const s of SCENARIOS) {
      const art = sceneArt(s.id);
      expect(art.id, s.id).toBe(s.id);
      expect(art.dimInDark, s.id).toBe(true);
      expect(fs.existsSync(path.join(root, "public", art.light)), art.light).toBe(true);
    }
  });

  it("falls back to the default study room for a campaign scene, free talk, an unknown id or nothing", () => {
    for (const id of ["city-day", "free-talk", "", "new-scenario", null, undefined])
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

  it("dims a scenario image with navy #16203c at 50% in dark mode", () => {
    expect(EVENING_OVERLAY).toBe("rgba(22, 32, 60, 0.5)");
  });

  it("gives the default room its own evening image", () => {
    const art = sceneArt("anything");
    expect(art.light).not.toBe(art.dark);
    expect(art.dimInDark).toBe(false);
    for (const f of [art.light, art.dark])
      expect(fs.existsSync(path.join(root, "public", f)), f).toBe(true);
  });
});
