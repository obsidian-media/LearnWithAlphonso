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

const { completePodcastQuiz, fetchPodcastQuiz, fetchQuizEpisodeIds } =
  (await import("./podcast-quiz.functions")) as unknown as {
    completePodcastQuiz: (o: {
      data: unknown;
      context: unknown;
    }) => Promise<Record<string, unknown>>;
    fetchPodcastQuiz: (o: {
      data: unknown;
      context: unknown;
    }) => Promise<Record<string, unknown> | null>;
    fetchQuizEpisodeIds: (o: { data: unknown; context: unknown }) => Promise<string[]>;
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

describe("fetchPodcastQuiz", () => {
  type Result = { data: unknown; error: { message: string } | null };
  function client(tables: Record<string, Result>) {
    const calls: { table: string; eqs: [string, string][] }[] = [];
    return {
      calls,
      supabase: {
        from(table: string) {
          const call = { table, eqs: [] as [string, string][] };
          calls.push(call);
          const q: Record<string, unknown> = {
            select: () => q,
            eq: (c: string, v: string) => (call.eqs.push([c, v]), q),
            order: () => Promise.resolve(tables[table]),
            maybeSingle: () => Promise.resolve(tables[table]),
          };
          return q;
        },
      },
    };
  }
  const rows = [
    { id: "q1", prompt: "One?", choices: ["a", "b"], answer_index: 1 },
    { id: "q2", prompt: "Two?", choices: ["a", "b"], answer_index: 0 },
  ];
  const get = (c: ReturnType<typeof client>) =>
    fetchPodcastQuiz({
      data: { episodeId: EP },
      context: { supabase: c.supabase, userId: "user-1" },
    });

  it("returns the questions in order, with the learner's best", async () => {
    const c = client({
      podcast_quiz_questions: { data: rows, error: null },
      podcast_quiz_awards: { data: { best_correct: 5, best_xp: 50 }, error: null },
    });
    expect(await get(c)).toEqual({
      questions: [
        { id: "q1", prompt: "One?", choices: ["a", "b"], answerIndex: 1 },
        { id: "q2", prompt: "Two?", choices: ["a", "b"], answerIndex: 0 },
      ],
      best: { correct: 5, xp: 50 },
    });
    const awards = c.calls.find((x) => x.table === "podcast_quiz_awards")!;
    expect(awards.eqs).toContainEqual(["user_id", "user-1"]);
  });

  it("offers nothing for an episode with no quiz (or one the learner cannot see)", async () => {
    const c = client({
      podcast_quiz_questions: { data: [], error: null },
      podcast_quiz_awards: { data: null, error: null },
    });
    expect(await get(c)).toBeNull();
  });

  it("a failed best-score read still offers the quiz", async () => {
    const c = client({
      podcast_quiz_questions: { data: rows, error: null },
      podcast_quiz_awards: { data: null, error: { message: "x" } },
    });
    expect((await get(c))?.best).toBeNull();
  });

  it("a failed question read is an error, not an empty quiz", async () => {
    const c = client({
      podcast_quiz_questions: { data: null, error: { message: "boom" } },
      podcast_quiz_awards: { data: null, error: null },
    });
    await expect(get(c)).rejects.toThrow("request-failed");
  });
});

describe("fetchQuizEpisodeIds", () => {
  const ids = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"];
  function client(result: { data: unknown; error: { message: string } | null }) {
    const seen: { table?: string; col?: string; vals?: string[] } = {};
    return {
      seen,
      supabase: {
        from(table: string) {
          seen.table = table;
          const q = {
            select: () => q,
            in: (col: string, vals: string[]) => (
              (seen.col = col),
              (seen.vals = vals),
              Promise.resolve(result)
            ),
          };
          return q;
        },
      },
    };
  }
  const call = (c: ReturnType<typeof client>, episodeIds: string[] = ids) =>
    fetchQuizEpisodeIds({ data: { episodeIds }, context: { supabase: c.supabase, userId: "u" } });

  it("returns each episode that has questions once", async () => {
    const c = client({ data: [{ episode_id: ids[0] }, { episode_id: ids[0] }], error: null });
    expect(await call(c)).toEqual([ids[0]]);
    expect(c.seen).toMatchObject({ table: "podcast_quiz_questions", col: "episode_id", vals: ids });
  });

  it("asks nothing for an empty list", async () => {
    const c = client({ data: [], error: null });
    expect(await call(c, [])).toEqual([]);
    expect(c.seen.table).toBeUndefined();
  });

  it("rejects ids that are not uuids and lists that are too long", async () => {
    const c = client({ data: [], error: null });
    await expect(call(c, ["nope"])).rejects.toThrow();
    await expect(
      call(
        c,
        Array.from({ length: 201 }, () => ids[0]!),
      ),
    ).rejects.toThrow();
  });

  it("a failed read is an error the caller can ignore", async () => {
    await expect(call(client({ data: null, error: { message: "boom" } }))).rejects.toThrow(
      "request-failed",
    );
  });
});
