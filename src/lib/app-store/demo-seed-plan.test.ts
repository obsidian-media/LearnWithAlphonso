import { describe, expect, it } from "vitest";
import { BUDDY_PRESETS } from "../buddy";
import {
  DEMO_SEED,
  assertDemoPaired,
  assertNoWriteErrors,
  demoSeedProblems,
  pickResumeEpisode,
  type DemoSeedState,
} from "./demo-seed-plan";

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
    expect(pickResumeEpisode([row("ordering-coffee"), row("ordering-coffee-v2")]).slug).toBe(
      "ordering-coffee-v2",
    );
    expect(() => pickResumeEpisode([row("ordering-coffee-v2", false)])).toThrow(/exactly one/);
    expect(() =>
      pickResumeEpisode([row("ordering-coffee-v2"), row("ordering-coffee-v2", true, "en")]),
    ).toThrow(/exactly one/);
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

  it("gives the demo learner no progress, so she never appears on a leaderboard", () => {
    expect(DEMO_SEED.buddy).not.toHaveProperty("lessonIds");
    expect(DEMO_SEED.buddy).not.toHaveProperty("xp");
  });

  it("only accepts a created pair, never an existing or refused one", () => {
    expect(() => assertDemoPaired("paired")).not.toThrow();
    for (const s of ["already_paired", "friend_paired", "blocked", "not_friends", null]) {
      expect(() => assertDemoPaired(s as string | null), String(s)).toThrow(/demo pairing/i);
    }
  });
});

describe("assertNoWriteErrors", () => {
  it("passes when every write succeeded", () => {
    expect(() => assertNoWriteErrors("reset", [{ error: null }, { error: null }])).not.toThrow();
  });

  it("names the step and every failure", () => {
    expect(() =>
      assertNoWriteErrors("reset", [
        { error: null },
        { error: { message: "denied" } },
        { error: { message: "gone" } },
      ]),
    ).toThrow(/reset.*denied.*gone/);
  });
});

describe("demoSeedProblems (read-back after seeding)", () => {
  const BUDDY = "buddy-id";
  const DEMO = "demo-id";
  const good = (): DemoSeedState => ({
    profile: {
      display_name: "Alex",
      name_confirmed_at: "2026-10-13T00:00:00Z",
      ai_consent_at: null,
    },
    poolRows: 0,
    languages: ["fr", "en", "es"],
    excluded: true,
    pair: { source: "match", endedAt: null, memberIds: [DEMO, BUDDY] },
  });

  it("is clean for the intended state", () => {
    expect(demoSeedProblems(good(), DEMO, BUDDY)).toEqual([]);
  });

  it("flags each property the reviewer depends on, on its own axis", () => {
    const cases: [string, (s: DemoSeedState) => DemoSeedState, RegExp][] = [
      [
        "consent still given",
        (s) => ({ ...s, profile: { ...s.profile!, ai_consent_at: "x" } }),
        /ai_consent_at/,
      ],
      [
        "name not confirmed",
        (s) => ({ ...s, profile: { ...s.profile!, name_confirmed_at: null } }),
        /name_confirmed_at/,
      ],
      [
        "wrong display name",
        (s) => ({ ...s, profile: { ...s.profile!, display_name: "Bob" } }),
        /display_name/,
      ],
      ["no profile", (s) => ({ ...s, profile: null }), /profile/],
      ["a pool row", (s) => ({ ...s, poolRows: 1 }), /buddy_pool/],
      ["missing course", (s) => ({ ...s, languages: ["en", "fr"] }), /language_progress/],
      ["extra course", (s) => ({ ...s, languages: ["en", "fr", "es", "de"] }), /language_progress/],
      ["not excluded", (s) => ({ ...s, excluded: false }), /exclusion/],
      ["no pair", (s) => ({ ...s, pair: null }), /pair/],
      ["friend pair", (s) => ({ ...s, pair: { ...s.pair!, source: "friend" } }), /source/],
      ["ended pair", (s) => ({ ...s, pair: { ...s.pair!, endedAt: "x" } }), /ended/],
      [
        "paired with a stranger",
        (s) => ({ ...s, pair: { ...s.pair!, memberIds: [DEMO, "someone"] } }),
        /demo learner/,
      ],
    ];
    for (const [name, change, expected] of cases) {
      expect(demoSeedProblems(change(good()), DEMO, BUDDY).join("|"), name).toMatch(expected);
    }
  });
});
