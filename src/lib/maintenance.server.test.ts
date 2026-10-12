import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  handleMaintenance,
  OVERDUE_AFTER_MS,
  retryAppleRevocations,
  REVOCATION_RETRY_WINDOW_MS,
  sweepReports,
  UNDELIVERED_AFTER_MS,
  type MaintenanceDeps,
} from "./maintenance.server";
import type { EmailMessage } from "./report-notify.server";

type Row = Record<string, unknown>;

/**
 * A small in-memory stand-in for the service client: real rows, real filters, so a test asserts on what is left
 * in the tables rather than on which methods were called.
 */
function fakeDb(tables: Record<string, Row[]>, failing: Record<string, string> = {}) {
  const from = (table: string) => {
    const rows = () => (tables[table] ??= []);
    const filters: ((r: Row) => boolean)[] = [];
    let op: "select" | "delete" | "update" = "select";
    let patch: Row = {};
    let limit = Infinity;
    let order: { column: string; ascending: boolean } | null = null;
    const run = () => {
      if (failing[table]) return { data: null, error: { message: failing[table] } };
      const matched = rows().filter((r) => filters.every((f) => f(r)));
      if (op === "delete") {
        tables[table] = rows().filter((r) => !matched.includes(r));
        return { data: null, error: null };
      }
      if (op === "update") {
        for (const r of matched) Object.assign(r, patch);
        return { data: null, error: null };
      }
      const sorted = order
        ? [...matched].sort(
            (a, b) =>
              String(a[order!.column]).localeCompare(String(b[order!.column])) *
              (order!.ascending ? 1 : -1),
          )
        : matched;
      return { data: sorted.slice(0, limit).map((r) => ({ ...r })), error: null };
    };
    const q = {
      select: () => q,
      delete: () => ((op = "delete"), q),
      update: (p: Row) => ((op = "update"), (patch = p), q),
      eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), q),
      lt: (c: string, v: string) => (filters.push((r) => String(r[c]) < v), q),
      in: (c: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[c])), q),
      order: (column: string, o: { ascending: boolean }) => ((order = { column, ...o }), q),
      limit: (n: number) => ((limit = n), q),
      upsert: (incoming: Row[], o: { onConflict: string }) => {
        if (failing[table]) return Promise.resolve({ error: { message: failing[table] } });
        for (const row of incoming) {
          const existing = rows().find((r) => r[o.onConflict] === row[o.onConflict]);
          if (existing) Object.assign(existing, row);
          else rows().push({ ...row });
        }
        return Promise.resolve({ error: null });
      },
      then: (resolve: (v: unknown) => unknown) => Promise.resolve(run()).then(resolve),
    };
    return q;
  };
  return { from } as unknown as MaintenanceDeps["db"];
}

const NOW = new Date("2026-10-20T12:00:00.000Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
const APPLE = { teamId: "t", keyId: "k", privateKey: "p", clientId: "c" } as never;

function makeDeps(tables: Record<string, Row[]>, over: Partial<MaintenanceDeps> = {}) {
  const sent: EmailMessage[] = [];
  const deps: MaintenanceDeps = {
    db: fakeDb(tables),
    now: () => NOW,
    send: async (m) => void sent.push(m),
    appleConfig: () => APPLE,
    revoke: async () => true,
    alertTo: "owner@example.com",
    ...over,
  };
  return { deps, sent };
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.REPORT_NOTIFY_SECRET;
});

