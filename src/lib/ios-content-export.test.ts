import { describe, expect, it } from "vitest";
import {
  buildIOSContentBundle,
  buildIOSScenariosBundle,
  buildIOSCampaignsBundle,
  buildIOSPlacementBundle,
} from "./ios-content-export";
import { PLACEMENT_ORDER } from "@/data/placement";
import { scenarioPrompt } from "@/data/scenarios";
import { campaignScenePrompt } from "@/data/campaigns";

describe("buildIOSContentBundle", () => {
  it("exports the full English curriculum with the expected lesson count", () => {
    const bundle = buildIOSContentBundle("en");
    const lessonCount = bundle.units.reduce((sum, u) => sum + u.lessons.length, 0);
    expect(lessonCount).toBe(609);
    expect(bundle.units.length).toBeGreaterThan(0);
  });

  it("exports the full French curriculum with the expected lesson count", () => {
    const bundle = buildIOSContentBundle("fr");
    const lessonCount = bundle.units.reduce((sum, u) => sum + u.lessons.length, 0);
    // 500 (V3 pkg 4a) + 25 (phase 2 PR 2: fra1p21/fra2p21/frb1p21/frb2p21/frc1p21,
    // translate) + 25 (phase 2 PR 3: fra1p22/fra2p22/frb1p22/frb2p22/frc1p22,
    // listening) + 25 (phase 2 PR 4: fra1p23/fra2p23/frb1p23/frb2p23/frc1p23,
    // speak) -- one 25-line pack per level per type, 5 lessons each. See
    // docs/superpowers/specs/2026-09-24-french-phase-2-question-types-design.md
    expect(lessonCount).toBe(575);
  });

  it("preserves question shape exactly (mc and fill variants both present)", () => {
    const bundle = buildIOSContentBundle("en");
    const allQuestions = bundle.units.flatMap((u) => u.lessons.flatMap((l) => l.questions));
    const hasMc = allQuestions.some((q) => q.type === "mc" && Array.isArray(q.choices));
    const hasFill = allQuestions.some((q) => q.type === "fill" && Array.isArray(q.bank));
    expect(hasMc).toBe(true);
    expect(hasFill).toBe(true);
  });

  it("exports each course's scenarios flat, in the legacy key order, with the same ids", () => {
    const en = buildIOSScenariosBundle("en");
    expect(en).toHaveLength(12);
    for (const course of ["en", "fr", "es"] as const) {
      const bundle = buildIOSScenariosBundle(course);
      expect(bundle.map((s) => s.id)).toEqual(en.map((s) => s.id));
      for (const s of bundle) {
        expect(Object.keys(s)).toEqual([
          "id",
          "title",
          "emoji",
          "blurb",
          "level",
          "systemPrompt",
          "opener",
        ]);
        expect(s.systemPrompt).toBe(scenarioPrompt(s.id, course));
        expect(s.opener).toBeTruthy();
      }
    }
  });

  it("exports each course's campaigns flat, composing to the whitelisted scene prompt", () => {
    for (const course of ["en", "fr", "es"] as const) {
      const [campaign] = buildIOSCampaignsBundle(course);
      expect(Object.keys(campaign)).toEqual([
        "id",
        "title",
        "emoji",
        "blurb",
        "level",
        "premise",
        "scenes",
      ]);
      expect(campaign.scenes.map((s) => s.id)).toEqual(["coffee-stop", "directions", "small-talk"]);
      for (const scene of campaign.scenes) {
        expect(Object.keys(scene)).toEqual(["id", "title", "systemPrompt", "opener", "minTurns"]);
        expect(`${campaign.premise}\n\n${scene.systemPrompt}`).toBe(
          campaignScenePrompt(campaign.id, scene.id, course),
        );
      }
    }
  });

  it("defaults to English, so the Android export's no-argument calls are unchanged", () => {
    expect(buildIOSScenariosBundle()).toEqual(buildIOSScenariosBundle("en"));
    expect(buildIOSCampaignsBundle()).toEqual(buildIOSCampaignsBundle("en"));
  });

  it("exports the full placement pool for every course, with every band represented", () => {
    for (const course of ["en", "fr", "es"] as const) {
      const pool = buildIOSPlacementBundle(course);
      expect(pool.length).toBeGreaterThan(0);
      for (const level of PLACEMENT_ORDER) {
        expect(pool.some((q) => q.level === level)).toBe(true);
      }
      // Same pass-through contract as buildIOSContentBundle -- every
      // question keeps its own id and level, and the type-specific
      // fields (choices/answer/acceptableAnswers) survive untouched.
      for (const q of pool) {
        expect(q.id).toBeTruthy();
        if (q.type === "mc" || q.type === "listening") {
          expect(Array.isArray(q.choices)).toBe(true);
        } else {
          expect(Array.isArray(q.acceptableAnswers)).toBe(true);
        }
      }
    }
  });
});
