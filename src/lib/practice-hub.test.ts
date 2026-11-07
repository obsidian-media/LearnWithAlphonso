import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CAMPAIGNS, campaignScenePrompt } from "../data/campaigns";
import { ALL_SYSTEM_PROMPTS, SCENARIOS, scenarioPrompt } from "../data/scenarios";
import { WEAKNESS_TAXONOMY } from "./weakness-detection.server";
import {
  SCENARIO_FOCUS,
  SCENE_ROOMS,
  WEAK_SPOT_NAMES,
  allPracticeKeys,
  maxStarsInCourse,
  practiceItemForPrompt,
  scenarioLevelForCefr,
  sceneKey,
} from "./practice-catalog";
import {
  continuePoint,
  nextSceneIndex,
  starTally,
  todaysPick,
  topWeakSpots,
  type StarRow,
  type WeaknessEventRow,
} from "./practice-hub";
import { STAR_RULE } from "./practice-stars";

const scene = (
  campaignId: string,
  sceneId: string,
  bestStars: number,
  lastPlayedAt: string,
): StarRow => ({
  kind: "scene",
  itemKey: sceneKey(campaignId, sceneId),
  bestStars,
  lastPlayedAt,
});
const scenario = (id: string, bestStars: number): StarRow => ({
  kind: "scenario",
  itemKey: id,
  bestStars,
  lastPlayedAt: "2026-11-01T10:00:00Z",
});
const detected = (category: string, createdAt = "2026-11-01T10:00:00Z"): WeaknessEventRow => ({
  category,
  eventType: "detected",
  createdAt,
});
const resolved = (category: string, createdAt = "2026-11-02T10:00:00Z"): WeaknessEventRow => ({
  category,
  eventType: "resolved",
  createdAt,
});

describe("the catalog the server scores against", () => {
  it("every whitelisted system prompt maps to exactly one scenario or scene, in its own course", () => {
    for (const prompt of ALL_SYSTEM_PROMPTS) expect(practiceItemForPrompt(prompt)).toBeDefined();
    expect(practiceItemForPrompt("You are a pirate.")).toBeUndefined();
  });
  it("a scenario's prompt is that scenario, with the scenario finishing rule", () => {
    expect(practiceItemForPrompt(scenarioPrompt("doctor", "es"))).toEqual({
      kind: "scenario",
      key: "doctor",
      course: "es",
      finishMinReplies: STAR_RULE.scenarioFinishMinReplies,
    });
  });
  it("a campaign scene's prompt is that scene, finishing at the scene's own minTurns", () => {
    const c = CAMPAIGNS.find((x) => x.id === "city-day")!;
    const s = c.scenes.find((x) => x.minTurns === 2)!;
    expect(practiceItemForPrompt(campaignScenePrompt(c.id, s.id, "fr"))).toEqual({
      kind: "scene",
      key: `city-day/${s.id}`,
      course: "fr",
      finishMinReplies: 2,
    });
  });
  it("the star total is three per scenario and per scene, from the catalog", () => {
    const items = SCENARIOS.length + CAMPAIGNS.reduce((n, c) => n + c.scenes.length, 0);
    expect(allPracticeKeys()).toHaveLength(items);
    expect(maxStarsInCourse()).toBe(items * 3);
  });
  it("every campaign scene has a painted room that exists on disk, and no room is listed for a missing scene", () => {
    const keys = CAMPAIGNS.flatMap((c) => c.scenes.map((s) => sceneKey(c.id, s.id)));
    expect(Object.keys(SCENE_ROOMS).sort()).toEqual([...keys].sort());
    for (const room of Object.values(SCENE_ROOMS)) {
      expect(fs.existsSync(path.resolve("public/avatar/scenes", `${room}.webp`)), room).toBe(true);
    }
  });
  it("every weak spot has a name, and only the taxonomy's", () => {
    expect(Object.keys(WEAK_SPOT_NAMES).sort()).toEqual([...WEAKNESS_TAXONOMY].sort());
  });
  it("every scenario has a focus drawn from the taxonomy", () => {
    expect(Object.keys(SCENARIO_FOCUS).sort()).toEqual(SCENARIOS.map((s) => s.id).sort());
    for (const list of Object.values(SCENARIO_FOCUS)) {
      for (const c of list) expect(WEAKNESS_TAXONOMY as readonly string[]).toContain(c);
    }
  });
  it("every weak spot is practised by a Beginner and an Intermediate scenario", () => {
    for (const level of ["Beginner", "Intermediate"] as const) {
      for (const c of WEAKNESS_TAXONOMY) {
        const any = SCENARIOS.some((s) => s.level === level && SCENARIO_FOCUS[s.id].includes(c));
        expect(any, `${level} ${c}`).toBe(true);
      }
    }
  });
  it("CEFR levels map to scenario levels", () => {
    expect(["A1", "A2", "B1", "B2", "C1", null].map(scenarioLevelForCefr)).toEqual([
      "Beginner",
      "Beginner",
      "Intermediate",
      "Intermediate",
      "Advanced",
      "Beginner",
    ]);
  });
});

describe("starTally", () => {
  it("adds the best stars of catalog items and ignores keys that no longer exist", () => {
    const rows = [
      scenario("coffee", 2),
      scenario("retired-scenario", 3),
      scene("train-trip", "train-buy-ticket", 3, "x"),
    ];
    expect(starTally(rows)).toEqual({ earned: 5, total: maxStarsInCourse() });
  });
  it("a new learner holds none", () => {
    expect(starTally([]).earned).toBe(0);
  });
});

