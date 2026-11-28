import { beforeEach, describe, expect, it, vi } from "vitest";
import { REHEARSAL_FINISH_MIN_REPLIES } from "@/lib/practice-calls.server";

/**
 * The recap of a REHEARSAL call also writes the run's memory (rehearsal_runs), in the same finish. The learner's own
 * words never reach it, and a run under the finish rule writes nothing.
 */
const CALL = "00000000-0000-4000-8000-0000000000c1";
const REHEARSAL = "00000000-0000-4000-8000-0000000000d1";
const h = vi.hoisted(() => ({
  authorize: vi.fn(),
  generate: vi.fn(),
  rpcs: [] as { fn: string; args: Record<string, unknown> }[],
  callRow: null as unknown,
  brief: null as unknown,
  prevRuns: [] as unknown[],
  eqs: [] as [string, string, unknown][],
  claim: true,
  finishResult: 1,
  usage: [] as { event: string; detail: unknown; userId: unknown }[],
}));
vi.mock("@/lib/ops-events.server", () => ({
  OPS_EVENT_SUCCESS_PATH_TIMEOUT_MS: 500,
  recordOpsEvent: async (event: string, detail: unknown, userId: unknown) => {
    h.usage.push({ event, detail, userId });
  },
}));
vi.mock("@/lib/ai-consent.server", () => ({ authorizeAiRequest: h.authorize }));
vi.mock("@/lib/llm-chat-model.server", () => ({
  resolveLlmApiKey: () => "k",
  resolveLlmChatModel: () => "m",
}));
vi.mock("@/lib/ai-safety", () => ({
  makeBlockedTermCheck: () => async () => [],
  filterModelOutputs: async (t: string[]) => t.map(() => false),
}));
vi.mock("@/lib/call-recap.server", () => ({
  generateCallRecap: h.generate,
  issueRecapToken: () => "tok",
}));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: (table: string) => {
      const q: Record<string, unknown> = {};
      for (const n of ["select", "order", "limit"]) q[n] = () => q;
      q.eq = (col: string, val: unknown) => {
        h.eqs.push([table, col, val]);
        return q;
      };
      // The previous-runs read is awaited without maybeSingle.
      if (table === "rehearsal_runs")
        q.then = (resolve: (v: unknown) => void) => resolve({ data: h.prevRuns, error: null });
      q.maybeSingle = async () => ({ data: table === "rehearsals" ? h.brief : h.callRow });
      return q;
    },
    rpc: async (fn: string, args: Record<string, unknown>) => {
      h.rpcs.push({ fn, args });
      if (fn === "claim_call_recap") return { data: h.claim, error: null };
      if (fn === "finish_rehearsal_recap" || fn === "finish_call_recap")
        return { data: h.finishResult, error: null };
      return { data: 1, error: null };
    },
  },
}));

const { Route } = await import("./call-recap");
const POST = (
  Route.options.server!.handlers as unknown as {
    POST: (o: { request: Request }) => Promise<Response>;
  }
).POST;

const LEARNER_LINE = "my salary is 50k";
const msgs = [
  { role: "user", content: "hello" },
  { role: "assistant", content: "b" },
  { role: "user", content: LEARNER_LINE },
  { role: "user", content: "d" },
];
const call = () =>
  POST({
    request: new Request("https://x/api/call-recap", {
      method: "POST",
      headers: { Authorization: "Bearer t" },
      body: JSON.stringify({ callId: CALL, messages: msgs }),
    }),
  });

const LABELS = ["The salary question", "A misunderstanding", "Being interrupted"];
const generated = (over: Record<string, unknown> = {}) => ({
  corrections: [
    {
      said: LEARNER_LINE,
      fixed: "I would like to talk about the salary",
      why: "wording",
      topic: "word-order",
      wrong: ["x", "y"],
    },
    {
      said: "i am agree",
      fixed: "I agree with the 50k offer",
      why: "verb",
      topic: "articles",
      wrong: ["x", "y"],
    },
  ],
  phrase: null,
  moments: { shown: ["The salary question"], wentWell: [] },
  ...over,
});
const finishRpc = () => h.rpcs.find((r) => r.fn === "finish_rehearsal_recap");