describe("retryAppleRevocations", () => {
  const pending = (id: string, age: number, attempts = 0): Row => ({
    id,
    refresh_token: `token-${id}`,
    created_at: ago(age),
    attempts,
    last_attempt_at: null,
  });

  it("removes a credential once Apple confirms the revocation", async () => {
    const tables = { apple_revocation_pending: [pending("a", 60_000)] };
    const revoke = vi.fn(async () => true);
    const { deps, sent } = makeDeps(tables, { revoke });
    expect(await retryAppleRevocations(deps)).toEqual({ revoked: 1, stillPending: 0, expired: 0 });
    expect(revoke).toHaveBeenCalledWith(APPLE, "token-a");
    expect(tables.apple_revocation_pending).toEqual([]);
    expect(sent).toEqual([]);
  });

  it("keeps a credential, and counts the attempt, while Apple still refuses", async () => {
    const tables = { apple_revocation_pending: [pending("a", 60_000, 2)] };
    const { deps } = makeDeps(tables, { revoke: async () => false });
    expect(await retryAppleRevocations(deps)).toEqual({ revoked: 0, stillPending: 1, expired: 0 });
    expect(tables.apple_revocation_pending).toHaveLength(1);
    expect(tables.apple_revocation_pending[0]).toMatchObject({
      attempts: 3,
      last_attempt_at: NOW.toISOString(),
    });
  });

  it("treats a thrown revocation call as a refusal, not a crash", async () => {
    const tables = { apple_revocation_pending: [pending("a", 60_000), pending("b", 30_000)] };
    const revoke = vi.fn(async (_c: unknown, token: string) => {
      if (token === "token-a") throw new Error("network");
      return true;
    });
    const { deps } = makeDeps(tables, { revoke });
    expect(await retryAppleRevocations(deps)).toEqual({ revoked: 1, stillPending: 1, expired: 0 });
    expect(tables.apple_revocation_pending.map((r) => r.id)).toEqual(["a"]);
  });

  it("tries one last time at the end of the window, then removes the credential and tells the owner", async () => {
    const tables = {
      apple_revocation_pending: [pending("old", REVOCATION_RETRY_WINDOW_MS + 1), pending("new", 1)],
    };
    const revoke = vi.fn(async () => false);
    const { deps, sent } = makeDeps(tables, { revoke });
    expect(await retryAppleRevocations(deps)).toEqual({ revoked: 0, stillPending: 1, expired: 1 });
    expect(revoke).toHaveBeenCalledWith(APPLE, "token-old");
    expect(tables.apple_revocation_pending.map((r) => r.id)).toEqual(["new"]);
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("owner@example.com");
    // The credential itself never leaves the database.
    expect(JSON.stringify(sent)).not.toContain("token-old");
  });

  it("holds credentials (inside the window) while the Apple secrets are missing", async () => {
    const tables = { apple_revocation_pending: [pending("a", 60_000)] };
    const revoke = vi.fn(async () => true);
    const { deps } = makeDeps(tables, { appleConfig: () => null, revoke });
    expect(await retryAppleRevocations(deps)).toEqual({ revoked: 0, stillPending: 1, expired: 0 });
    expect(revoke).not.toHaveBeenCalled();
    expect(tables.apple_revocation_pending).toHaveLength(1);
  });
});

describe("sweepReports", () => {
  const report = (id: string, age: number): Row => ({ id, kind: "user", created_at: ago(age) });

  it("emails the owner once about a report whose first notification never went out", async () => {
    const tables: Record<string, Row[]> = {
      content_reports: [report("r1", UNDELIVERED_AFTER_MS + 1000)],
      content_report_delivery: [],
    };
    const { deps, sent } = makeDeps(tables);
    expect(await sweepReports(deps)).toEqual({ delivered: 1, escalated: 0 });
    expect(sent).toHaveLength(1);
    expect(sent[0].text).toContain("r1");
    expect(tables.content_report_delivery).toMatchObject([
      { report_id: "r1", notified_at: NOW.toISOString(), attempts: 1 },
    ]);
    // The next pass finds it delivered and stays quiet.
    expect(await sweepReports(deps)).toEqual({ delivered: 0, escalated: 0 });
    expect(sent).toHaveLength(1);
  });

  it("leaves alone a report the trigger already emailed, and one too new to have been missed", async () => {
    const tables: Record<string, Row[]> = {
      content_reports: [report("sent", UNDELIVERED_AFTER_MS + 1000), report("fresh", 1000)],
      content_report_delivery: [
        { report_id: "sent", notified_at: ago(1000), escalated_at: null, attempts: 0 },
      ],
    };
    const { deps, sent } = makeDeps(tables);
    expect(await sweepReports(deps)).toEqual({ delivered: 0, escalated: 0 });
    expect(sent).toEqual([]);
  });

  it("keeps a report undelivered, and counts the attempt, when the email fails", async () => {
    const tables: Record<string, Row[]> = {
      content_reports: [report("r1", UNDELIVERED_AFTER_MS + 1000)],
      content_report_delivery: [],
    };
    const { deps } = makeDeps(tables, {
      send: async () => {
        throw new Error("mail down");
      },
    });
    expect(await sweepReports(deps)).toEqual({ delivered: 0, escalated: 0 });
    expect(tables.content_report_delivery).toMatchObject([
      { report_id: "r1", notified_at: null, attempts: 1 },
    ]);
  });

  it("reminds the owner once about a report still open near the response window", async () => {
    const tables: Record<string, Row[]> = {
      content_reports: [
        report("late", OVERDUE_AFTER_MS + 1000),
        report("recent", OVERDUE_AFTER_MS - 60_000),
      ],
      content_report_delivery: [
        { report_id: "late", notified_at: ago(OVERDUE_AFTER_MS), escalated_at: null, attempts: 0 },
        { report_id: "recent", notified_at: ago(1000), escalated_at: null, attempts: 0 },
      ],
    };
    const { deps, sent } = makeDeps(tables);
    expect(await sweepReports(deps)).toEqual({ delivered: 0, escalated: 1 });
    expect(sent).toHaveLength(1);
    expect(sent[0].text).toContain("late");
    expect(sent[0].text).not.toContain("recent");
    const late = tables.content_report_delivery.find((r) => r.report_id === "late")!;
    expect(late.escalated_at).toBe(NOW.toISOString());
    // The first notification's record is kept, not overwritten.
    expect(late.notified_at).toBe(ago(OVERDUE_AFTER_MS));
    expect(await sweepReports(deps)).toEqual({ delivered: 0, escalated: 0 });
    expect(sent).toHaveLength(1);
  });

  it("does not mark a report escalated when the reminder fails, so the next pass tries again", async () => {
    const tables: Record<string, Row[]> = {
      content_reports: [report("late", OVERDUE_AFTER_MS + 1000)],
      content_report_delivery: [
        { report_id: "late", notified_at: ago(1000), escalated_at: null, attempts: 0 },
      ],
    };
    const { deps } = makeDeps(tables, {
      send: async () => {
        throw new Error("mail down");
      },
    });
    expect(await sweepReports(deps)).toEqual({ delivered: 0, escalated: 0 });
    expect(tables.content_report_delivery[0].escalated_at).toBeNull();
  });

  it("marks nothing delivered, and logs, when there is no address to send to", async () => {
    const tables: Record<string, Row[]> = {
      content_reports: [report("r1", OVERDUE_AFTER_MS + 1000)],
      content_report_delivery: [],
    };
    const { deps, sent } = makeDeps(tables, { alertTo: "" });
    expect(await sweepReports(deps)).toEqual({ delivered: 0, escalated: 0 });
    expect(sent).toEqual([]);
    expect(tables.content_report_delivery).toEqual([]);
    expect(vi.mocked(console.error).mock.calls.flat().join(" ")).toContain("REPORT_NOTIFY_TO");
  });

  it("never quotes a report's free text or names, only its id, kind and time", async () => {
    const tables: Record<string, Row[]> = {
      content_reports: [
        {
          ...report("r1", UNDELIVERED_AFTER_MS + 1000),
          reason: "SECRET-REASON",
          kind: "ai_response",
        },
      ],
      content_report_delivery: [],
    };
    const { deps, sent } = makeDeps(tables);
    await sweepReports(deps);
    expect(sent[0].text).toContain("ai_response");
    expect(sent[0].text).not.toContain("SECRET-REASON");
  });
});

