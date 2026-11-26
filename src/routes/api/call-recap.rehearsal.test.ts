import { beforeEach, describe, expect, it, vi } from "vitest";

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
  claim: true,
  finishResult: 1,
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
      for (const n of ["select", "eq"]) q[n] = () => q;
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

describe("a run under the finish rule is no run (review focus 5)", () => {
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