beforeEach(() => {
  vi.clearAllMocks();
  h.rpcs = [];
  h.usage = [];
  h.prevRuns = [];
  h.eqs = [];
  h.claim = true;
  h.finishResult = 1;
  h.callRow = {
    course: "en",
    finished_at: "2026-11-26T10:00:00Z",
    recap_at: null,
    kind: "rehearsal",
    item_key: `${REHEARSAL}:conversation`,
    replies: 5,
  };
  h.brief = {
    brief: { hardMoments: LABELS.map((label, i) => ({ id: `m${i}`, label, prompt: "p" })) },
  };
  h.authorize.mockResolvedValue({ ok: true, userId: "u1", supabase: {} });
  h.generate.mockResolvedValue(generated());
});

describe("a finished rehearsal call writes its run memory with the recap", () => {
  it("calls finish_rehearsal_recap once, with labels and corrected forms only", async () => {
    await call();
    const fns = h.rpcs.map((r) => r.fn);
    expect(fns).toEqual(["claim_call_recap", "finish_rehearsal_recap"]);
    expect(finishRpc()!.args).toMatchObject({
      _call_id: CALL,
      _moments: ["The salary question"],
      _went_well: [],
      _corrections: ["I would like to talk about the salary"],
    });
  });

  it("the model is asked for moments from this rehearsal's own hard moments", async () => {
    await call();
    expect(h.generate.mock.calls[0]![0]).toMatchObject({ rehearsalLabels: LABELS });
  });

  it("the learner's own words appear nowhere in what is stored", async () => {
    await call();
    const stored = JSON.stringify([
      finishRpc()!.args._moments,
      finishRpc()!.args._went_well,
      finishRpc()!.args._corrections,
    ]);
    expect(stored).not.toContain(LEARNER_LINE);
    expect(stored).not.toContain("i am agree");
    // A corrected form carrying a number (the 50k) is dropped from the run memory.
    expect(stored).not.toContain("50k");
  });

  it("every array is capped at 5", async () => {
    const labels = ["a", "b", "c", "d", "e", "f", "g"];
    h.brief = {
      brief: { hardMoments: labels.map((label, i) => ({ id: `m${i}`, label, prompt: "p" })) },
    };
    h.generate.mockResolvedValue(
      generated({
        corrections: [],
        moments: { shown: labels, wentWell: labels },
      }),
    );
    await call();
    expect((finishRpc()!.args._moments as string[]).length).toBe(5);
    expect((finishRpc()!.args._went_well as string[]).length).toBe(5);
  });

  it("a retry (the claim held or the call already completed) writes nothing", async () => {
    h.claim = false;
    expect(await (await call()).json()).toEqual({ recap: null });
    expect(finishRpc()).toBeUndefined();
    h.claim = true;
    h.callRow = { ...(h.callRow as object), recap_at: "2026-11-26T11:00:00Z" };
    await call();
    expect(finishRpc()).toBeUndefined();
  });

  it("everyday memory still gets the corrections (the same finish carries them)", async () => {
    await call();
    expect(finishRpc()!.args).toMatchObject({
      _course: "en",
      _topics: ["word-order", "articles"],
      _save: true,
    });
    expect((finishRpc()!.args._mistakes as { text: string }[])[0]!.text).toBe(
      "I would like to talk about the salary",
    );
  });
});

describe("numbers never reach everyday memory from a rehearsal", () => {
  it("a corrected form with a number is not in the memory lines (the 50k offer)", async () => {
    await call();
    const texts = (finishRpc()!.args._mistakes as { text: string }[]).map((m) => m.text);
    expect(texts).toEqual(["I would like to talk about the salary"]);
    expect(JSON.stringify(finishRpc()!.args)).not.toContain("50k");
  });

  it("other call kinds are unchanged: the same correction is kept for a scenario call", async () => {
    h.callRow = {
      course: "en",
      finished_at: "x",
      recap_at: null,
      kind: "scenario",
      item_key: "coffee",
      replies: 3,
    };
    await call();
    const finish = h.rpcs.find((r) => r.fn === "finish_call_recap")!;
    expect((finish.args._mistakes as { text: string }[]).map((m) => m.text)).toContain(
      "I agree with the 50k offer",
    );
  });
});

