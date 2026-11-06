import { describe, expect, it, vi } from "vitest";
import {
  asTestFns,
  chainable,
  createSupabaseMock,
  type ChainCall,
} from "./__testutils__/supabase-mock";

vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validator: ((d: unknown) => unknown) | undefined;
    const builder = {
      middleware: () => builder,
      inputValidator: (v: (d: unknown) => unknown) => {
        validator = v;
        return builder;
      },
      handler:
        (fn: (opts: { data: unknown; context: unknown }) => unknown) =>
        async (opts: { data?: unknown; context?: unknown } = {}) => {
          const data = validator ? validator(opts.data) : opts.data;
          return fn({ data, context: opts.context ?? {} });
        },
    };
    return builder;
  },
}));

const mod = await import("./speech-days.functions");
const { getSpeechHistory } = asTestFns({ getSpeechHistory: mod.getSpeechHistory });
const { lastUtcDays, speechHistory } = mod;

const DAY_MS = 86_400_000;
/** A UTC date `offset` days from the real clock's today. */
const dayFromToday = (offset: number) =>
  new Date(Date.now() + offset * DAY_MS).toISOString().slice(0, 10);

describe("lastUtcDays", () => {
  it("is the n UTC days ending today, oldest first, across a month and year end", () => {
    // Fixed instants are fine here: this pure helper takes its clock as an argument.
    expect(lastUtcDays(3, new Date("2027-01-01T23:30:00Z"))).toEqual([
      "2026-12-30",
      "2026-12-31",
      "2027-01-01",
    ]);
    // 23:30 at UTC-5 is already the next day in UTC: the UTC date counts, as for XP.
    expect(lastUtcDays(1, new Date("2026-11-06T23:30:00-05:00"))).toEqual(["2026-11-07"]);
  });
});

describe("speechHistory", () => {
  it("fills days with nothing spoken with 0 and ignores rows outside the window", () => {
    const now = new Date("2026-11-06T12:00:00Z");
    const result = speechHistory(
      [
        { day: "2026-11-01", speech_seconds: 999 }, // outside a 3-day window
        { day: "2026-11-04", speech_seconds: 30 },
        { day: "2026-11-06", speech_seconds: 45 },
      ],
      3,
      now,
    );
    expect(result).toEqual({
      days: [
        { day: "2026-11-04", seconds: 30 },
        { day: "2026-11-05", seconds: 0 },
        { day: "2026-11-06", seconds: 45 },
      ],
      totalSeconds: 75,
    });
  });
});

describe("getSpeechHistory", () => {
  function ctx(rows: unknown, error: unknown = null) {
    const supabase = createSupabaseMock();
    const calls: ChainCall[] = [];
    supabase.from.mockReturnValueOnce(chainable({ data: rows, error }, calls));
    return { supabase, calls, context: { supabase, userId: "user-1" } };
  }

  it("returns the signed-in learner's last N days from their own rows, today last", async () => {
    const { supabase, calls, context } = ctx([
      { day: dayFromToday(-2), speech_seconds: 60 },
      { day: dayFromToday(0), speech_seconds: 95 },
    ]);
    const result = await getSpeechHistory({ data: { days: 7 }, context });
    expect(supabase.from).toHaveBeenCalledWith("speech_days");
    expect(calls).toContainEqual({ method: "eq", args: ["user_id", "user-1"] });
    expect(calls).toContainEqual({ method: "gte", args: ["day", dayFromToday(-6)] });
    expect(result.days).toHaveLength(7);
    expect(result.days.at(-1)).toEqual({ day: dayFromToday(0), seconds: 95 });
    expect(result.days.at(-3)).toEqual({ day: dayFromToday(-2), seconds: 60 });
    expect(result.totalSeconds).toBe(155);
  });

  it("defaults to 30 days", async () => {
    const { context } = ctx([]);
    const result = await getSpeechHistory({ data: {}, context });
    expect(result.days).toHaveLength(30);
    expect(result.totalSeconds).toBe(0);
  });

  it("refuses a window under 1 day or over a year", async () => {
    for (const days of [0, 366, 2.5]) {
      const { context } = ctx([]);
      await expect(getSpeechHistory({ data: { days }, context })).rejects.toThrow();
    }
  });

  it("fails loudly, without leaking the database message, instead of showing zero minutes", async () => {
    const { context } = ctx(null, { message: "permission denied for table speech_days" });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const failure = getSpeechHistory({ data: { days: 7 }, context });
    // A stable code for the browser; the database's own message goes only to the server log.
    await expect(failure).rejects.toThrow("getSpeechHistory: request-failed");
    await expect(failure).rejects.not.toThrow(/speech_days/);
    log.mockRestore();
  });
});
