import { afterEach, describe, expect, it, vi } from "vitest";
import {
  COST_LOG_TIMEOUT_MS,
  recordAiCost,
  recordLlmCost,
  resetCostLogWarnings,
  scheduleBackground,
  type CostLogDb,
} from "./ai-cost-log.server";
import { llmChatCompletion } from "./llm-chat.server";
import { ttsEntry } from "./ai-cost";

const entry = ttsEntry({ userId: "u1" }, "aura-2-saturn-en", 100, false);

function db(result: () => unknown): { db: CostLogDb; rows: unknown[] } {
  const rows: unknown[] = [];
  return {
    rows,
    db: {
      from: () => ({
        insert: (row: unknown) => {
          rows.push(row);
          return result() as never;
        },
      }),
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  resetCostLogWarnings();
});

describe("the cost log never fails or blocks a request", () => {
  it("writes one row", async () => {
    const d = db(() => Promise.resolve({ error: null }));
    await recordAiCost(entry, d.db);
    expect(d.rows).toHaveLength(1);
    expect(d.rows[0]).toMatchObject({
      user_id: "u1",
      kind: "tts",
      vendor: "deepgram",
      tts_chars: 100,
    });
  });

  it("resolves (does not reject) when the database returns an error", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const d = db(() => Promise.resolve({ error: { message: "boom", code: "XX000" } }));
    await expect(recordAiCost(entry, d.db)).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalled();
  });

  it("resolves when the insert itself throws or rejects", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const thrower: CostLogDb = {
      from: () => {
        throw new Error("no client");
      },
    };
    await expect(recordAiCost(entry, thrower)).resolves.toBeUndefined();
    const rejecter = db(() => Promise.reject(new Error("network")));
    await expect(recordAiCost(entry, rejecter.db)).resolves.toBeUndefined();
  });

  it("gives up on a write that hangs, after the bound", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const d = db(() => new Promise(() => {}));
    const p = recordAiCost(entry, d.db);
    await vi.advanceTimersByTimeAsync(COST_LOG_TIMEOUT_MS + 10);
    await expect(p).resolves.toBeUndefined();
  });

  it("a table that is not deployed yet is warned about once, not per call", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const d = db(() => Promise.resolve({ error: { message: "missing", code: "PGRST205" } }));
    await recordAiCost(entry, d.db);
    await recordAiCost(entry, d.db);
    await recordAiCost(entry, d.db);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("a constraint error is NOT mistaken for 'not deployed' and is reported every time", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const d = db(() =>
      Promise.resolve({
        error: { message: "violates check constraint ai_cost_log_kind_check", code: "23514" },
      }),
    );
    await recordAiCost(entry, d.db);
    await recordAiCost(entry, d.db);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("scheduleBackground never throws, even for a rejecting promise or a broken request context", () => {
    expect(() => scheduleBackground(Promise.reject(new Error("x")))).not.toThrow();
    const sym = Symbol.for("@vercel/request-context");
    (globalThis as Record<symbol, unknown>)[sym] = {
      get: () => {
        throw new Error("no context");
      },
    };
    expect(() => scheduleBackground(Promise.resolve())).not.toThrow();
    delete (globalThis as Record<symbol, unknown>)[sym];
  });

  it("scheduleBackground hands the work to the platform's waitUntil when there is one", () => {
    const waitUntil = vi.fn();
    const sym = Symbol.for("@vercel/request-context");
    (globalThis as Record<symbol, unknown>)[sym] = { get: () => ({ waitUntil }) };
    scheduleBackground(Promise.resolve());
    delete (globalThis as Record<symbol, unknown>)[sym];
    expect(waitUntil).toHaveBeenCalledTimes(1);
  });
});

describe("a chat call is measured without being touched", () => {
  const body = {
    model: "anthropic/claude-haiku-5.5",
    choices: [{ message: { content: "hola" } }],
    usage: { prompt_tokens: 100, completion_tokens: 20, cost: 0.0001 },
  };
  const ok = () =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });

  it("recordLlmCost writes the usage of a copy", async () => {
    const d = db(() => Promise.resolve({ error: null }));
    await recordLlmCost(ok(), { userId: "u1", kind: "chat" }, "m", d.db);
    expect(d.rows[0]).toMatchObject({
      kind: "chat",
      input_tokens: 100,
      output_tokens: 20,
      cost_micro_usd: 100,
    });
  });

  it("recordLlmCost swallows an unreadable body", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const d = db(() => Promise.resolve({ error: null }));
    await expect(
      recordLlmCost(new Response("not json"), { userId: "u1", kind: "chat" }, "m", d.db),
    ).resolves.toBeUndefined();
    expect(d.rows).toHaveLength(0);
  });

  it("llmChatCompletion with track still returns a fully readable reply, and asks for usage", async () => {
    let sent: Record<string, unknown> = {};
    const fetchImpl = ((_u: string, init?: RequestInit) => {
      sent = JSON.parse(String(init?.body));
      return Promise.resolve(ok());
    }) as typeof fetch;
    const res = await llmChatCompletion({
      apiKey: "k",
      body: { model: "anthropic/claude-haiku-5.5", messages: [{ role: "user", content: "hi" }] },
      track: { userId: "u1", kind: "chat" },
      fetchImpl,
    });
    expect(sent.usage).toEqual({ include: true });
    expect(await res.json()).toEqual(body);
  });

  it("a tracking failure cannot change the reply (db write throws)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchImpl = (() => Promise.resolve(ok())) as typeof fetch;
    const res = await llmChatCompletion({
      apiKey: "k",
      body: { model: "m", messages: [{ role: "user", content: "hi" }] },
      track: { userId: "u1", kind: "chat" },
      fetchImpl,
    });
    expect(res.status).toBe(200);
    expect((await res.json()).choices[0].message.content).toBe("hola");
  });

  it("without track nothing is measured (authoring calls)", async () => {
    const fetchImpl = (() => Promise.resolve(ok())) as typeof fetch;
    const res = await llmChatCompletion({
      apiKey: "k",
      body: { model: "m", messages: [{ role: "user", content: "hi" }] },
      fetchImpl,
    });
    expect(res.status).toBe(200);
  });
});
