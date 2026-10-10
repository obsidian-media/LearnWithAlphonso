import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { replayPolicies } from "./__testutils__/policy-replay";
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
const getUserById = vi.fn();
const supabaseAdminFrom = vi.fn();
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: supabaseAdminFrom, auth: { admin: { deleteUser, getUserById } } },
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

function ctx(
  supabase: ReturnType<typeof createSupabaseMock>,
  claims: Record<string, unknown> = {},
) {
  return { supabase, userId: USER_ID, claims };
}

beforeEach(() => {
  deleteUser.mockReset();
  supabaseAdminFrom.mockReset();
  supabaseAdminFrom.mockReturnValue(chainable({}));
  getUserById.mockReset();
  // An email-only learner unless a test says otherwise.
  getUserById.mockResolvedValue({
    data: {
      user: {
        id: USER_ID,
        app_metadata: { providers: ["email"] },
        identities: [{ provider: "email" }],
      },
    },
    error: null,
  });
});

describe("exportMyData", () => {
  it("fails loudly, naming the table, when a table read errors (never exports a silent empty)", async () => {
    const supabase = createSupabaseMock();
    supabase.from.mockImplementation((table: string) =>
      table === "challenge_completions"
        ? chainable({
            data: null,
            error: { message: "permission denied for table challenge_completions" },
          })
        : chainable({ data: [] }),
    );
    await expect(exportMyData({ context: ctx(supabase) })).rejects.toThrow(/challenge_completions/);
  });

  it("fails rather than exporting an empty profile after a profile read error", async () => {
    const supabase = createSupabaseMock();
    supabase.from.mockImplementation((table: string) =>
      table === "profiles"
        ? chainable({ data: null, error: { message: "temporary database failure" } })
        : chainable({ data: [], error: null }),
    );
    await expect(exportMyData({ context: ctx(supabase) })).rejects.toThrow(/profiles/);
  });

  it("also fails when a table read through the sender/recipient columns errors", async () => {
    const supabase = createSupabaseMock();
    supabase.from.mockImplementation((table: string) =>
      table === "nudges"
        ? chainable({ data: null, error: { message: "permission denied for table nudges" } })
        : chainable({ data: [] }),
    );
    await expect(exportMyData({ context: ctx(supabase) })).rejects.toThrow(/nudges/);
  });

  it("bundles every user-scoped table plus the profile row into one export", async () => {
    const supabase = createSupabaseMock();
    // 9 USER_ID_TABLES selects (order doesn't affect the merged shape) + profiles.
    supabase.from.mockImplementation((table: string) => {
      if (table === "review_items") return chainable({ data: [{ item_key: "u1l1:q1" }] });
      if (table === "profiles") return chainable({ data: { display_name: "Ada" } });
      return chainable({ data: [] });
    });

    const result = await exportMyData({
      context: ctx(supabase, { email: "ada@example.com" }),
    });

    expect(result.user_id).toBe(USER_ID);
    expect(typeof result.exported_at).toBe("string");
    // The account's own email lives on auth.users, not any table this
    // handler queries -- it has to come from the verified JWT claims
    // instead, or a GDPR export silently omits it.
    expect(result.email).toBe("ada@example.com");
    const tables = JSON.parse(result.tables);
    expect(tables.review_items).toEqual([{ item_key: "u1l1:q1" }]);
    expect(tables.profiles).toEqual({ display_name: "Ada" });
    // language_progress and ai_rate_limits were the tables a past bug
    // silently dropped from the export -- assert they're present.
    expect(tables).toHaveProperty("language_progress");
    expect(tables).toHaveProperty("ai_rate_limits");
  });

  it("exports the buddy weeks of the caller's pairs (no user column, so not covered by the generic scans)", async () => {
    const supabase = createSupabaseMock();
    supabase.from.mockImplementation((table: string) =>
      table === "buddy_weeks"
        ? chainable({ data: [{ pair_id: "p1", week_start: "2026-09-28", outcome: "hit" }] })
        : chainable({ data: [] }),
    );
    const result = await exportMyData({ context: ctx(supabase) });
    const tables = JSON.parse(result.tables);
    expect(tables.buddy_weeks).toEqual([
      { pair_id: "p1", week_start: "2026-09-28", outcome: "hit" },
    ]);
    expect(tables).toHaveProperty("buddy_pairs");
    expect(tables).toHaveProperty("buddy_requests");
  });

  it("fails, naming buddy_weeks, when that read errors", async () => {
    const supabase = createSupabaseMock();
    supabase.from.mockImplementation((table: string) =>
      table === "buddy_weeks"
        ? chainable({ data: null, error: { message: "permission denied for table buddy_weeks" } })
        : chainable({ data: [] }),
    );
    await expect(exportMyData({ context: ctx(supabase) })).rejects.toThrow(/buddy_weeks/);
  });

  it("exports the caller's buddy messages and names the table when that read fails", async () => {
    const ok = createSupabaseMock();
    ok.from.mockImplementation((table: string) =>
      table === "buddy_messages"
        ? chainable({ data: [{ pair_id: "p1", preset_id: "nice_work" }] })
        : chainable({ data: [] }),
    );
    const tables = JSON.parse((await exportMyData({ context: ctx(ok) })).tables);
    expect(tables.buddy_messages).toEqual([{ pair_id: "p1", preset_id: "nice_work" }]);

    const failing = createSupabaseMock();
    failing.from.mockImplementation((table: string) =>
      table === "buddy_messages"
        ? chainable({
            data: null,
            error: { message: "permission denied for table buddy_messages" },
          })
        : chainable({ data: [] }),
    );
    await expect(exportMyData({ context: ctx(failing) })).rejects.toThrow(/buddy_messages/);
  });

  it("fails on a null table response rather than silently treating it as no rows", async () => {
    const supabase = createSupabaseMock();
    supabase.from.mockImplementation(() => chainable({ data: null }));
    await expect(exportMyData({ context: ctx(supabase) })).rejects.toThrow(/incomplete/);
  });

  it("exports empty arrays when reads positively return no rows", async () => {
    const supabase = createSupabaseMock();
    supabase.from.mockImplementation(() => chainable({ data: [], error: null, count: 0 }));
    const result = await exportMyData({ context: ctx(supabase) });
    const tables = JSON.parse(result.tables);
    expect(tables.review_items).toEqual([]);
    expect(tables.profiles).toEqual([]);
  });

  it("reads every page of a large table instead of stopping at the PostgREST cap", async () => {
    const supabase = createSupabaseMock();
    const large = Array.from({ length: 750 }, (_, i) => ({ item_key: `card-${i}` }));
    const ranges: [number, number][] = [];
    supabase.from.mockImplementation((table: string) => {
      const query = {
        select: () => query,
        eq: () => query,
        or: () => query,
        range: (first: number, last: number) => {
          if (table === "review_items") ranges.push([first, last]);
          const data = table === "review_items" ? large.slice(first, last + 1) : [];
          return Promise.resolve({ data, error: null, count: table === "review_items" ? 750 : 0 });
        },
      };
      return query as never;
    });
    const result = await exportMyData({ context: ctx(supabase) });
    expect(JSON.parse(result.tables).review_items).toHaveLength(750);
    expect(ranges).toEqual([
      [0, 499],
      [500, 999],
    ]);
  });

  it("exports null for email when the JWT claims don't carry one", async () => {
    const supabase = createSupabaseMock();
    supabase.from.mockImplementation(() => chainable({ data: [] }));
    const result = await exportMyData({ context: ctx(supabase) });
    expect(result.email).toBeNull();
  });

  // §2.2's "related, smaller finding not fixed": user_progress.xp has been
  // frozen since the 2026-09-08 multi-course migration (real xp lives in
  // language_progress, per course), yet select("*") still exported it --
  // so a downloaded "your data" file showed two disagreeing xp values with
  // no way to tell which was real. Same story for cefr_level, league_tier
  // and all three placement_* columns: every one of them is duplicated on
  // language_progress and nothing writes the user_progress copy anymore.
  it("excludes user_progress's columns frozen by the multi-course migration", async () => {
    const supabase = createSupabaseMock();
    const perTable = new Map<string, ReturnType<typeof chainable>>();
    supabase.from.mockImplementation((table: string) => {
      const c = chainable({ data: [] });
      perTable.set(table, c);
      return c;
    });

    await exportMyData({ context: ctx(supabase) });

    const userProgressCalls = perTable.get("user_progress")!.calls;
    const selectCall = userProgressCalls.find((c) => c.method === "select");
    const selectedColumns = selectCall!.args[0] as string;
    for (const frozen of [
      "xp",
      "cefr_level",
      "league_tier",
      "placement_level",
      "placement_score",
      "placement_taken_at",
    ]) {
      expect(selectedColumns.split(",")).not.toContain(frozen);
    }
    // Still exports the columns that are actually live.
    for (const live of ["streak", "hearts", "longest_streak"]) {
      expect(selectedColumns.split(",")).toContain(live);
    }
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

    // appleRevocationStatus reports what happened to the Apple grant.
    // "not_applicable" here because no Apple secrets are configured in
    // tests -- the same answer production gives until they are -- and
    // deletion proceeds either way by design. (Was a bare
    // `appleRevoked: false` before a 2026-09-28 fix that distinguishes
    // "nothing to revoke" from "revocation actually failed", since the
    // old boolean collapsed both into the same value and nothing ever
    // logged the difference.)
    expect(result).toEqual({ deleted: true, appleRevocationStatus: "not_applicable" });
    // Hector is decoupled (2026-09-27): no separate account to revoke, so
    // the result carries no hectorRevoked field at all.
    expect("hectorRevoked" in result).toBe(false);
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
    // buddy_members (20261006180000_buddy_pairing.sql) is server-only (no SELECT policy) and holds nothing the
    // export lacks: an active membership is the account's open row in buddy_pairs, which IS exported.
    "buddy_members",
    // buddy_pool_exclusions (20261013100100_buddy_pool_exclusion.sql) is a server-only operational flag that keeps
    // the App Review demo account out of stranger matching. It has no client policy and holds nothing the learner
    // typed or did; it goes with the account through ON DELETE CASCADE.
    "buddy_pool_exclusions",
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
    // apple_auth_tokens (supabase/migrations/20260928030000_apple_auth_tokens.sql):
    // a CREDENTIAL, not the account's own data. Exporting it would hand
    // the user -- and anyone who ever receives a copy of their export
    // file -- a live refresh token that authorises Apple identity
    // operations for this whole app. That is a security hole dressed as
    // transparency, and it is the one case where "export it by default"
    // is the wrong default. Same admin_users mechanics otherwise: RLS on
    // with no policies and no grant to `authenticated`, so the
    // caller-scoped export would return empty anyway. Deletion is handled
    // -- user_id REFERENCES auth.users ON DELETE CASCADE -- and the grant
    // itself is revoked with Apple before the row goes.
    "apple_auth_tokens",
    // hector_links (supabase/migrations/20260928040000_hector_links.sql):
    // an identity mapping (this account -> its Cloud Voice account in a
    // different Supabase project), not the account's own data -- same
    // admin_users/apple_auth_tokens mechanics: RLS on with no policies
    // and no grant to `authenticated`, so the caller-scoped export would
    // return empty anyway. Deletion is handled -- user_id REFERENCES
    // auth.users ON DELETE CASCADE. The table is dropped in the Hector
    // decouple (2026-09-27); its create migration stays in history, so
    // this export-coverage scan still sees it and the exclusion must stay.
    "hector_links",
    // friend_invite_codes (supabase/migrations/20260930140000_fix_friend_invite_forgeable_uuid.sql):
    // same admin_users/apple_auth_tokens mechanics -- RLS on with no
    // client-facing policies at all (only the two SECURITY DEFINER
    // functions in that migration touch it), so the caller-scoped export
    // would return empty regardless. Deletion is already handled: user_id
    // REFERENCES auth.users ON DELETE CASCADE.
    "friend_invite_codes",
    // team_kicks (supabase/migrations/20260930150000_fix_kicked_member_instant_rejoin.sql):
    // same mechanics again -- RLS on with no client-facing policies at
    // all (only _join_team_impl and kick_team_member, both SECURITY
    // DEFINER, touch it), so the caller-scoped export would return empty
    // regardless. Deletion is handled: user_id REFERENCES auth.users ON
    // DELETE CASCADE.
    "team_kicks",
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
      // Read whole as the caller; each table's own-pairs SELECT policy is what scopes it.
      ...accountModule.RLS_SCOPED_EXPORT_TABLES,
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

  it("only lists tables that actually have a DELETE (or ALL) policy for authenticated", () => {
    // A grant alone is not enough: with RLS on and no DELETE policy the request matches zero rows and
    // "succeeds", so the entry would be dead code that looks like cleanup. Found 2026-10-06 on activity_days,
    // user_progress, ai_usage and ai_rate_limits (BACKLOG 0.0-ae follow-up 1); CASCADE handles those.
    const policies = replayPolicies();
    const missing = deleteTables.filter((table) => !policies.get(table)?.has("DELETE"));
    expect(missing).toEqual([]);
  });

  it("every table the export reads has a SELECT policy for the signed-in user", () => {
    // exportMyData reads as the CALLER. With RLS on and no SELECT policy a read returns no rows and no error,
    // so the GDPR export silently omitted challenge_completions, duel_queue, season_cohort_members and
    // season_placements until 2026-10-06 (BACKLOG 0.0-ae follow-up).
    const policies = replayPolicies();
    const tables = [
      ...exportTables,
      ...accountModule.OTHER_OWNED_EXPORT_TABLES.map((o) => o.table),
      ...accountModule.RLS_SCOPED_EXPORT_TABLES,
    ];
    const unreadable = tables.filter((table) => !policies.get(table)?.has("SELECT"));
    expect(unreadable).toEqual([]);
  });

  it("is exactly the tables with a DELETE policy (no dead pre-delete calls)", () => {
    expect([...deleteTables].sort()).toEqual(
      [
        "review_items",
        "lesson_completions",
        "user_achievements",
        "friendships",
        "language_progress",
      ].sort(),
    );
  });
});

describe("revokeAppleGrantForUser without Apple secrets", () => {
  const APPLE_KEYS = ["APPLE_TEAM_ID", "APPLE_KEY_ID", "APPLE_PRIVATE_KEY", "APPLE_CLIENT_ID"];
  beforeEach(() => {
    for (const key of APPLE_KEYS) vi.stubEnv(key, "");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  function admin(lookup: unknown) {
    return {
      from: vi.fn(() => chainable({ data: null, error: null })),
      auth: { admin: { getUserById: vi.fn().mockResolvedValue(lookup) } },
    } as never;
  }

  it("reports not_configured and logs when the user signed in with Apple", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const status = await accountModule.revokeAppleGrantForUser(
      admin({
        data: {
          user: {
            id: USER_ID,
            app_metadata: { providers: ["apple"] },
            identities: [{ provider: "apple" }],
          },
        },
        error: null,
      }),
      USER_ID,
    );
    expect(status).toBe("not_configured");
    expect(log).toHaveBeenCalledOnce();
    expect(String(log.mock.calls[0][0])).toContain("[apple-revocation] NOT CONFIGURED");
    expect(String(log.mock.calls[0][0])).toContain(USER_ID);
  });

  it("finds an Apple identity linked to an email account too", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const status = await accountModule.revokeAppleGrantForUser(
      admin({
        data: {
          user: {
            id: USER_ID,
            app_metadata: { providers: ["email"] },
            identities: [{ provider: "email" }, { provider: "apple" }],
          },
        },
        error: null,
      }),
      USER_ID,
    );
    expect(status).toBe("not_configured");
  });

  it("stays not_applicable and silent for a learner without Apple", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const status = await accountModule.revokeAppleGrantForUser(
      admin({
        data: {
          user: {
            id: USER_ID,
            app_metadata: { providers: ["google"] },
            identities: [{ provider: "google" }],
          },
        },
        error: null,
      }),
      USER_ID,
    );
    expect(status).toBe("not_applicable");
    expect(log).not.toHaveBeenCalled();
  });

  it("reports not_configured and logs when the identity lookup itself fails", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const status = await accountModule.revokeAppleGrantForUser(
      admin({ data: { user: null }, error: { message: "boom" } }),
      USER_ID,
    );
    expect(status).toBe("not_configured");
    expect(String(log.mock.calls[0][0])).toContain("NOT CONFIGURED");
  });
});

describe("revokeAppleGrantForUser with Apple configuration", () => {
  afterEach(() => vi.unstubAllEnvs());

  function configureApple() {
    vi.stubEnv("APPLE_TEAM_ID", "test-team");
    vi.stubEnv("APPLE_KEY_ID", "test-key");
    vi.stubEnv("APPLE_PRIVATE_KEY", "test-private-key");
    vi.stubEnv("APPLE_CLIENT_ID", "test-client");
  }

  it("does not classify a token lookup failure as not applicable", async () => {
    configureApple();
    const admin = {
      from: () => chainable({ data: null, error: { message: "temporary database failure" } }),
    };
    await expect(accountModule.revokeAppleGrantForUser(admin as never, USER_ID)).resolves.toBe(
      "failed",
    );
  });

  it("does not call a missing token not-applicable for a linked Apple identity", async () => {
    configureApple();
    const admin = {
      from: () => chainable({ data: null, error: null }),
      auth: {
        admin: {
          getUserById: async () => ({
            data: { user: { app_metadata: { providers: ["apple"] }, identities: [] } },
            error: null,
          }),
        },
      },
    };
    expect(await accountModule.revokeAppleGrantForUser(admin as never, USER_ID)).toBe("failed");
  });
});
