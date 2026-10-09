import { describe, expect, it } from "vitest";
import { BUDDY_PRESETS } from "../buddy";
import { DEMO_SEED, assertDemoPaired, pickResumeEpisode } from "./demo-seed-plan";

const row = (slug: string, published = true, course = "en") => ({
  id: `id-${slug}-${course}`,
  slug,
  course,
  published,
  duration_seconds: 180,
});

describe("demo seed plan", () => {
  it("places the account in all three courses so a course switch lands on Learn", () => {
    expect(DEMO_SEED.placements.map((p) => p.language).sort()).toEqual(["en", "es", "fr"]);
  });

  it("uses a chosen public name that passes the filter", () => {
    expect(DEMO_SEED.displayName).toBe("Alex");
  });

  it("resumes the published, re-voiced Ordering Coffee, never the unlicensed original", () => {
    expect(pickResumeEpisode([row("ordering-coffee"), row("ordering-coffee-v2")]).slug).toBe("ordering-coffee-v2");
    expect(() => pickResumeEpisode([row("ordering-coffee-v2", false)])).toThrow(/exactly one/);
    expect(() => pickResumeEpisode([row("ordering-coffee-v2"), row("ordering-coffee-v2", true, "en")])).toThrow(
      /exactly one/,
    );
    expect(() => pickResumeEpisode([row("ordering-coffee-v2", true, "fr")])).toThrow(/exactly one/);
  });

  it("pre-pairs the account with a demo learner who sends only known preset messages", () => {
    const ids = BUDDY_PRESETS.map((p) => p.id);
    expect(DEMO_SEED.buddy.presets.length).toBeGreaterThanOrEqual(1);
    expect(DEMO_SEED.buddy.presets.length).toBeLessThanOrEqual(2);
    for (const p of DEMO_SEED.buddy.presets) expect(ids).toContain(p);
    expect(DEMO_SEED.buddy.displayName).not.toBe(DEMO_SEED.displayName);
  });

  it("gives the demo learner a reserved address that is nobody's mailbox", () => {
    expect(DEMO_SEED.buddy.email).toMatch(/@example\.com$/);
  });

  it("only accepts a created pair, never an existing or refused one", () => {
    expect(() => assertDemoPaired("paired")).not.toThrow();
    for (const s of ["already_paired", "friend_paired", "blocked", "not_friends", null]) {
      expect(() => assertDemoPaired(s as string | null), String(s)).toThrow(/demo pairing/i);
    }
  });
});
