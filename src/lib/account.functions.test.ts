import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
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

const deleteUser = vi.fn();
const supabaseAdminFrom = vi.fn();
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: supabaseAdminFrom, auth: { admin: { deleteUser } } },
}));

const accountModule = await import("./account.functions");
// asTestFns only accepts a map of server fns, so hand it just those two --
// the module also exports the plain table constants the coverage guard reads.
const { exportMyData, deleteMyAccount } = asTestFns({
  exportMyData: accountModule.exportMyData,
  deleteMyAccount: accountModule.deleteMyAccount,
});
const { OTHER_OWNED_EXPORT_TABLES } = accountModule;
// Widened from the readonly literal tuples so they can be searched with the
// arbitrary table names scraped out of the migrations.
const exportTables: readonly string[] = accountModule.USER_ID_EXPORT_TABLES;
const deleteTables: readonly string[] = accountModule.USER_DELETE_TABLES;

const USER_ID = "user-1";

function ctx(supabase: ReturnType<typeof createSupabaseMock>) {
  return { supabase, userId: USER_ID };
}

beforeEach(() => {
  deleteUser.mockReset();
  supabaseAdminFrom.mockReset();
  supabaseAdminFrom.mockReturnValue(chainable({}));
});

describe("exportMyData", () => {
  it("bundles every user-scoped table plus the profile row into one export", async () => {
    const supabase = createSupabaseMock();
    // 9 USER_ID_TABLES selects (order doesn't affect the merged shape) + profiles.
    supabase.from.mockImplementation((table: string) => {
      if (table === "review_items") return chainable({ data: [{ item_key: "u1l1:q1" }] });
      if (table === "profiles") return chainable({ data: { display_name: "Ada" } });
      return chainable({ data: [] });
    });

    const result = await exportMyData({ context: ctx(supabase) });

    expect(result.user_id).toBe(USER_ID);
    expect(typeof result.exported_at).toBe("string");
    const tables = JSON.parse(result.tables);
    expect(tables.review_items).toEqual([{ item_key: "u1l1:q1" }]);
    expect(tables.profiles).toEqual({ display_name: "Ada" });
    // language_progress and ai_rate_limits were the tables a past bug
    // silently dropped from the export -- assert they're present.
    expect(tables).toHaveProperty("language_progress");
    expect(tables).toHaveProperty("ai_rate_limits");
  });

  it("falls back to an empty array/object when a table has no rows", async () => {
    const supabase = createSupabaseMock();
    supabase.from.mockImplementation(() => chainable({ data: null }));
    const result = await exportMyData({ context: ctx(supabase) });
    const tables = JSON.parse(result.tables);
    expect(tables.review_items).toEqual([]);
    expect(tables.profiles).toEqual([]);
  });
});

