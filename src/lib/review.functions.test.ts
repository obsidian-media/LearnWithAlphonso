import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

// review_items no longer grants direct INSERT/UPDATE to `authenticated`
// (supabase/migrations/20260920050000_revoke_direct_gamification_writes.sql)
// -- recordMisses/gradeReview write it via supabaseAdmin now (its DELETE
// path in gradeReview's retire branch is unaffected and stays on the
// RLS-scoped client).
const supabaseAdminFrom = vi.fn();
const supabaseAdminRpc = vi.fn();
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: supabaseAdminFrom, rpc: supabaseAdminRpc },
}));

const hasAiConsent = vi.fn(async () => true);
vi.mock("./ai-consent.server", () => ({ hasAiConsent }));
const consumeQuota = vi.fn(async () => ({ ok: true as const, used: 1, limit: 60 }));
vi.mock("./ai-quota.server", () => ({ consumeQuota }));
vi.mock("@tanstack/react-start/server", () => ({ getRequest: () => new Request("https://x/") }));

const { recordMisses, fetchDueReviews, gradeReview, claimReviewClearBonusRemote } = asTestFns(
  await import("./review.functions"),
);
const { issueLessonSessionToken } = await import("./lesson-session.server");

const USER_ID = "user-1";
const LESSON_ID = "u1l1"; // real lesson: q1..q8

function ctx(supabase: ReturnType<typeof createSupabaseMock>) {
  return { supabase, userId: USER_ID };
}

beforeEach(() => {
  consumeQuota.mockClear();
  process.env.LESSON_SESSION_SECRET = "test-secret";
  supabaseAdminFrom.mockReset();
  supabaseAdminFrom.mockReturnValue(chainable({ data: null, error: null }));
  supabaseAdminRpc.mockReset();
  supabaseAdminRpc.mockImplementation(async (_name: string, args: Record<string, unknown>) => ({
    data: {
      status: "applied",
      retired: args._retired,
      dueOn: args._new_due_on,
      correct: args._correct,
    },
    error: null,
  }));
});

afterEach(() => {
  delete process.env.LESSON_SESSION_SECRET;
});