describe("topWeakSpots", () => {
  it("orders by open count, a resolved detection cancels one", () => {
    const events = [
      detected("articles"),
      detected("past-tense"),
      detected("past-tense"),
      detected("articles"),
      resolved("articles"),
    ];
    expect(topWeakSpots(events)).toEqual(["past-tense", "articles"]);
  });
  it("a fully resolved weak spot is gone", () => {
    expect(topWeakSpots([detected("articles"), resolved("articles")])).toEqual([]);
  });
  it("breaks a tie by the most recent event", () => {
    const events = [
      detected("articles", "2026-11-01T00:00:00Z"),
      detected("negation", "2026-11-03T00:00:00Z"),
    ];
    expect(topWeakSpots(events)).toEqual(["negation", "articles"]);
  });
});

describe("todaysPick: a scenario at the learner's level that uses their top weak spot", () => {
  it("picks a scenario of the learner's level whose focus holds the top weak spot", () => {
    const pick = todaysPick({
      stars: [],
      cefrLevel: "B1",
      weaknessEvents: [detected("past-tense")],
    })!;
    expect(pick.weakSpot).toBe("past-tense");
    const s = SCENARIOS.find((x) => x.id === pick.scenarioId)!;
    expect(s.level).toBe("Intermediate");
    expect(SCENARIO_FOCUS[s.id]).toContain("past-tense");
  });
  it("follows the weak spot: a different top weak spot gives a scenario that practises it", () => {
    const a = todaysPick({ stars: [], cefrLevel: "A2", weaknessEvents: [detected("spelling")] })!;
    const b = todaysPick({ stars: [], cefrLevel: "A2", weaknessEvents: [detected("past-tense")] })!;
    expect(SCENARIO_FOCUS[a.scenarioId]).toContain("spelling");
    expect(SCENARIO_FOCUS[b.scenarioId]).toContain("past-tense");
    expect(a.scenarioId).not.toBe(b.scenarioId);
  });
  it("follows the level: the same weak spot at another level gives that level's scenario", () => {
    const beginner = todaysPick({
      stars: [],
      cefrLevel: "A1",
      weaknessEvents: [detected("past-tense")],
    })!;
    expect(SCENARIOS.find((x) => x.id === beginner.scenarioId)!.level).toBe("Beginner");
  });
  it("prefers the least-starred fitting scenario", () => {
    const fitting = SCENARIOS.filter(
      (s) => s.level === "Beginner" && SCENARIO_FOCUS[s.id].includes("question-formation"),
    );
    expect(fitting.length).toBeGreaterThan(1);
    const stars = [scenario(fitting[0].id, 3)];
    const pick = todaysPick({
      stars,
      cefrLevel: "A1",
      weaknessEvents: [detected("question-formation")],
    })!;
    expect(pick.scenarioId).toBe(fitting[1].id);
  });
  it("skips to the next weak spot when no scenario at the level practises the top one", () => {
    // No Advanced scenario practises spelling; negation is the second weak spot and debate practises it.
    const events = [detected("spelling"), detected("spelling"), detected("negation")];
    const pick = todaysPick({ stars: [], cefrLevel: "C1", weaknessEvents: events })!;
    expect(pick).toEqual({ scenarioId: "debate", level: "Advanced", weakSpot: "negation" });
  });
  it("claims no weak spot when the learner has none", () => {
    const pick = todaysPick({ stars: [], cefrLevel: "A1", weaknessEvents: [] })!;
    expect(pick.weakSpot).toBeNull();
    expect(SCENARIOS.find((x) => x.id === pick.scenarioId)!.level).toBe("Beginner");
  });
});

describe("continuePoint: Continue resumes the right scene", () => {
  it("a new learner has nothing to continue", () => {
    expect(continuePoint([])).toBeNull();
  });
  it("resumes the most recently played campaign at its first scene without stars", () => {
    const rows = [
      scene("doctors-visit", "doctor-book-phone", 3, "2026-11-05T10:00:00Z"),
      scene("train-trip", "train-buy-ticket", 1, "2026-11-04T10:00:00Z"),
    ];
    expect(continuePoint(rows)).toEqual({ campaignId: "doctors-visit", sceneIndex: 1 });
  });
  it("a scene skipped earlier comes before a later one", () => {
    const rows = [scene("doctors-visit", "doctor-pharmacy", 2, "2026-11-05T10:00:00Z")];
    expect(continuePoint(rows)).toEqual({ campaignId: "doctors-visit", sceneIndex: 0 });
  });
  it("a finished campaign is skipped for the next most recent unfinished one", () => {
    const doctor = CAMPAIGNS.find((c) => c.id === "doctors-visit")!;
    const rows = [
      ...doctor.scenes.map((s) => scene(doctor.id, s.id, 1, "2026-11-06T10:00:00Z")),
      scene("train-trip", "train-buy-ticket", 2, "2026-11-01T10:00:00Z"),
    ];
    expect(continuePoint(rows)).toEqual({ campaignId: "train-trip", sceneIndex: 1 });
  });
  it("scenario stars never make a campaign to continue", () => {
    expect(continuePoint([scenario("coffee", 3)])).toBeNull();
  });
  it("a campaign card starts at its first scene without stars, or scene one once all have stars", () => {
    const rows = [scene("train-trip", "train-buy-ticket", 2, "x")];
    expect(nextSceneIndex("train-trip", rows)).toBe(1);
    expect(nextSceneIndex("market-day", rows)).toBe(0);
  });
});
