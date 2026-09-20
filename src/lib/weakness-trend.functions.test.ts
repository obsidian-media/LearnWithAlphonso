import { describe, expect, it, vi } from "vitest";
import { asTestFns, chainable, createSupabaseMock } from "./__testutils__/supabase-mock";

vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const builder = {
      middleware: () => builder,
      handler:
        (fn: (opts: { data: unknown; context: unknown }) => unknown) =>
        async (opts: { data?: unknown; context?: unknown } = {}) =>
          fn({ data: opts.data, context: opts.context ?? {} }),
    };
    return builder;
  },
}));

const { getWeaknessTrend } = asTestFns(await import("./weakness-trend.functions"));

const USER_ID = "user-1";
function ctx(supabase: ReturnType<typeof createSupabaseMock>) {
  return { supabase, userId: USER_ID };
}

describe("getWeaknessTrend", () => {
  it("returns an empty list when the user has no weakness events", async () => {
    const supabase = createSupabaseMock();
    supabase.from.mockReturnValueOnce(chainable({ data: [] }));
    const result = await getWeaknessTrend({ context: ctx(supabase) });
    expect(result).toEqual({ categories: [] });
  });

  it("aggregates detected/resolved counts per category, open count floored at 0", async () => {
    const supabase = createSupabaseMock();
    supabase.from.mockReturnValueOnce(
      chainable({
        data: [
          { category: "past-tense", event_type: "detected", created_at: "2026-09-01T00:00:00Z" },
          { category: "past-tense", event_type: "detected", created_at: "2026-09-05T00:00:00Z" },
          { category: "past-tense", event_type: "resolved", created_at: "2026-09-10T00:00:00Z" },
          { category: "articles", event_type: "detected", created_at: "2026-09-02T00:00:00Z" },
          { category: "articles", event_type: "resolved", created_at: "2026-09-03T00:00:00Z" },
        ],
      }),
    );

    const result = await getWeaknessTrend({ context: ctx(supabase) });

    expect(result.categories).toEqual([
      {
        category: "past-tense",
        detectedCount: 2,
        resolvedCount: 1,
        openCount: 1,
        lastEventAt: "2026-09-10T00:00:00Z",
      },
      {
        category: "articles",
        detectedCount: 1,
        resolvedCount: 1,
        openCount: 0,
        lastEventAt: "2026-09-03T00:00:00Z",
      },
    ]);
  });

  it("scopes the read to the caller's own user id", async () => {
    const supabase = createSupabaseMock();
    const readChain = chainable({ data: [] });
    supabase.from.mockReturnValueOnce(readChain);
    await getWeaknessTrend({ context: ctx(supabase) });
    expect(supabase.from).toHaveBeenCalledWith("weakness_events");
    expect(readChain.calls.some((c) => c.method === "eq" && c.args[0] === "user_id")).toBe(true);
  });
});
