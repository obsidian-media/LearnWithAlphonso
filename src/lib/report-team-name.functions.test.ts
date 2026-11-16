import { describe, expect, it, vi } from "vitest";
import { asTestFns, chainable, createSupabaseMock } from "./__testutils__/supabase-mock";

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
      validator: (v: (d: unknown) => unknown) => {
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

const { reportTeamName } = asTestFns(await import("./social-safety.functions"));

const USER_ID = "22222222-2222-4222-8222-222222222222";
const TEAM_ID = "33333333-3333-4333-8333-333333333333";
const CREATOR_ID = "44444444-4444-4444-8444-444444444444";

function ctx(supabase: ReturnType<typeof createSupabaseMock>) {
  return { supabase, userId: USER_ID };
}

describe("reportTeamName", () => {
  it("files the report against the team's creator, with the team id in the context", async () => {
    const supabase = createSupabaseMock();
    const lookup = chainable({ data: { created_by: CREATOR_ID }, error: null });
    const insert = chainable({ data: null, error: null });
    supabase.from.mockReturnValueOnce(lookup).mockReturnValueOnce(insert);

    const result = await reportTeamName({
      context: ctx(supabase),
      data: { teamId: TEAM_ID, reason: "harassment" },
    });

    expect(result).toEqual({ ok: true, reason: null });
    expect(supabase.from).toHaveBeenNthCalledWith(1, "teams");
    expect(lookup.calls).toEqual([
      { method: "select", args: ["created_by"] },
      { method: "eq", args: ["id", TEAM_ID] },
      { method: "maybeSingle", args: [] },
    ]);
    expect(supabase.from).toHaveBeenNthCalledWith(2, "content_reports");
    expect(insert.calls).toEqual([
      {
        method: "insert",
        args: [
          {
            reported: CREATOR_ID,
            reason: "harassment",
            kind: "team_name",
            context: { team_id: TEAM_ID },
          },
        ],
      },
    ]);
  });

  it("files nothing for a team with no creator (a system-made name has no one to report)", async () => {
    const supabase = createSupabaseMock();
    supabase.from.mockReturnValueOnce(chainable({ data: { created_by: null }, error: null }));
    const result = await reportTeamName({
      context: ctx(supabase),
      data: { teamId: TEAM_ID, reason: "spam" },
    });
    expect(result).toEqual({ ok: false, reason: "no-creator" });
    expect(supabase.from).toHaveBeenCalledTimes(1);
  });

  it("files nothing for a team the caller cannot see (no row under their own access)", async () => {
    const supabase = createSupabaseMock();
    supabase.from.mockReturnValueOnce(chainable({ data: null, error: null }));
    const result = await reportTeamName({
      context: ctx(supabase),
      data: { teamId: TEAM_ID, reason: "spam" },
    });
    expect(result).toEqual({ ok: false, reason: "no-creator" });
    expect(supabase.from).toHaveBeenCalledTimes(1);
  });

  it("refuses, and files nothing, when the caller created the team", async () => {
    const supabase = createSupabaseMock();
    supabase.from.mockReturnValueOnce(chainable({ data: { created_by: USER_ID }, error: null }));
    const result = await reportTeamName({
      context: ctx(supabase),
      data: { teamId: TEAM_ID, reason: "spam" },
    });
    expect(result).toEqual({ ok: false, reason: "own-team" });
    expect(supabase.from).toHaveBeenCalledTimes(1);
  });

  it("says failed when the lookup or the insert errors", async () => {
    const lookupFails = createSupabaseMock();
    lookupFails.from.mockReturnValueOnce(chainable({ data: null, error: { code: "x" } }));
    expect(
      await reportTeamName({
        context: ctx(lookupFails),
        data: { teamId: TEAM_ID, reason: "spam" },
      }),
    ).toEqual({ ok: false, reason: "failed" });

    const insertFails = createSupabaseMock();
    insertFails.from
      .mockReturnValueOnce(chainable({ data: { created_by: CREATOR_ID }, error: null }))
      .mockReturnValueOnce(chainable({ data: null, error: { code: "x" } }));
    expect(
      await reportTeamName({
        context: ctx(insertFails),
        data: { teamId: TEAM_ID, reason: "spam" },
      }),
    ).toEqual({ ok: false, reason: "failed" });
  });

  it("rejects a reason outside the five and a team id that is not a uuid", async () => {
    const supabase = createSupabaseMock();
    await expect(
      reportTeamName({ context: ctx(supabase), data: { teamId: TEAM_ID, reason: "ai_harmful" } }),
    ).rejects.toThrow();
    await expect(
      reportTeamName({ context: ctx(supabase), data: { teamId: "x", reason: "spam" } }),
    ).rejects.toThrow();
    expect(supabase.from).not.toHaveBeenCalled();
  });
});
