import { describe, expect, it } from "vitest";
import { buildLearnerFacts, type RawLearnerFacts } from "./staff-user-facts.server";

const NOW = Date.parse("2026-11-13T12:00:00Z");
const FUTURE = "2026-12-01T00:00:00Z";

function raw(over: Partial<RawLearnerFacts> = {}): RawLearnerFacts {
  return {
    user: { id: "u1", email: "ada@example.com", createdAt: "2026-01-01T00:00:00Z" },
    displayName: "Ada",
    languageProgress: [
      { language: "fr", cefr_level: "A2", xp: 300, updated_at: "2026-11-01T00:00:00Z" },
      { language: "es", cefr_level: "A1", xp: 50, updated_at: "2026-11-10T00:00:00Z" },
    ],
    streak: 12,
    lastActiveDay: "2026-11-12",
    platforms: ["ios", "ios", "android"],
    reportsAgainst: 2,
    restrictions: [
      {
        kind: "block",
        reason: "spam",
        created_at: "2026-11-02T00:00:00Z",
        lifted_at: null,
      },
    ],
    grants: [],
    notes: [{ author: "Sam", body: "called about billing", created_at: "2026-11-03T00:00:00Z" }],
    subscriber: {
      status: "inactive",
      store: null,
      trialEligible: true,
      managementUrl: null,
      loginId: "u1",
    },
    ...over,
  };
}

describe("buildLearnerFacts", () => {
  it("assembles the account facts", () => {
    const f = buildLearnerFacts(raw(), NOW);
    expect(f).toMatchObject({
      id: "u1",
      email: "ada@example.com",
      displayName: "Ada",
      createdAt: "2026-01-01T00:00:00Z",
      lastActiveAt: "2026-11-12",
      // the most recently touched course
      course: "es",
      level: "A1",
      xp: 50,
      streak: 12,
      reportsAgainst: 2,
    });
    expect(f.platforms).toEqual(["android", "ios"]);
    expect(f.restrictions).toEqual([
      { kind: "block", reason: "spam", createdAt: "2026-11-02T00:00:00Z", liftedAt: null },
    ]);
    expect(f.notes).toEqual([
      { author: "Sam", body: "called about billing", createdAt: "2026-11-03T00:00:00Z" },
    ]);
  });

  it("Pro from a store reads as source store with no end date", () => {
    const f = buildLearnerFacts(
      raw({
        subscriber: {
          status: "active",
          store: "app_store",
          trialEligible: false,
          managementUrl: null,
          loginId: "u1",
        },
      }),
      NOW,
    );
    expect(f.pro).toEqual({
      active: true,
      source: "store",
      until: null,
      unavailable: false,
      notConnected: false,
    });
  });

  it("a promotional entitlement reads as a gift ending when the live grant ends", () => {
    const f = buildLearnerFacts(
      raw({
        subscriber: {
          status: "active",
          store: "promotional",
          trialEligible: false,
          managementUrl: null,
          loginId: "u1",
        },
        grants: [
          { ends_at: "2026-11-01T00:00:00Z", reason: "old", revoked_at: null },
          { ends_at: FUTURE, reason: "goodwill", revoked_at: null },
          {
            ends_at: "2027-06-01T00:00:00Z",
            reason: "revoked",
            revoked_at: "2026-11-05T00:00:00Z",
          },
        ],
      }),
      NOW,
    );
    expect(f.pro).toEqual({
      active: true,
      source: "gift",
      until: FUTURE,
      unavailable: false,
      notConnected: false,
    });
    expect(f.gifts).toHaveLength(3);
    expect(f.gifts[2]).toEqual({
      endsAt: "2027-06-01T00:00:00Z",
      reason: "revoked",
      revokedAt: "2026-11-05T00:00:00Z",
    });
  });

  it("no Pro reads as none; RevenueCat unset is 'not connected'; set but unreachable is 'unavailable'; neither is 'none'", () => {
    expect(buildLearnerFacts(raw(), NOW).pro).toEqual({
      active: false,
      source: "none",
      until: null,
      unavailable: false,
      notConnected: false,
    });
    expect(buildLearnerFacts(raw({ subscriber: null }), NOW).pro).toEqual({
      active: false,
      source: "none",
      until: null,
      unavailable: true,
      notConnected: true,
    });
    const unreachable = buildLearnerFacts(
      raw({ subscriber: { status: "unavailable" } as never }),
      NOW,
    );
    expect(unreachable.pro).toMatchObject({
      unavailable: true,
      notConnected: false,
      active: false,
    });
  });

  it("the lessons count is a number or null (never a 0 for a count that could not be read)", () => {
    expect(buildLearnerFacts(raw({ lessonsDone: 42 }), NOW).lessonsDone).toBe(42);
    expect(buildLearnerFacts(raw({ lessonsDone: 0 }), NOW).lessonsDone).toBe(0);
    expect(buildLearnerFacts(raw({ lessonsDone: null }), NOW).lessonsDone).toBeNull();
    expect(buildLearnerFacts(raw(), NOW).lessonsDone).toBeNull();
  });

  it("facts never include keys named like payment|card|messages|answers (deep scan)", () => {
    const f = buildLearnerFacts(
      raw({
        subscriber: {
          status: "active",
          store: "web",
          trialEligible: false,
          managementUrl: "https://x.test/portal",
          loginId: "u1",
        },
      }),
      NOW,
    );
    const bad: string[] = [];
    const walk = (v: unknown, trail: string) => {
      if (Array.isArray(v)) return v.forEach((x, i) => walk(x, `${trail}[${i}]`));
      if (v && typeof v === "object") {
        for (const [k, x] of Object.entries(v)) {
          if (/payment|card|messages|answers|password|token/i.test(k)) bad.push(`${trail}.${k}`);
          walk(x, `${trail}.${k}`);
        }
      }
    };
    walk(f, "facts");
    expect(bad).toEqual([]);
    // the management link is a payment-portal URL: not exposed to support
    expect(JSON.stringify(f)).not.toContain("portal");
  });
});
