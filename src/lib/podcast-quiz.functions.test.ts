import { beforeEach, describe, expect, it, vi } from "vitest";

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
        async (opts: { data?: unknown; context?: unknown } = {}) =>
          fn({ data: validator ? validator(opts.data) : opts.data, context: opts.context ?? {} }),
    };
    return builder;
  },
}));

const adminRpc = vi.fn();
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { rpc: adminRpc } }));

const { completePodcastQuiz } = (await import("./podcast-quiz.functions")) as unknown as {
  completePodcastQuiz: (o: { data: unknown; context: unknown }) => Promise<Record<string, unknown>>;
};
const EP = "11111111-1111-4111-8111-111111111111";
const answers = [{ questionId: "q1", choiceIndex: 1 }];
const call = (data: unknown = { episodeId: EP, answers }) =>
  completePodcastQuiz({ data, context: { userId: "user-1" } });

describe("completePodcastQuiz", () => {
  beforeEach(() => adminRpc.mockReset());

  it("hands the database the answers and the authenticated user, nothing the client claims", async () => {
    adminRpc.mockResolvedValue({ data: { status: "applied", xpGain: 40 }, error: null });
    const r = await call({ episodeId: EP, answers, correct: 7, xp: 9999, userId: "other" });
    expect(r.xpGain).toBe(40);
    const [name, args] = adminRpc.mock.calls[0]!;
    expect(name).toBe("submit_podcast_quiz");
    expect(args._user_id).toBe("user-1");
    expect(args._answers).toEqual(answers);
    expect(args._limit).toBe(60);
    expect(Object.keys(args).sort()).toEqual([
      "_answers",
      "_at",
      "_completed_at",
      "_episode_id",
      "_limit",
      "_user_id",
    ]);
  });

  it.each([
    ["rate-limited", "rate-limited"],
    ["not-found", "not-found"],
    ["invalid", "invalid-answers"],
  ])("turns the database's %s into the stable code %s", async (status, code) => {
    adminRpc.mockResolvedValue({ data: { status }, error: null });
    await expect(call()).rejects.toThrow(code);
  });

  it("passes the client's finish time through for the database to clamp", async () => {
    adminRpc.mockResolvedValue({ data: { status: "applied" }, error: null });
    await call({ episodeId: EP, answers, completedAt: "2026-11-05T01:30:00+14:00" });
    expect(adminRpc.mock.calls[0]![1]._completed_at).toBe("2026-11-05T01:30:00+14:00");
    expect(adminRpc.mock.calls[0]![1]).not.toHaveProperty("_today");
    await expect(call({ episodeId: EP, answers, completedAt: "yesterday" })).rejects.toThrow();
  });

  it("a database error is a retryable failure, not a success", async () => {
    adminRpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    await expect(call()).rejects.toThrow(/retry/);
  });

  it("rejects malformed input before touching the database", async () => {
    for (const bad of [
      {},
      { episodeId: "x", answers },
      { episodeId: EP, answers: [] },
      { episodeId: EP, answers: [{ questionId: "q1", choiceIndex: 9 }] },
    ]) {
      await expect(call(bad)).rejects.toThrow();
    }
    expect(adminRpc).not.toHaveBeenCalled();
  });
});