describe("handleMaintenance", () => {
  const SECRET = "s".repeat(40);
  const req = (secret?: string) =>
    new Request("https://example.com/api/internal/maintenance", {
      method: "POST",
      headers: secret ? { "x-report-notify-secret": secret } : {},
      body: "{}",
    });

  it("is refused without the shared secret, before anything is read", async () => {
    process.env.REPORT_NOTIFY_SECRET = SECRET;
    const make = vi.fn();
    expect((await handleMaintenance(req(), make)).status).toBe(401);
    expect((await handleMaintenance(req("x".repeat(40)), make)).status).toBe(401);
    expect(make).not.toHaveBeenCalled();
  });

  it("is refused when the secret is not configured", async () => {
    const make = vi.fn();
    expect((await handleMaintenance(req(SECRET), make)).status).toBe(503);
    expect(make).not.toHaveBeenCalled();
  });

  it("runs both tasks and reports counts only", async () => {
    process.env.REPORT_NOTIFY_SECRET = SECRET;
    const tables: Record<string, Row[]> = {
      apple_revocation_pending: [
        { id: "a", refresh_token: "token-a", created_at: ago(1000), attempts: 0 },
      ],
      content_reports: [{ id: "r1", kind: "user", created_at: ago(UNDELIVERED_AFTER_MS + 1000) }],
      content_report_delivery: [],
    };
    const { deps } = makeDeps(tables);
    const res = await handleMaintenance(req(SECRET), async () => deps);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(JSON.parse(body)).toEqual({
      ok: true,
      failures: [],
      revocations: { revoked: 1, stillPending: 0, expired: 0 },
      reports: { delivered: 1, escalated: 0 },
    });
    expect(body).not.toContain("token-a");
  });

  it("still sweeps reports when the revocation step fails, and says which step failed", async () => {
    process.env.REPORT_NOTIFY_SECRET = SECRET;
    const tables: Record<string, Row[]> = {
      content_reports: [{ id: "r1", kind: "user", created_at: ago(UNDELIVERED_AFTER_MS + 1000) }],
      content_report_delivery: [],
    };
    const { deps, sent } = makeDeps(tables);
    deps.db = fakeDb(tables, { apple_revocation_pending: "permission denied" });
    const res = await handleMaintenance(req(SECRET), async () => deps);
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({
      ok: false,
      failures: ["apple-revocations"],
      reports: { delivered: 1, escalated: 0 },
    });
    expect(sent).toHaveLength(1);
  });
});
