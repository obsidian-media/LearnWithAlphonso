import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { loadPathData } = await import("./learning-path.server");

const NOW = new Date("2026-11-11T10:00:00Z");
type Row = Record<string, unknown>;

/** A tiny in-memory database: `.eq` filters really apply. `closes` records close_stale_rehearsals calls. */
function fakeAdmin(tables: Record<string, Row[]>, closes: Record<string, unknown>[]) {
  const from = (t: string) => {
    const filters: [string, unknown][] = [];
    const rows = () => (tables[t] ?? []).filter((r) => filters.every(([c, v]) => r[c] === v));
    const q: Record<string, unknown> = {};
    for (const m of ["select", "gte", "lte", "not", "order", "limit"]) q[m] = () => q;
    q.eq = (c: string, v: unknown) => {
      filters.push([c, v]);
      return q;
    };
    q.maybeSingle = async () => ({ data: rows()[0] ?? null, error: null });
    q.then = (ok: (v: unknown) => unknown) => ok({ data: rows(), error: null });
    return q;
  };
  return {
    from,
    rpc: async (fn: string, args: Record<string, unknown>) => {
      if (fn === "close_stale_rehearsals") {
        closes.push(args);
        // The database ends a dated rehearsal whose day passed (so the read after it finds none).
        for (const r of tables.rehearsals ?? [])
          if (
            r.status === "active" &&
            typeof r.event_date === "string" &&
            r.event_date <= "2026-11-04"
          )
            r.status = "done";
      }
      return { data: 0, error: null };
    },
    auth: {
      admin: {
        getUserById: async () => ({ data: { user: { id: "u1", user_metadata: {} } }, error: null }),
      },
    },
  } as never;
}

const rehearsal = (over: Row = {}): Row => ({
  id: "11111111-1111-4111-8111-111111111111",
  user_id: "u1",
  course: "en",
  event_kind: "interview",
  event_date: "2026-11-16",
  status: "active",
  counterpart: "x",
  brief: {},
  free: true,
  created_at: "2026-11-05T10:00:00Z",
  ...over,
});

const pathFor = async (tables: Record<string, Row[]>, closes: Record<string, unknown>[] = []) =>
  (await loadPathData(fakeAdmin(tables, closes), "u1", "en", NOW)).rehearsal;

beforeEach(() => {
  vi.stubEnv("REHEARSALS_ENABLED", "true");
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("the path's pinned rehearsal", () => {
  it("is there for an account that has an active rehearsal and is not switched off", async () => {
    const pinned = await pathFor({ rehearsals: [rehearsal()] });
    expect(pinned).toMatchObject({ eventKind: "interview", eventDate: "2026-11-16" });
  });

  it("is left out for an account switched off, though the rehearsal exists", async () => {
    expect(
      await pathFor({ rehearsals: [rehearsal()], rehearsals_off: [{ user_id: "u1" }] }),
    ).toBeUndefined();
  });

  it("is not affected by another account being switched off", async () => {
    expect(
      await pathFor({ rehearsals: [rehearsal()], rehearsals_off: [{ user_id: "someone-else" }] }),
    ).toBeDefined();
  });

  it("is left out while the global switch is off", async () => {
    vi.stubEnv("REHEARSALS_ENABLED", "false");
    expect(await pathFor({ rehearsals: [rehearsal()] })).toBeUndefined();
  });

  it("a rehearsal that ran out of time is closed first and no longer pinned", async () => {
    const closes: Record<string, unknown>[] = [];
    const pinned = await pathFor({ rehearsals: [rehearsal({ event_date: "2026-11-01" })] }, closes);
    expect(closes).toEqual([{ _user_id: "u1", _today: "2026-11-11" }]);
    expect(pinned).toBeUndefined();
  });
});