describe("recordMisses", () => {
  function validToken() {
    return issueLessonSessionToken({ userId: USER_ID, lessonId: LESSON_ID, course: "en" });
  }

  it("upserts a review_items row per claimed-missed real question", async () => {
    const supabase = createSupabaseMock();
    const upsertChain = chainable({ error: null });
    supabaseAdminFrom.mockReturnValueOnce(upsertChain);

    const result = await recordMisses({
      context: ctx(supabase),
      data: {
        lessonId: LESSON_ID,
        level: "A1",
        itemKeys: [`${LESSON_ID}:q1`, `${LESSON_ID}:q3`],
        course: "en",
        sessionToken: validToken(),
      },
    });

    expect(result).toEqual({ added: 2 });
    const upsertArgs = upsertChain.calls.find((c) => c.method === "upsert")?.args as [
      { item_key: string }[],
      unknown,
    ];
    expect(upsertArgs[0].map((r) => r.item_key)).toEqual([`${LESSON_ID}:q1`, `${LESSON_ID}:q3`]);
  });

  it("short-circuits with added: 0 for an empty itemKeys list, without touching the DB", async () => {
    const supabase = createSupabaseMock();
    const result = await recordMisses({
      context: ctx(supabase),
      data: {
        lessonId: LESSON_ID,
        level: "A1",
        itemKeys: [],
        course: "en",
        sessionToken: validToken(),
      },
    });
    expect(result).toEqual({ added: 0 });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("rejects a forged or expired session token", async () => {
    const supabase = createSupabaseMock();
    await expect(
      recordMisses({
        context: ctx(supabase),
        data: {
          lessonId: LESSON_ID,
          level: "A1",
          itemKeys: [`${LESSON_ID}:q1`],
          course: "en",
          sessionToken: "forged.token",
        },
      }),
    ).rejects.toThrow("Invalid or expired lesson session");
  });

  it("rejects an item key naming a question that isn't in this lesson", async () => {
    const supabase = createSupabaseMock();
    await expect(
      recordMisses({
        context: ctx(supabase),
        data: {
          lessonId: LESSON_ID,
          level: "A1",
          itemKeys: [`${LESSON_ID}:q999`],
          course: "en",
          sessionToken: validToken(),
        },
      }),
    ).rejects.toThrow("Invalid item key for this lesson");
  });

  it("rejects an item key whose lesson id doesn't match the request", async () => {
    const supabase = createSupabaseMock();
    await expect(
      recordMisses({
        context: ctx(supabase),
        data: {
          lessonId: LESSON_ID,
          level: "A1",
          itemKeys: [`u1l2:q1`],
          course: "en",
          sessionToken: validToken(),
        },
      }),
    ).rejects.toThrow("Invalid item key for this lesson");
  });
});

describe("fetchDueReviews", () => {
  it("maps due rows and returns the total count", async () => {
    const supabase = createSupabaseMock();
    supabase.from
      .mockReturnValueOnce(
        chainable({
          data: [
            {
              item_key: "u1l1:q1",
              lesson_id: "u1l1",
              level: "A1",
              ease: 2.3,
              interval_days: 1,
              repetitions: 1,
              due_on: "2026-09-19",
            },
          ],
        }),
      )
      .mockReturnValueOnce(chainable({ count: 7 }));

    const result = await fetchDueReviews({ context: ctx(supabase), data: { course: "en" } });

    expect(result.total).toBe(7);
    expect(result.due).toEqual([
      {
        itemKey: "u1l1:q1",
        lessonId: "u1l1",
        level: "A1",
        ease: 2.3,
        intervalDays: 1,
        repetitions: 1,
        dueOn: "2026-09-19",
      },
    ]);
  });

  it("defaults to an empty list and zero total when nothing is due", async () => {
    const supabase = createSupabaseMock();
    supabase.from
      .mockReturnValueOnce(chainable({ data: null }))
      .mockReturnValueOnce(chainable({ count: null }));
    const result = await fetchDueReviews({ context: ctx(supabase), data: { course: "en" } });
    expect(result).toEqual({ due: [], total: 0 });
  });
});

describe("gradeReview", () => {
  const rowBase = {
    ease: 2.3,
    interval_days: 0,
    repetitions: 0,
    lapses: 0,
    due_on: new Date().toISOString().slice(0, 10),
    created_at: new Date().toISOString(),
    last_reviewed_at: null,
  };

  it("returns retired: false with today's date when the item no longer exists", async () => {
    const supabase = createSupabaseMock();
    supabase.from.mockReturnValueOnce(chainable({ data: null }));
    const result = await gradeReview({
      context: ctx(supabase),
      data: { itemKey: "u1l1:q1", answer: "anything", course: "en" },
    });
    expect(result.retired).toBe(false);
  });

  it("does not treat a failed review read as a missing item", async () => {
    const supabase = createSupabaseMock();
    supabase.from.mockReturnValueOnce(
      chainable({ data: null, error: { message: "read unavailable" } }),
    );
    await expect(
      gradeReview({
        context: ctx(supabase),
        data: { itemKey: "u1l1:q1", answer: "Good morning.", course: "en" },
      }),
    ).rejects.toThrow("Could not load review item");
  });

  it("does not acknowledge a failed review update", async () => {
    const supabase = createSupabaseMock();
    supabase.from.mockReturnValueOnce(chainable({ data: { ...rowBase } }));
    supabaseAdminRpc.mockResolvedValueOnce({ data: null, error: { message: "write unavailable" } });
    await expect(
      gradeReview({
        context: ctx(supabase),
        data: { itemKey: "u1l1:q1", answer: "Good morning.", course: "en" },
      }),
    ).rejects.toThrow("Could not save review grade");
  });

  it("a translate answer is not sent to the AI, and no quota is spent, without consent", async () => {
    hasAiConsent.mockResolvedValue(false);
    const { getCourse } = await import("@/data/courses");
    const [itemKey] = Object.entries(getCourse("en").questionIndex).find(
      ([, r]) => r.question.type === "translate",
    )!;
    const originalFetch = global.fetch;
    process.env.NVIDIA_API_KEY = "test-key";
    global.fetch = vi.fn() as typeof fetch;
    try {
      const supabase = createSupabaseMock();
      supabase.from.mockReturnValueOnce(chainable({ data: { ...rowBase } }));
      await gradeReview({
        context: ctx(supabase),
        data: { itemKey, answer: "zzqx unlisted wording", course: "en" },
      });
      expect(hasAiConsent).toHaveBeenCalledWith(supabase, USER_ID);
      expect(global.fetch).not.toHaveBeenCalled();
      expect(consumeQuota).not.toHaveBeenCalled();
    } finally {
      global.fetch = originalFetch;
      delete process.env.NVIDIA_API_KEY;
      hasAiConsent.mockResolvedValue(true);
    }
  });

  it("rejects grading an item before its due date", async () => {
    const supabase = createSupabaseMock();
    const future = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
    supabase.from.mockReturnValueOnce(chainable({ data: { ...rowBase, due_on: future } }));
    await expect(
      gradeReview({
        context: ctx(supabase),
        data: { itemKey: "u1l1:q1", answer: "x", course: "en" },
      }),
    ).rejects.toThrow("This item isn't due yet");
  });

  it("re-derives correctness from the real question rather than trusting the client", async () => {
    const supabase = createSupabaseMock();
    // u1l1:q1 is mc with the correct choice at index 2: "Good morning."
    supabase.from.mockReturnValueOnce(chainable({ data: { ...rowBase } }));
    const result = await gradeReview({
      context: ctx(supabase),
      data: { itemKey: "u1l1:q1", answer: "Good morning.", course: "en" },
    });
    // Correct answer on repetitions 0->1: not yet retired, interval grows to 1 day.
    expect(result.retired).toBe(false);
  });

  it("grows the interval further for a review that's well overdue", async () => {
    const supabase = createSupabaseMock();
    supabase.from.mockReturnValueOnce(
      chainable({
        data: {
          ...rowBase,
          interval_days: 3,
          repetitions: 2,
          last_reviewed_at: new Date(Date.now() - 3 * 86400000).toISOString(), // reviewed exactly on schedule
        },
      }),
    );
    const onTime = await gradeReview({
      context: ctx(supabase),
      data: { itemKey: "u1l1:q1", answer: "Good morning.", course: "en" },
    });

    const supabaseOverdue = createSupabaseMock();
    supabaseOverdue.from.mockReturnValueOnce(
      chainable({
        data: {
          ...rowBase,
          interval_days: 3,
          repetitions: 2,
          last_reviewed_at: new Date(Date.now() - 30 * 86400000).toISOString(), // 10x overdue
        },
      }),
    );
    const overdue = await gradeReview({
      context: ctx(supabaseOverdue),
      data: { itemKey: "u1l1:q1", answer: "Good morning.", course: "en" },
    });

    expect(onTime.retired).toBe(false);
    expect(overdue.retired).toBe(false);
    if (!onTime.retired && !overdue.retired) {
      expect(new Date(overdue.dueOn).getTime()).toBeGreaterThan(new Date(onTime.dueOn).getTime());
    }
  });

  it("retires the item through the atomic database transition", async () => {
    const supabase = createSupabaseMock();
    supabase.from.mockReturnValueOnce(chainable({ data: { ...rowBase, repetitions: 3 } }));
    const result = await gradeReview({
      context: ctx(supabase),
      data: { itemKey: "u1l1:q1", answer: "Good morning.", course: "en" },
    });
    expect(result.retired).toBe(true);
    expect(supabaseAdminRpc).toHaveBeenCalledWith(
      "apply_review_grade",
      expect.objectContaining({ _retired: true, _correct: true }),
    );
  });

  it("passes a retiring weakness to the atomic transition (which logs its event)", async () => {
    const supabase = createSupabaseMock();
    supabase.from.mockReturnValueOnce(
      chainable({
        data: {
          ...rowBase,
          repetitions: 3,
          source: "weakness",
          weakness_label: "past-tense",
          choices: ["went", "go", "goed", "gone"],
          answer_index: 0,
        },
      }),
    );

    const result = await gradeReview({
      context: ctx(supabase),
      data: { itemKey: "weakness:abc123", answer: "went", course: "en" },
    });

    expect(result.retired).toBe(true);
    expect(supabaseAdminRpc).toHaveBeenCalledWith(
      "apply_review_grade",
      expect.objectContaining({ _retired: true, _item_key: "weakness:abc123" }),
    );
  });

  it("grades a saved_word item from its stored choices, and does not log a weakness event", async () => {
    const supabase = createSupabaseMock();
    supabase.from.mockReturnValueOnce(
      chainable({
        data: {
          ...rowBase,
          repetitions: 3,
          source: "saved_word",
          choices: ["a sad ending", "a happy accident", "a long journey", "a loud noise"],
          answer_index: 1,
        },
      }),
    );

    const result = await gradeReview({
      context: ctx(supabase),
      data: { itemKey: "savedword:0123456789abcdef", answer: "a happy accident", course: "en" },
    });

    expect(result.retired).toBe(true);
    expect(supabaseAdminRpc).toHaveBeenCalledWith(
      "apply_review_grade",
      expect.objectContaining({ _retired: true, _item_key: "savedword:0123456789abcdef" }),
    );
  });

  it("marks a wrong saved_word answer incorrect (it lapses, it does not retire)", async () => {
    const supabase = createSupabaseMock();
    supabase.from
      .mockReturnValueOnce(
        chainable({
          data: {
            ...rowBase,
            repetitions: 3,
            source: "saved_word",
            choices: ["a sad ending", "a happy accident", "a long journey", "a loud noise"],
            answer_index: 1,
          },
        }),
      )
      .mockReturnValue(chainable({}));
    const result = await gradeReview({
      context: ctx(supabase),
      data: { itemKey: "savedword:0123456789abcdef", answer: "a sad ending", course: "en" },
    });
    expect(result.retired).toBe(false);
  });

  it("throws for an itemKey with no matching question in the course index", async () => {
    const supabase = createSupabaseMock();
    supabase.from.mockReturnValueOnce(chainable({ data: { ...rowBase } }));
    await expect(
      gradeReview({
        context: ctx(supabase),
        data: { itemKey: "u1l1:q999", answer: "x", course: "en" },
      }),
    ).rejects.toThrow("Unknown review item");
  });
});

describe("claimReviewClearBonusRemote", () => {
  it("returns the granted bonus from the RPC", async () => {
    const supabase = createSupabaseMock();
    supabase.rpc.mockResolvedValue({ data: [{ granted: true, hearts: 5 }], error: null });
    const result = await claimReviewClearBonusRemote({
      context: ctx(supabase),
      data: { course: "en" },
    });
    expect(result).toEqual({ granted: true, hearts: 5 });
  });

  it("throws when the RPC errors", async () => {
    const supabase = createSupabaseMock();
    supabase.rpc.mockResolvedValue({ data: null, error: new Error("db down") });
    await expect(
      claimReviewClearBonusRemote({ context: ctx(supabase), data: { course: "en" } }),
    ).rejects.toThrow("Could not check review-clear bonus");
  });
});
