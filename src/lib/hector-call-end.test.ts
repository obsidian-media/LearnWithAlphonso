import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ userId: "u1" as string | null | "throw" }));
vi.mock("./auth-headers", () => ({
  authHeaders: async () => ({ Authorization: "Bearer t" }),
  currentUserId: async () => {
    if (auth.userId === "throw") throw new Error("session unavailable");
    return auth.userId;
  },
}));

const {
  createHectorCallEnd,
  retryPendingHectorCallEnds,
  forgetHectorCallEndsOnAuthChange,
  PENDING_KEY,
  MAX_ATTEMPTS,
  MAX_AGE_MS,
} = await import("./hector-call-end");

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  auth.userId = "u1";
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
  });
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

const turns = [
  { role: "assistant" as const, content: "Hola" },
  { role: "user" as const, content: "Soy cansado" },
  { role: "assistant" as const, content: "¿Por qué?" },
  { role: "user" as const, content: "Trabajo" },
  { role: "assistant" as const, content: "Ah" },
  { role: "user" as const, content: "Sí" },
];
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const pending = () =>
  JSON.parse(store.get(PENDING_KEY) ?? "[]") as { callId: string; attempts: number }[];
const newEnd = (fetchImpl: typeof fetch) =>
  createHectorCallEnd({
    callId: "call-1",
    course: "es",
    getTurns: () => turns,
    getCefr: () => "A2",
    fetchImpl,
  });

describe("a failed Hector call save is kept and retried with the same call id", () => {
  it("a network failure then a success saves once, under one call id", async () => {
    const ids: string[] = [];
    let n = 0;
    const f = (async (_u: string, init: RequestInit) => {
      ids.push(JSON.parse(String(init.body)).callId);
      if (n++ === 0) throw new TypeError("offline");
      return json({ saved: true, lines: 1 });
    }) as unknown as typeof fetch;
    expect(await newEnd(f)()).toBe(false);
    expect(pending()).toHaveLength(1);
    await retryPendingHectorCallEnds(f);
    expect(ids).toEqual(["call-1", "call-1"]);
    expect(pending()).toHaveLength(0);
    await retryPendingHectorCallEnds(f);
    expect(ids).toHaveLength(2);
  });

  it.each([
    ["write_failed", { saved: false, reason: "write_failed" }, 200],
    ["no_recap", { saved: false, reason: "no_recap" }, 200],
    ["a 5xx", { error: "claim_failed" }, 503],
    ["a 401", { error: "unauthorized" }, 401],
  ])("%s keeps the receipt, and the next visit sends it again", async (_n, body, status) => {
    const f = vi.fn(async () => json(body, status)) as unknown as typeof fetch;
    await newEnd(f)();
    expect(pending()).toHaveLength(1);
    await retryPendingHectorCallEnds(f);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["saved", { saved: true, lines: 1 }],
    ["already_saved", { saved: false, reason: "already_saved" }],
    ["short_call", { saved: false, reason: "short_call" }],
    ["not_pro", { saved: false, reason: "not_pro" }],
    ["nothing_to_keep", { saved: false, reason: "nothing_to_keep" }],
  ])("%s is final: nothing is kept and nothing is retried", async (_n, body) => {
    const f = vi.fn(async () => json(body)) as unknown as typeof fetch;
    await newEnd(f)();
    expect(pending()).toHaveLength(0);
    await retryPendingHectorCallEnds(f);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("stops after the attempt limit", async () => {
    const f = vi.fn(async () =>
      json({ saved: false, reason: "no_recap" }),
    ) as unknown as typeof fetch;
    await newEnd(f)();
    for (let i = 0; i < MAX_ATTEMPTS + 2; i++) await retryPendingHectorCallEnds(f);
    expect(f).toHaveBeenCalledTimes(MAX_ATTEMPTS);
    expect(pending()).toHaveLength(0);
  });

  it("keeps a receipt for 24 hours, not longer", () => {
    expect(MAX_AGE_MS).toBe(24 * 60 * 60 * 1000);
  });

  it("drops a receipt older than 24 hours without sending it", async () => {
    const f = vi.fn(async () =>
      json({ saved: false, reason: "no_recap" }),
    ) as unknown as typeof fetch;
    await newEnd(f)();
    const [r] = JSON.parse(store.get(PENDING_KEY)!);
    r.createdAt = Date.now() - MAX_AGE_MS - 1000;
    store.set(PENDING_KEY, JSON.stringify([r]));
    await retryPendingHectorCallEnds(f);
    expect(f).toHaveBeenCalledTimes(1);
    expect(pending()).toHaveLength(0);
  });

  it("stores no receipt when the account cannot be told (never an empty user id), and still sends once", async () => {
    auth.userId = "throw";
    const f = vi.fn(async () =>
      json({ saved: false, reason: "no_recap" }),
    ) as unknown as typeof fetch;
    await newEnd(f)();
    expect(f).toHaveBeenCalledTimes(1);
    expect(store.get(PENDING_KEY)).toBeUndefined();
    auth.userId = null;
    await createHectorCallEnd({
      callId: "call-2",
      course: "es",
      getTurns: () => turns,
      getCefr: () => "",
      fetchImpl: f,
    })();
    expect(store.get(PENDING_KEY)).toBeUndefined();
  });

  it("sign-out wipes every receipt, and so does another account signing in", async () => {
    const f = vi.fn(async () =>
      json({ saved: false, reason: "no_recap" }),
    ) as unknown as typeof fetch;
    await newEnd(f)();
    expect(pending()).toHaveLength(1);
    forgetHectorCallEndsOnAuthChange("SIGNED_IN", "u1", "u1"); // a tab regaining focus: same account
    forgetHectorCallEndsOnAuthChange("USER_UPDATED", "u1", "u1");
    expect(pending()).toHaveLength(1);
    forgetHectorCallEndsOnAuthChange("SIGNED_OUT", undefined, "u1");
    expect(store.get(PENDING_KEY)).toBeUndefined();

    await newEnd(f)();
    expect(pending()).toHaveLength(1);
    forgetHectorCallEndsOnAuthChange("SIGNED_IN", "u2", "u1");
    expect(store.get(PENDING_KEY)).toBeUndefined();
  });

  it("another account's receipt is dropped, not sent, when this account retries", async () => {
    const f = vi.fn(async () =>
      json({ saved: false, reason: "no_recap" }),
    ) as unknown as typeof fetch;
    await newEnd(f)();
    auth.userId = "u2";
    await retryPendingHectorCallEnds(f);
    expect(f).toHaveBeenCalledTimes(1);
    expect(store.get(PENDING_KEY)).toBeUndefined();
  });

  it("in_progress (another request holds the call) is retried later", async () => {
    const f = vi.fn(async () =>
      json({ saved: false, reason: "in_progress" }),
    ) as unknown as typeof fetch;
    await newEnd(f)();
    expect(pending()).toHaveLength(1);
  });
});
