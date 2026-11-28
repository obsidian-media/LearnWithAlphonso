import { describe, expect, it, vi } from "vitest";
import { fallbackBrief } from "./rehearsal-brief";

vi.mock("./ops-events.server", () => ({
  OPS_EVENT_SUCCESS_PATH_TIMEOUT_MS: 500,
  recordOpsEvent: async () => {},
}));
const { resolveRehearsalChat } = await import("./rehearsal-chat.server");

const REHEARSAL = "00000000-0000-4000-8000-0000000000d1";
const CALL = "00000000-0000-4000-8000-0000000000c1";

function fakeDb(
  opts: { callExists?: boolean; call?: { persona: string; hard_mode: boolean } } = {},
) {
  const reads: string[] = [];
  const db = {
    from: (table: string) => {
      reads.push(table);
      const q: Record<string, unknown> = {};
      const resolve = () => {
        if (table === "rehearsals")
          return {
            data: {
              id: REHEARSAL,
              user_id: "u1",
              course: "en",
              event_kind: "interview",
              event_date: null,
              created_at: new Date().toISOString(),
              status: "active",
              free: false,
              brief: fallbackBrief("interview", "en"),
            },
            error: null,
          };
        if (table === "rehearsal_runs") return { data: [], error: null };
        if (table === "practice_calls")
          return {
            data: opts.call
              ? { id: CALL, ...opts.call }
              : opts.callExists
                ? { id: CALL, persona: "alphonso", hard_mode: false }
                : null,
            error: null,
          };
        return { data: null, error: null };
      };
      for (const m of ["select", "eq", "order"]) q[m] = () => q;
      q.maybeSingle = async () => resolve();
      q.then = (ok: (v: unknown) => unknown) => Promise.resolve(resolve()).then(ok);
      return q;
    },
  };
  return { db: db as never, reads };
}

const ask = (
  db: never,
  extra: Record<string, unknown> = {},
  rehearsal: Record<string, unknown> = {},
) =>
  resolveRehearsalChat(db, {
    userId: "u1",
    rehearsal: { id: REHEARSAL, stage: "conversation", ...rehearsal },
    callId: CALL,
    ...extra,
  });
const HECTOR = { persona: "hector" };
const HARD = { stage: "hard_moments", persona: "hector", hardMode: true };
const errorOf = async (r: Awaited<ReturnType<typeof ask>>) => {
  expect(r.ok).toBe(false);
  if (r.ok) throw new Error("unreachable");
  return { status: r.response.status, body: await r.response.json() };
};

describe("a run that needs Pro checks Pro once, when it starts", () => {
  it("an Alphonso run never reads the Pro state (no RevenueCat call per turn)", async () => {
    const proState = vi.fn();
    const { db } = fakeDb();
    expect((await ask(db, { proState })).ok).toBe(true);
    expect((await ask(db, { proState }, { persona: "alphonso" })).ok).toBe(true);
    expect((await ask(db, { proState }, { persona: "alphonso", hardMode: false })).ok).toBe(true);
    expect(proState).not.toHaveBeenCalled();
  });

  it("a Hector run's first turn reads Pro once: Pro starts, a non-Pro learner gets 402 pro_required", async () => {
    const proState = vi.fn().mockResolvedValue("active");
    const { db } = fakeDb();
    expect((await ask(db, { proState }, HECTOR)).ok).toBe(true);
    expect(proState).toHaveBeenCalledTimes(1);

    proState.mockResolvedValue("inactive");
    expect(await errorOf(await ask(db, { proState }, HECTOR))).toEqual({
      status: 402,
      body: { error: "pro_required" },
    });
    expect(await errorOf(await ask(db, { proState }, HARD))).toEqual({
      status: 402,
      body: { error: "pro_required" },
    });
  });

  it("an unreadable Pro state is a retry, never a start", async () => {
    const { db } = fakeDb();
    for (const proState of [
      async () => "unavailable" as const,
      async () => Promise.reject(new Error("x")),
    ]) {
      expect((await errorOf(await ask(db, { proState }, HECTOR))).status).toBe(503);
    }
  });

  it("a later turn of a run already started is never checked again: an in-progress call finishes after a lapse", async () => {
    const proState = vi.fn().mockResolvedValue("inactive");
    const { db } = fakeDb({ call: { persona: "hector", hard_mode: false } });
    const r = await ask(db, { proState }, HECTOR);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.run).toEqual({ persona: "hector", hard: false });
    expect(proState).not.toHaveBeenCalled();
  });
});

