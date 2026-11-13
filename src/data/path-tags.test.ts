import { describe, expect, it } from "vitest";
import { CAMPAIGNS } from "./campaigns";
import { SCENARIOS } from "./scenarios";
import { PODCAST_QUIZZES } from "./podcast-quizzes";
import { CAMPAIGN_TAGS, PODCAST_TAGS, SCENARIO_TAGS, podcastTagKey, type PathTag } from "./path-tags";
import { GOALS, INTERESTS } from "../lib/learner-profile";
import { SKILLS } from "../lib/profile-data";
import { LEVEL_ORDER } from "../lib/learning-goal";

const all: [string, Record<string, PathTag>][] = [
  ["podcast", PODCAST_TAGS],
  ["scenario", SCENARIO_TAGS],
  ["campaign", CAMPAIGN_TAGS],
];

describe("path tags", () => {
  it("tag every live podcast quiz episode, with no stray keys", () => {
    const keys = PODCAST_QUIZZES.map((q) => podcastTagKey(q.course, q.folder, q.slug)).sort();
    expect(Object.keys(PODCAST_TAGS).sort()).toEqual(keys);
  });
  it("tag every scenario and every campaign, with no stray keys", () => {
    expect(Object.keys(SCENARIO_TAGS).sort()).toEqual(SCENARIOS.map((s) => s.id).sort());
    expect(Object.keys(CAMPAIGN_TAGS).sort()).toEqual(CAMPAIGNS.map((c) => c.id).sort());
  });
  it.each(all)("every %s tag uses only known goals, interests, skills and levels", (_n, tags) => {
    for (const [key, tag] of Object.entries(tags)) {
      expect(LEVEL_ORDER, key).toContain(tag.level);
      expect(tag.goals.length, key).toBeGreaterThan(0);
      for (const g of tag.goals) expect(GOALS, key).toContain(g);
      for (const i of tag.interests) expect(INTERESTS, key).toContain(i);
      expect(tag.skills.length, key).toBeGreaterThan(0);
      for (const s of tag.skills) expect(SKILLS, key).toContain(s);
    }
  });
  it("a podcast folder named for a level is tagged at that level", () => {
    for (const [key, tag] of Object.entries(PODCAST_TAGS)) {
      const folder = key.split("/")[1];
      if (/^[abc][12]$/.test(folder)) expect(tag.level, key).toBe(folder.toUpperCase());
    }
  });
  it("every campaign's tag level is not below its Beginner or Intermediate band", () => {
    for (const c of CAMPAIGNS) {
      const lvl = LEVEL_ORDER.indexOf(CAMPAIGN_TAGS[c.id].level);
      if (c.level === "Beginner") expect(lvl).toBeLessThanOrEqual(1);
      if (c.level === "Intermediate") expect(lvl).toBeGreaterThanOrEqual(2);
    }
  });
});