describe("deleteMyAccount", () => {
  it("rejects a confirmation value other than the literal 'DELETE'", async () => {
    const supabase = createSupabaseMock();
    await expect(
      deleteMyAccount({ context: ctx(supabase), data: { confirm: "delete" } }),
    ).rejects.toThrow();
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("deletes every owned row, orphaned friendships, and the auth user", async () => {
    const supabase = createSupabaseMock();
    supabase.from.mockReturnValue(chainable({}));
    deleteUser.mockResolvedValue({ error: null });

    const result = await deleteMyAccount({ context: ctx(supabase), data: { confirm: "DELETE" } });

    expect(result).toEqual({ deleted: true });
    expect(supabaseAdminFrom).toHaveBeenCalledWith("friendships");
    expect(deleteUser).toHaveBeenCalledWith(USER_ID);
  });

  it("throws when the admin deleteUser call fails", async () => {
    const supabase = createSupabaseMock();
    supabase.from.mockReturnValue(chainable({}));
    deleteUser.mockResolvedValue({ error: new Error("auth service down") });

    await expect(
      deleteMyAccount({ context: ctx(supabase), data: { confirm: "DELETE" } }),
    ).rejects.toThrow("auth service down");
  });
});

// --- GDPR export coverage guard -------------------------------------------
// This list has silently drifted three times now (see account.functions.ts's
// own header comment): "achievements" vs "user_achievements", then
// language_progress/ai_rate_limits, then the whole gamification + push batch.
// Each time the symptom was the same -- a GDPR data-portability export that
// quietly returned incomplete data, with nothing failing. This test reads the
// migrations and fails the build instead.
//
// Assumption, verified when written: no migration adds a `user_id` column via
// ALTER TABLE, and none drops a table, so scanning CREATE TABLE bodies sees
// every user-scoped table. Re-check that if this ever starts under-reporting.
describe("GDPR export table coverage", () => {
  const migrationsDir = path.resolve(import.meta.dirname, "../../supabase/migrations");
  const sql = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => readFileSync(path.join(migrationsDir, f), "utf8"))
    .join("\n");

  const createTableBlocks = [
    ...sql.matchAll(
      /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-z_]+)\s*\(([\s\S]*?)\n\s*\)\s*;/gi,
    ),
  ].map(([, table, body]) => ({ table, body }));

  it("finds the migrations (guards against a silently-empty scan)", () => {
    expect(createTableBlocks.length).toBeGreaterThan(20);
  });

  // Tables keyed by user_id that are deliberately NOT part of the export.
  // Each needs a reason, because the default must stay "export it" --
  // this list is the only way a table with personal data in it can
  // silently escape the guard.
  const NOT_PERSONAL_DATA = new Set<string>([
    // admin_users is an access-control list, not the account's own data.
    // Three reasons it is excluded rather than added:
    //  1. The export runs as the CALLER. admin_users has RLS enabled with
    //     no policies and no grant to `authenticated`, so the query would
    //     return an empty array for everyone, admin or not -- an export
    //     field that is always empty is worse than no field.
    //  2. Reading it needs the service role, and reaching for that here
    //     would put an allowlist read into a user-triggered endpoint,
    //     which is precisely what the table's design forbids.
    //  3. Deletion is already handled: user_id REFERENCES auth.users
    //     ON DELETE CASCADE, so the row goes when the account does.
    "admin_users",
    // blocked_users (supabase/migrations/20260928020000_block_and_report.sql):
    // the `blocker` half is genuinely this account's own data and RLS
    // does let the caller read it back, but the generic USER_ID_EXPORT_TABLES
    // loop only matches a literal `user_id` column, and OTHER_OWNED_EXPORT_TABLES
    // ORs across every listed column -- which would also export the
    // `blocked` half, i.e. who has blocked *me*. Revealing that to the
    // blocked-by party defeats the point of blocking, so this needs a
    // one-column-only export path the current mechanism doesn't have.
    // Flagged as a real follow-up, not silently accepted as covered.
    // Deletion is already handled: both columns REFERENCES auth.users
    // ON DELETE CASCADE.
    "blocked_users",
    // content_reports (same migration): RLS has NO select policy for
    // anyone, reporter included -- same admin_users reasoning above
    // (reason 1: an export field that's always empty is worse than no
    // field). Deletion is already handled the same CASCADE way.
    "content_reports",
  ]);

  it("exports every table that has a user_id column", () => {
    const withUserId = createTableBlocks
      .filter(({ body }) => /^\s*user_id\s+uuid/im.test(body))
      .map(({ table }) => table)
      .filter((t) => !NOT_PERSONAL_DATA.has(t));

    const missing = withUserId.filter((t) => !exportTables.includes(t));
    expect(missing).toEqual([]);
  });

  it("keeps the exclusion list honest", () => {
    // An exclusion list is a hole in a guard. This pins that every name
    // in it still exists as a table -- otherwise a renamed table leaves a
    // stale exemption behind, and the real table slips through unnoticed.
    const allTables = new Set(createTableBlocks.map(({ table }) => table));
    for (const excluded of NOT_PERSONAL_DATA) {
      expect(allTables.has(excluded)).toBe(true);
    }
  });

  it("exports every table that references auth.users by some other column", () => {
    const covered = new Set<string>([
      ...exportTables,
      ...OTHER_OWNED_EXPORT_TABLES.map((t) => t.table),
      // "profiles" is exported too, just keyed by `id` rather than
      // `user_id`, so it takes its own select below.
      "profiles",
      // "teams" is shared group data, not personal data: its only link is
      // `created_by ... ON DELETE SET NULL`, i.e. a team deliberately
      // outlives the account that made it.
      "teams",
      ...NOT_PERSONAL_DATA,
    ]);
    const referencing = createTableBlocks
      .filter(({ body }) => /references\s+auth\.users/i.test(body))
      .map(({ table }) => table);

    const missing = referencing.filter((t) => !covered.has(t));
    expect(missing).toEqual([]);
  });

  it("only tries to delete rows the caller's own RLS role can delete", () => {
    // deleteMyAccount issues DELETEs as the user, not service_role. Every
    // other user-scoped table is cleaned up by ON DELETE CASCADE from
    // auth.users when deleteUser() runs, so widening this list would only
    // add silently-failing requests.
    for (const table of deleteTables) {
      expect(exportTables).toContain(table);
    }
  });
});
