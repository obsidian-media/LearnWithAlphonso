import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Recap } from "./call-recap";

const llm = vi.hoisted(() => ({ calls: [] as unknown[], reply: "" }));
vi.mock("./llm-chat.server", () => ({
  llmChatCompletion: async (args: unknown) => {
    llm.calls.push(args);
    return Response.json({ choices: [{ message: { content: llm.reply } }] });
  },
}));

process.env.LESSON_SESSION_SECRET = "test-secret";
const {
  addRecapToReview,
  generateCallRecap,
  issueRecapToken,
  loadAlphonsoPriming,
  recapItemKey,
  verifyRecapToken,
} = await import("./call-recap.server");

const CALL = "00000000-0000-4000-8000-0000000000c1";
const recap: Recap = {
  corrections: [
    {
      said: "Soy cansado",
      fixed: "Estoy cansado",
      why: "estar",
      topic: "ser-estar",
      wrong: ["Estoy cansada", "Soy cansada"],
    },
  ],
  phrase: { text: "¿Me trae la cuenta?", meaning: "Bring me the bill", wrong: ["a", "b", "c"] },
};

describe("generateCallRecap", () => {
  beforeEach(() => {
    llm.calls = [];
  });
  it("tracks the call as kind 'recap' and keeps the transcript out of the system message", async () => {
    llm.reply = JSON.stringify({ corrections: recap.corrections, phrase: null });
    const turns = [{ role: "user" as const, content: "Soy cansado" }];
    const out = await generateCallRecap({
      apiKey: "k",
      model: "m",
      userId: "u1",
      course: "es",
      turns,
    });
    expect(out?.corrections).toHaveLength(1);
    const sent = llm.calls[0] as {
      track: unknown;
      body: { max_tokens: number; messages: { role: string; content: string }[] };
    };
    expect(sent.track).toEqual({ userId: "u1", kind: "recap" });
    expect(sent.body.max_tokens).toBe(500);
    expect(sent.body.messages[0]!.content).not.toContain("Soy cansado");
    expect(sent.body.messages[1]!.content).toContain("Soy cansado");
  });
  it("is null when the model's reply is not JSON", async () => {
    llm.reply = "no";
    expect(
      await generateCallRecap({ apiKey: "k", model: "m", userId: "u1", course: "es", turns: [] }),
    ).toBeNull();
  });
});

describe("the Review these token", () => {
  const token = () => issueRecapToken("u1", CALL, "es", recap);
  it("verifies for the same learner and call, and carries the recap", () => {
    expect(verifyRecapToken(token(), "u1", CALL)).toEqual({ course: "es", recap });
  });
  it("is refused for another learner, another call, a tampered body, junk or an old token", () => {
    expect(verifyRecapToken(token(), "u2", CALL)).toBeNull();
    expect(verifyRecapToken(token(), "u1", "00000000-0000-4000-8000-0000000000c2")).toBeNull();
    const [p, s] = token().split(".");
    const forged = Buffer.from(
      JSON.stringify({
        u: "u1",
        c: CALL,
        k: "es",
        r: { corrections: [], phrase: { text: "x", meaning: "y", wrong: ["a", "b", "c"] } },
        iat: Date.now(),
      }),
    ).toString("base64url");
    expect(verifyRecapToken(`${forged}.${s}`, "u1", CALL)).toBeNull();
    expect(verifyRecapToken(`${p}.x`, "u1", CALL)).toBeNull();
    expect(verifyRecapToken(undefined, "u1", CALL)).toBeNull();
    expect(verifyRecapToken("junk", "u1", CALL)).toBeNull();
    expect(verifyRecapToken(token(), "u1", CALL, Date.now() + 25 * 3600_000)).toBeNull();
  });
});

describe("addRecapToReview", () => {
  const make = () => {
    const upserts: { rows: Record<string, unknown>[]; opts: unknown }[] = [];
    const rpcs: { fn: string; args: Record<string, unknown> }[] = [];
    return {
      upserts,
      rpcs,
      db: {
        from: () => ({
          upsert: async (rows: Record<string, unknown>[], opts: unknown) => {
            upserts.push({ rows, opts });
            return { error: null };
          },
        }),
        rpc: async (fn: string, args: Record<string, unknown>) => {
          rpcs.push({ fn, args });
          return { data: true, error: null };
        },
      },
    };
  };
  const run = (db: unknown, remember: boolean) =>
    addRecapToReview(db as never, { userId: "u1", callId: CALL, course: "es", recap, remember });

  it("writes the rows at the learner's level in the course, not at A1", async () => {
    const m = make();
    await addRecapToReview(m.db as never, {
      userId: "u1",
      callId: CALL,
      course: "es",
      recap,
      remember: false,
      level: "B1",
    });
    expect(m.upserts[0]!.rows.map((r) => r.level)).toEqual(["B1", "B1"]);
  });

  it("writes one row per item with stable keys, ignoring duplicates so a second tap adds nothing", async () => {
    const m = make();
    expect(await run(m.db, false)).toEqual({ added: 2 });
    const { rows, opts } = m.upserts[0]!;
    expect(opts).toEqual({ onConflict: "user_id,item_key,language", ignoreDuplicates: true });
    expect(rows.map((r) => r.item_key)).toEqual([recapItemKey(CALL, 0), recapItemKey(CALL, 3)]);
    expect(rows.every((r) => r.user_id === "u1" && r.language === "es")).toBe(true);
    expect(rows[0]).toMatchObject({ source: "weakness", weakness_label: "ser-estar" });
    expect(rows[1]).toMatchObject({ source: "saved_word", saved_word: "¿Me trae la cuenta?" });
    expect(recapItemKey(CALL, 0)).toBe(recapItemKey(CALL, 0));
    expect(recapItemKey(CALL, 0)).toMatch(/^recap:[0-9a-f]{16}$/);
  });

  it("keeps the phrase in memory only when asked (Pro)", async () => {
    const free = make();
    await run(free.db, false);
    expect(free.rpcs).toEqual([]);
    const pro = make();
    await run(pro.db, true);
    expect(pro.rpcs).toHaveLength(1);
    expect(pro.rpcs[0]!.fn).toBe("remember_recap_phrase");
    expect(pro.rpcs[0]!.args).toMatchObject({ _user_id: "u1", _review_key: recapItemKey(CALL, 3) });
  });

  it("reports a failed insert and keeps nothing in memory", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const m = make();
    (m.db as { from: unknown }).from = () => ({
      upsert: async () => ({ error: { message: "boom" } }),
    });
    expect(await run(m.db, true)).toEqual({ error: true });
    expect(m.rpcs).toEqual([]);
  });
});

describe("loadAlphonsoPriming", () => {
  const dbWith = (keys: string[]) => {
    const q: Record<string, unknown> = {};
    for (const n of ["select", "eq", "order"]) q[n] = () => q;
    q.limit = async () => ({ data: keys.map((memory_key) => ({ memory_key })) });
    return { from: () => q };
  };
  it("primes any learner with labels from their memory, Pro or not", async () => {
    const m = await loadAlphonsoPriming(dbWith(["ser-estar"]), "u1", "es");
    expect(m?.content).toContain("Ser or estar");
  });
  it("is null when there is no memory", async () => {
    expect(await loadAlphonsoPriming(dbWith([]), "u1", "es")).toBeNull();
  });
  it("is null when the read throws", async () => {
    const db = {
      from: () => {
        throw new Error("down");
      },
    };
    expect(await loadAlphonsoPriming(db, "u1", "es")).toBeNull();
  });
});