describe("a run under the finish rule is no run", () => {
  it("fewer replies than the rule: no AI call, no finish, no run row", async () => {
    h.callRow = { ...(h.callRow as object), replies: 3 };
    expect(await (await call()).json()).toEqual({ recap: null });
    expect(h.generate).not.toHaveBeenCalled();
    expect(h.rpcs).toEqual([]);
  });

  it("the database refusing the run (-2) releases the claim and shows nothing", async () => {
    h.finishResult = -2;
    expect(await (await call()).json()).toEqual({ recap: null });
    expect(h.rpcs.map((r) => r.fn)).toEqual([
      "claim_call_recap",
      "finish_rehearsal_recap",
      "release_call_recap",
    ]);
  });
});

describe("other calls are untouched", () => {
  it("a scenario call still finishes through finish_call_recap, with no rehearsal arguments", async () => {
    h.callRow = {
      course: "en",
      finished_at: "x",
      recap_at: null,
      kind: "scenario",
      item_key: "coffee",
      replies: 3,
    };
    await call();
    expect(h.rpcs.map((r) => r.fn)).toEqual(["claim_call_recap", "finish_call_recap"]);
    expect(h.generate.mock.calls[0]![0]).not.toHaveProperty("rehearsalLabels");
  });
});

describe("the finish floor is one number", () => {
  it("the database is told the floor the server checked with, never a second copy", async () => {
    await call();
    expect(finishRpc()!.args._min_replies).toBe(REHEARSAL_FINISH_MIN_REPLIES);
  });

  it("a call exactly at the floor is a run; one under it is not (both sides of the same number)", async () => {
    h.callRow = { ...(h.callRow as object), replies: REHEARSAL_FINISH_MIN_REPLIES };
    await call();
    expect(finishRpc()).toBeDefined();
    h.rpcs = [];
    h.callRow = { ...(h.callRow as object), replies: REHEARSAL_FINISH_MIN_REPLIES - 1 };
    await call();
    expect(finishRpc()).toBeUndefined();
  });
});

describe("usage: a finished stage counts once, with its stage and nothing else", () => {
  it("counts the stage of a run that was written", async () => {
    await call();
    expect(h.usage).toEqual([
      { event: "rehearsal_stage_finished", detail: { stage: "conversation" }, userId: null },
    ]);
    expect(JSON.stringify(h.usage)).not.toMatch(/salary|50k/);
  });

  it("counts nothing when the database refused the run, the claim was held, or the call is not a rehearsal's", async () => {
    h.finishResult = -2;
    await call();
    h.finishResult = -1;
    await call();
    h.finishResult = 1;
    h.claim = false;
    await call();
    h.claim = true;
    h.callRow = { ...(h.callRow as object), kind: "scenario", item_key: "coffee" };
    await call();
    expect(h.usage).toEqual([]);
  });
});