describe("the mode belongs to the call", () => {
  it("an Alphonso call cannot be turned into a Hector call on a later turn (no Pro read, still Alphonso)", async () => {
    const proState = vi.fn().mockResolvedValue("inactive");
    const { db } = fakeDb({ callExists: true });
    const r = await ask(db, { proState }, HECTOR);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.run).toEqual({ persona: "alphonso", hard: false });
      expect(r.firstTurn).toBe(false);
      expect(r.prompt).not.toContain("Hector");
    }
    expect(proState).not.toHaveBeenCalled();
  });

  it("a Hector call keeps its hard mode and its prompt on later turns, whatever the request says", async () => {
    const { db } = fakeDb({ call: { persona: "hector", hard_mode: true } });
    const later = await ask(db, {}, HARD);
    expect(later.ok).toBe(true);
    if (later.ok) {
      expect(later.run).toEqual({ persona: "hector", hard: true });
      expect(later.prompt).toContain("Hard mode");
    }
  });

  it("a first turn reports firstTurn so the mode is stored with the first reply", async () => {
    const { db } = fakeDb();
    const r = await ask(db, { proState: async () => "active" as const }, HECTOR);
    expect(r.ok && r.firstTurn).toBe(true);
    expect(r.ok && r.run).toEqual({ persona: "hector", hard: false });
  });
});

describe("what a request may ask for", () => {
  const pro = { proState: async () => "active" as const };

  it("hard mode is Hector on the last stage only", async () => {
    const { db } = fakeDb();
    const ok = await ask(db, pro, HARD);
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.prompt).toContain("Hard mode");
    for (const bad of [
      { stage: "hard_moments", hardMode: true },
      { stage: "hard_moments", persona: "alphonso", hardMode: true },
      { stage: "conversation", persona: "hector", hardMode: true },
      { stage: "warmup", persona: "hector", hardMode: true },
    ]) {
      expect(await errorOf(await ask(db, pro, bad))).toEqual({
        status: 400,
        body: { error: "invalid_mode" },
      });
    }
  });

  it("an unknown persona or a non-boolean hard mode is invalid, and nothing reads Pro", async () => {
    const proState = vi.fn();
    const { db } = fakeDb();
    for (const bad of [{ persona: "zed" }, { persona: 3 }, { hardMode: "yes" }, { hardMode: 1 }]) {
      expect(await errorOf(await ask(db, { proState }, bad))).toEqual({
        status: 400,
        body: { error: "invalid_rehearsal" },
      });
    }
    expect(proState).not.toHaveBeenCalled();
  });

  it("an Alphonso run is the same prompt as before Hector existed, at the normal level", async () => {
    const { db } = fakeDb();
    const plain = await ask(db);
    const named = await ask(db, {}, { persona: "alphonso", hardMode: false });
    expect(plain.ok && named.ok).toBe(true);
    if (plain.ok && named.ok) {
      expect(named.prompt).toBe(plain.prompt);
      expect(plain.prompt).not.toContain("Hector");
      expect(plain.prompt).not.toContain("Hard mode");
      expect(plain.run).toEqual({ persona: "alphonso", hard: false });
    }
  });

  it("a Hector run uses Hector's prompt, with the same AI-honesty rule", async () => {
    const { db } = fakeDb();
    const r = await ask(db, pro, HECTOR);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.prompt).toContain("You are Hector, an AI tutor");
      expect(r.prompt).toContain("an AI practice partner");
      expect(r.prompt).not.toContain("Hard mode");
    }
  });
});
