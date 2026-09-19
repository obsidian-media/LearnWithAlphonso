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
  process.env.LESSON_SESSION_SECRET = "test-secret";
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
    supabase.from.mockReturnValueOnce(upsertChain);

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

  it("retires the item after enough correct repetitions and deletes the row", async () => {
    const supabase = createSupabaseMock();
    const deleteChain = chainable({});
    supabase.from
      .mockReturnValueOnce(chainable({ data: { ...rowBase, repetitions: 3 } }))
      .mockReturnValueOnce(deleteChain);
    const result = await gradeReview({
      context: ctx(supabase),
      data: { itemKey: "u1l1:q1", answer: "Good morning.", course: "en" },
    });
    expect(result.retired).toBe(true);
    expect(deleteChain.calls.some((c) => c.method === "delete")).toBe(true);
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
