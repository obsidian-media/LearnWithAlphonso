import { describe, expect, it, vi } from "vitest";
import { asTestFns, createSupabaseMock } from "./__testutils__/supabase-mock";

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

const { getSeasonStatus } = asTestFns(await import("./season.functions"));

function ctxWith(invoke: ReturnType<typeof vi.fn>) {
  const supabase = createSupabaseMock() as unknown as {
    functions: { invoke: unknown };
  };
  supabase.functions = { invoke };
  return { supabase, userId: "user-1" };
}

describe("getSeasonStatus", () => {
  it("maps the Edge Function payload to the client shape", async () => {
    const invoke = vi.fn().mockResolvedValue({
      data: {
        division: 3,
        rankInCohort: 7,
        cohortSize: 30,
        lastWeekResult: { division: 2, rankInCohort: 1, cohortSize: 28 },
      },
      error: null,
    });

    const result = await getSeasonStatus({ context: ctxWith(invoke) });

    expect(invoke).toHaveBeenCalledWith("get-season-status", { method: "GET" });
    expect(result).toEqual({
      division: 3,
      rankInCohort: 7,
      cohortSize: 30,
      lastWeekResult: { division: 2, rankInCohort: 1, cohortSize: 28 },
    });
  });

  it("normalises a missing lastWeekResult to null", async () => {
    // A user's first season has no prior week; undefined would render
    // differently from null in the caller's optional chaining.
    const invoke = vi.fn().mockResolvedValue({
      data: { division: 1, rankInCohort: 5, cohortSize: 20 },
      error: null,
    });

    const result = await getSeasonStatus({ context: ctxWith(invoke) });

    expect(result!.lastWeekResult).toBeNull();
  });

  it("returns null when the Edge Function errors", async () => {
    // Deliberately soft: the season ladder is supplementary, so a failure
    // hides the section rather than breaking the page.
    const invoke = vi.fn().mockResolvedValue({ data: null, error: new Error("boom") });
    await expect(getSeasonStatus({ context: ctxWith(invoke) })).resolves.toBeNull();
  });

  it("returns null when the Edge Function returns no data", async () => {
    const invoke = vi.fn().mockResolvedValue({ data: null, error: null });
    await expect(getSeasonStatus({ context: ctxWith(invoke) })).resolves.toBeNull();
  });
});
