import { describe, expect, it } from "vitest";
import {
  SUPPORT_FACT_KEYS,
  buildSupportFacts,
  loadSupportFacts,
  type RawSupportFacts,
} from "./support-facts.server";

const NOW = Date.parse("2026-11-14T12:00:00Z");
const base: RawSupportFacts = {
  languageProgress: [
    { language: "fr", cefr_level: "A2", updated_at: "2026-11-13T00:00:00Z" },
    { language: "es", cefr_level: "A1", updated_at: "2026-10-01T00:00:00Z" },
  ],
  streak: 6,
  activeDaysLast30: ["2026-11-14", "2026-11-13", "2026-11-13", "2026-09-01"],
  lastActiveDay: "2026-11-14",
  lessonTimesLast7Days: ["2026-11-14T08:00:00Z", "2026-11-12T08:00:00Z", "2026-11-01T08:00:00Z"],
  lastLessonAt: "2026-11-14T08:00:00Z",
  platforms: ["ios", "ios", "android"],
  socialBlocked: false,
  grants: [],
  previousTickets: [],
  subscriber: null,
};
const active = (store: string) =>
  ({
    status: "active",
    store,
    trialEligible: false,
    managementUrl: "https://secret.example/portal",
  }) as never;

describe("buildSupportFacts", () => {
  it("has exactly the allowlisted keys (update the spec and docs/privacy-and-data.md if you add one)", () => {
    expect(Object.keys(buildSupportFacts(base, NOW))).toEqual([...SUPPORT_FACT_KEYS]);
    expect([...SUPPORT_FACT_KEYS]).toEqual([
      "pro",
      "course",
      "level",
      "streak",
      "daysActiveLast30",
      "lastActiveDay",
      "lessonsLast7Days",
      "lastLessonDay",
      "platforms",
      "socialBlocked",
      "previousTickets",
    ]);
  });

  it("store Pro, gift Pro (with its end day), no Pro, and RevenueCat unavailable are four different answers", () => {
    expect(buildSupportFacts({ ...base, subscriber: active("app_store") }, NOW).pro).toEqual({
      active: true,
      source: "store",
      until: null,
      unavailable: false,
    });
    expect(
      buildSupportFacts(
        {
          ...base,
          subscriber: active("promotional"),
          grants: [
            { ends_at: "2026-12-24T10:00:00Z", revoked_at: null },
            { ends_at: "2027-06-01T10:00:00Z", revoked_at: "2026-11-01T00:00:00Z" },
          ],
        },
        NOW,
      ).pro,
    ).toEqual({ active: true, source: "gift", until: "2026-12-24", unavailable: false });
    expect(
      buildSupportFacts(
        {
          ...base,
          subscriber: {
            status: "inactive",
            store: null,
            trialEligible: true,
            managementUrl: null,
          } as never,
        },
        NOW,
      ).pro,
    ).toEqual({ active: false, source: "none", until: null, unavailable: false });
    expect(
      buildSupportFacts({ ...base, subscriber: { status: "unavailable" } as never }, NOW).pro
        .unavailable,
    ).toBe(true);
    // Not configured is "unknown", never "no Pro".
    expect(buildSupportFacts(base, NOW).pro).toEqual({
      active: false,
      source: "none",
      until: null,
      unavailable: true,
    });
  });

  it("counts days and lessons inside their windows and takes the most recent course", () => {
    expect(buildSupportFacts(base, NOW)).toMatchObject({
      course: "fr",
      level: "A2",
      streak: 6,
      daysActiveLast30: 2,
      lastActiveDay: "2026-11-14",
      lessonsLast7Days: 2,
      lastLessonDay: "2026-11-14",
      platforms: ["android", "ios"],
      socialBlocked: false,
    });
  });

  it("keeps at most 3 previous tickets as status, topic and day only", () => {
    const f = buildSupportFacts(
      {
        ...base,
        previousTickets: [1, 2, 3, 4].map((n) => ({
          status: "solved",
          topic: "billing",
          created_at: `2026-10-0${n}T10:00:00Z`,
          body: "SECRET TEXT",
          user_id: "u",
        })) as never,
      },
      NOW,
    );
    expect(f.previousTickets).toEqual([
      { status: "solved", topic: "billing", day: "2026-10-04" },
      { status: "solved", topic: "billing", day: "2026-10-03" },
      { status: "solved", topic: "billing", day: "2026-10-02" },
    ]);
  });

  it("carries no email, id, name, reason, link or note, even when the raw input is full of them", () => {
    const f = JSON.stringify(
      buildSupportFacts(
        {
          ...base,
          subscriber: active("promotional"),
          grants: [
            {
              ends_at: "2026-12-24T10:00:00Z",
              revoked_at: null,
              reason: "GIFT-REASON-SENTINEL",
            } as never,
          ],
          socialBlocked: true,
          // Fields a careless loader might pass through.
          ...({
            email: "x@example.com",
            userId: "0000-USER-ID",
            displayName: "Maria",
            notes: ["NOTE-SENTINEL"],
            reason: "REASON-SENTINEL",
          } as object),
        } as RawSupportFacts,
        NOW,
      ),
    );
    for (const leak of [
      "x@example.com",
      "0000-USER-ID",
      "Maria",
      "NOTE-SENTINEL",
      "REASON-SENTINEL",
      "GIFT-REASON-SENTINEL",
      "secret.example",
      "@",
    ]) {
      expect(f).not.toContain(leak);
    }
    expect(JSON.parse(f).socialBlocked).toBe(true);
  });
});

describe("loadSupportFacts", () => {
  /** A table-by-table fake of the service-role client that records every learner id it was asked about. */
  function fakeAdmin(rows: Record<string, unknown[]>, ids: string[]) {
    const chain = (table: string) => {
      const result = () => ({
        data: rows[table] ?? [],
        error: null,
        count: (rows[table] ?? []).length,
      });
      const q: Record<string, unknown> = {};
      for (const m of ["select", "gte", "is", "order", "limit"]) q[m] = () => q;
      q.eq = (col: string, v: string) => {
        if (col === "user_id") ids.push(v);
        return q;
      };
      q.maybeSingle = async () => ({ data: (rows[table] ?? [])[0] ?? null, error: null });
      q.then = (res: (v: unknown) => unknown) => res(result());
      return q;
    };
    return { from: chain } as never;
  }

  it("reads only the session user's rows (every query filters by that one id)", async () => {
    const ids: string[] = [];
    const facts = await loadSupportFacts(
      fakeAdmin({ user_progress: [{ streak: 3 }], device_tokens: [{ platform: "ios" }] }, ids),
      "learner-A",
      { now: NOW },
    );
    expect(facts.streak).toBe(3);
    expect(facts.platforms).toEqual(["ios"]);
    expect(ids.length).toBeGreaterThan(5);
    expect(new Set(ids)).toEqual(new Set(["learner-A"]));
  });

  it("a failed read throws instead of returning a partial picture", async () => {
    const admin = {
      from: () => {
        const q: Record<string, unknown> = {};
        for (const m of ["select", "gte", "is", "order", "limit", "eq"]) q[m] = () => q;
        q.maybeSingle = async () => ({ data: null, error: { message: "boom" } });
        q.then = (res: (v: unknown) => unknown) => res({ data: null, error: { message: "boom" } });
        return q;
      },
    } as never;
    await expect(loadSupportFacts(admin, "learner-A")).rejects.toThrow(/Could not read/);
  });
});
