import { describe, expect, it, vi } from "vitest";
import { fallbackBrief } from "./rehearsal-brief";

vi.mock("./ops-events.server", () => ({
  OPS_EVENT_SUCCESS_PATH_TIMEOUT_MS: 500,
  recordOpsEvent: async () => {},
}));
const { resolveRehearsalChat } = await import("./rehearsal-chat.server");

const REHEARSAL = "00000000-0000-4000-8000-0000000000d1";
const CALL = "00000000-0000-4000-8000-0000000000c1";

function fakeDb(opts: { callExists?: boolean } = {}) {
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
          return { data: opts.callExists ? { id: CALL } : null, error: null };
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

const ask = (db: never, extra: Record<string, unknown> = {}) =>
  resolveRehearsalChat(db, {
    userId: "u1",
    rehearsal: { id: REHEARSAL, stage: "conversation" },
    callId: CALL,
    ...extra,
  });

describe("a run that needs Pro checks Pro once, when it starts", () => {
  it("a run that needs no Pro never reads the Pro state (no RevenueCat call per turn)", async () => {
    const proState = vi.fn();
    const { db } = fakeDb();
    expect((await ask(db, { run: {}, proState })).ok).toBe(true);
    expect((await ask(db, { proState })).ok).toBe(true);
    expect(proState).not.toHaveBeenCalled();
  });

  it("a Pro-only run's first turn reads Pro once: Pro starts, a lapsed learner meets the paywall", async () => {
    const proState = vi.fn().mockResolvedValue("active");
    const { db } = fakeDb();
    expect((await ask(db, { run: { persona: "hector" }, proState })).ok).toBe(true);
    expect(proState).toHaveBeenCalledTimes(1);

    proState.mockResolvedValue("inactive");
    const lapsed = await ask(db, { run: { hard: true }, proState });
    expect(lapsed.ok).toBe(false);
    if (!lapsed.ok) {
      expect(lapsed.response.status).toBe(402);
      expect(await lapsed.response.json()).toEqual({ error: "pro_required" });
    }
  });

  it("an unreadable Pro state is a retry, never a start", async () => {
    const { db } = fakeDb();
    for (const proState of [
      async () => "unavailable" as const,
      async () => Promise.reject(new Error("x")),
    ]) {
      const r = await ask(db, { run: { persona: "hector" }, proState });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.response.status).toBe(503);
    }
  });

  it("a later turn of a run already started is never checked again: an in-progress call finishes after a lapse", async () => {
    const proState = vi.fn().mockResolvedValue("inactive");
    const { db } = fakeDb({ callExists: true });
    expect((await ask(db, { run: { persona: "hector" }, proState })).ok).toBe(true);
    expect(proState).not.toHaveBeenCalled();
  });
});