describe("How you spoke: numbers only, from the run just written", () => {
  const KEY = ["I have experience in", "Could you repeat that, please?", "Je voudrais un café"];
  const turns = (...learner: string[]) =>
    learner.flatMap((t) => [
      { role: "user", content: t },
      { role: "assistant", content: "ok" },
    ]);
  const callWith = (learner: string[]) =>
    POST({
      request: new Request("https://x/api/call-recap", {
        method: "POST",
        headers: { Authorization: "Bearer t" },
        body: JSON.stringify({ callId: CALL, messages: turns(...learner) }),
      }),
    });
  const L = ["hello", "I have experience in sales", "yes", "could you repeat that please", "ok"];
  beforeEach(() => {
    h.callRow = { ...(h.callRow as object), replies: 5, short_replies: 2, english_replies: 1 };
    h.brief = {
      brief: {
        hardMoments: LABELS.map((label, i) => ({ id: `m${i}`, label, prompt: "p" })),
        keyPhrases: KEY,
      },
    };
  });

  it("passes only the key-phrase COUNT to the database, never a phrase", async () => {
    await callWith(L);
    expect(finishRpc()!.args).toMatchObject({ _key_phrases_used: 2, _key_phrases_total: 3 });
    expect(JSON.stringify(finishRpc()!.args)).not.toMatch(/experience|repeat/i);
  });

  it("matches a key phrase typed without its accent", async () => {
    await callWith(["je voudrais un cafe", "a", "b", "c", "d"]);
    expect(finishRpc()!.args._key_phrases_used).toBe(1);
  });

  it("a brief with no key phrases sends no pair and leaves that note out", async () => {
    h.brief = { brief: { hardMoments: [] } };
    const body = await (await callWith(L)).json();
    expect(finishRpc()!.args).not.toHaveProperty("_key_phrases_total");
    expect(body.rehearsalSpeaking.notes.map((n: { kind: string }) => n.kind)).toEqual([
      "full_replies",
      "english_fallback",
    ]);
  });

  it("answers rehearsalSpeaking: counts from the call row, previous = the same stage's last run", async () => {
    h.prevRuns = [
      // This call's own run is in the list and is never "previous".
      { practice_call_id: CALL, speaking_full: 3, speaking_english: 1, key_phrases_used: 2 },
      { practice_call_id: "p1", speaking_full: 1, speaking_english: 3, key_phrases_used: 0 },
    ];
    const body = await (await callWith(L)).json();
    expect(body.rehearsalSpeaking).toEqual({
      notes: [
        { kind: "full_replies", count: 3, total: 5, previous: 1 },
        { kind: "key_phrases", count: 2, total: 3, previous: 0 },
        { kind: "english_fallback", count: 1, total: 5, previous: 3 },
      ],
    });
  });

  it("asks for the previous run of THIS rehearsal and THIS stage, for this learner", async () => {
    await callWith(L);
    expect(h.eqs.filter((e) => e[0] === "rehearsal_runs")).toEqual([
      ["rehearsal_runs", "user_id", "u1"],
      ["rehearsal_runs", "rehearsal_id", REHEARSAL],
      ["rehearsal_runs", "stage", "conversation"],
    ]);
  });

  it("with no earlier run there is no previous", async () => {
    const body = await (await callWith(L)).json();
    expect(
      body.rehearsalSpeaking.notes.every((n: { previous: unknown }) => n.previous === null),
    ).toBe(true);
  });

  it("holds at most 3 notes, the first positive", async () => {
    h.prevRuns = [
      { practice_call_id: "p1", speaking_full: 0, speaking_english: 0, key_phrases_used: 0 },
    ];
    const body = await (await callWith(L)).json();
    expect(body.rehearsalSpeaking.notes.length).toBeLessThanOrEqual(3);
    expect(body.rehearsalSpeaking.notes[0].kind).toBe("full_replies");
  });

  it("is still sent when the recap itself has nothing to show", async () => {
    h.generate.mockResolvedValue(generated({ corrections: [], phrase: null }));
    const body = await (await callWith(L)).json();
    expect(body.recap).toBeNull();
    expect(body.rehearsalSpeaking.notes.length).toBeGreaterThan(0);
  });

  it("is ABSENT for a scenario call, a run under the floor, and a run the database refused", async () => {
    h.callRow = { ...(h.callRow as object), kind: "scenario", item_key: "coffee" };
    expect(await (await callWith(L)).json()).not.toHaveProperty("rehearsalSpeaking");
    h.callRow = {
      ...(h.callRow as object),
      kind: "rehearsal",
      item_key: `${REHEARSAL}:conversation`,
      replies: 3,
    };
    expect(await (await callWith(L)).json()).not.toHaveProperty("rehearsalSpeaking");
    h.callRow = { ...(h.callRow as object), replies: 5 };
    h.finishResult = -2;
    expect(await (await callWith(L)).json()).not.toHaveProperty("rehearsalSpeaking");
  });

  it("a failed read of the previous run only loses the comparison", async () => {
    h.prevRuns = "not a list" as unknown as unknown[];
    const body = await (await callWith(L)).json();
    expect(body.rehearsalSpeaking.notes.length).toBeGreaterThan(0);
  });
});
