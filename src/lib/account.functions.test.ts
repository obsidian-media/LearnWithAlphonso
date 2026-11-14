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
const getUser = vi.fn();
const supabaseAdminFrom = vi.fn();
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: supabaseAdminFrom, auth: { getUser, admin: { deleteUser, getUserById } } },
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
  return { supabase, userId: USER_ID, claims, accessToken: "live-token" };
}

beforeEach(() => {
  getUser.mockReset();
  // The session is live on the auth server unless a test says otherwise.
  getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
  deleteUser.mockReset();
  supabaseAdminFrom.mockReset();
  // Service-role reads answer "no rows" unless a test says otherwise.
  supabaseAdminFrom.mockReturnValue(chainable({ data: [], error: null, count: 0 }));
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

  /** A review_items table of `total` rows served by `pageOf`; every other table is empty. */
  function pagedReviewItems(total: number, pageOf: (first: number, last: number) => unknown[]) {
    const supabase = createSupabaseMock();
    supabase.from.mockImplementation((table: string) => {
      const query = {
        select: () => query,
        eq: () => query,
        or: () => query,
        range: (first: number, last: number) =>
          Promise.resolve(
            table === "review_items"
              ? { data: pageOf(first, last), error: null, count: total }
              : { data: [], error: null, count: 0 },
          ),
      };
      return query as never;
    });
    return supabase;
  }

  it("fails when a row moved between pages, so one is read twice and another is skipped", async () => {
    const rows = Array.from({ length: 750 }, (_, i) => ({ item_key: `card-${i}` }));
    // The second page starts one row early: card-499 comes back twice and card-749 is never read, while the
    // row count still matches.
    const supabase = pagedReviewItems(750, (first, last) =>
      first === 0 ? rows.slice(0, 500) : rows.slice(first - 1, last),
    );
    await expect(exportMyData({ context: ctx(supabase) })).rejects.toThrow(
      /review_items changed during pagination/,
    );
  });

  it("fails when the table grew or shrank while it was being read", async () => {
    const rows = Array.from({ length: 700 }, (_, i) => ({ item_key: `card-${i}` }));
    const supabase = pagedReviewItems(750, (first, last) => rows.slice(first, last + 1));
    await expect(exportMyData({ context: ctx(supabase) })).rejects.toThrow(
      /review_items changed during pagination/,
    );
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

  it("keeps auth-deletion failures retryable without returning backend details", async () => {
    const supabase = createSupabaseMock();
    supabase.from.mockReturnValue(chainable({}));
    deleteUser.mockResolvedValue({ error: new Error("auth service down") });

    await expect(
      deleteMyAccount({ context: ctx(supabase), data: { confirm: "DELETE" } }),
    ).rejects.toThrow(/account is still active; please try again/i);
  });

  it("does not delete the auth user when incoming friendship cleanup fails", async () => {
    const supabase = createSupabaseMock();
    supabase.from.mockReturnValue(chainable({}));
    supabaseAdminFrom.mockReturnValue(
      chainable({ error: { code: "XX000", message: "sensitive detail" } }),
    );

    await expect(
      deleteMyAccount({ context: ctx(supabase), data: { confirm: "DELETE" } }),
    ).rejects.toThrow(/account is still active; please try again/i);
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("stops before auth deletion when an owned-row delete fails", async () => {
    const supabase = createSupabaseMock();
    supabase.from.mockImplementation((table: string) =>
      table === "review_items"
        ? chainable({ error: { message: "review cleanup failed" } })
        : chainable({ error: null }),
    );

    await expect(
      deleteMyAccount({ context: ctx(supabase), data: { confirm: "DELETE" } }),
    ).rejects.toThrow(/account is still active; please try again/i);
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("allows the still-authenticated user to retry after partial row cleanup", async () => {
    const supabase = createSupabaseMock();
    let failOnce = true;
    supabase.from.mockImplementation((table: string) => {
      if (table === "review_items" && failOnce) {
        failOnce = false;
        return chainable({ error: { message: "temporary database failure" } });
      }
      return chainable({ error: null });
    });
    deleteUser.mockResolvedValue({ error: null });

    await expect(
      deleteMyAccount({ context: ctx(supabase), data: { confirm: "DELETE" } }),
    ).rejects.toThrow(/account is still active; please try again/i);
    expect(deleteUser).not.toHaveBeenCalled();

    await expect(
      deleteMyAccount({ context: ctx(supabase), data: { confirm: "DELETE" } }),
    ).resolves.toMatchObject({ deleted: true });
    expect(deleteUser).toHaveBeenCalledWith(USER_ID);
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
describe("account actions need a session the auth server still recognises", () => {
  const signedOut = () =>
    getUser.mockResolvedValue({ data: { user: null }, error: { message: "Session not found" } });

  it("refuses to delete the account with a token whose session was signed out", async () => {
    signedOut();
    const supabase = createSupabaseMock();
    supabase.from.mockReturnValue(chainable({}));
    await expect(
      deleteMyAccount({ context: ctx(supabase), data: { confirm: "DELETE" } }),
    ).rejects.toThrow(/^Unauthorized/);
    expect(deleteUser).not.toHaveBeenCalled();
    expect(supabase.from).not.toHaveBeenCalled();
    expect(getUser).toHaveBeenCalledWith("live-token");
  });

  it("refuses to export with a token whose session was signed out", async () => {
    signedOut();
    const supabase = createSupabaseMock();
    supabase.from.mockReturnValue(chainable({ data: [] }));
    await expect(exportMyData({ context: ctx(supabase) })).rejects.toThrow(/^Unauthorized/);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("refuses when the token belongs to a different account than the claims", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "someone-else" } }, error: null });
    const supabase = createSupabaseMock();
    await expect(
      deleteMyAccount({ context: ctx(supabase), data: { confirm: "DELETE" } }),
    ).rejects.toThrow(/^Unauthorized/);
    expect(deleteUser).not.toHaveBeenCalled();
  });
});

describe("exportMyData, the Help chat", () => {
  it("exports the learner's conversations and messages with explicit columns, never staff internals or notes", async () => {
    const supabase = createSupabaseMock();
    supabase.from.mockImplementation((table: string) =>
      table === "profiles" ? chainable({ data: {} }) : chainable({ data: [] }),
    );
    const calls: Record<string, { method: string; args: unknown[] }[]> = {};
    supabaseAdminFrom.mockImplementation((table: string) => {
      calls[table] = [];
      return chainable({ data: [{ from: table }], error: null, count: 1 }, calls[table]);
    });
    getUserById.mockResolvedValue({ data: { user: { id: USER_ID, identities: [] } }, error: null });

    const result = await exportMyData({ context: ctx(supabase) });
    const tables = JSON.parse(result.tables);
    for (const table of ["support_conversations", "support_messages"]) {
      expect(tables[table], table).toEqual([{ from: table }]);
      expect(calls[table], table).toContainEqual({ method: "eq", args: ["user_id", USER_ID] });
      const select = calls[table]!.find((c) => c.method === "select")!.args[0] as string;
      expect(select, table).not.toBe("*");
      for (const internal of [
        "assigned_to",
        "ai_summary",
        "handoff_reason",
        "ai_facts",
        "author_id",
        "client_id",
      ]) {
        expect(select, `${table} must not select ${internal}`).not.toContain(internal);
      }
    }
    expect(Object.keys(tables)).not.toContain("support_notes");
    expect(supabaseAdminFrom).not.toHaveBeenCalledWith("support_notes");
  });
});

describe("exportMyData, rows the caller cannot read itself", () => {
  it("adds blocks made, filed reports, created teams, codes and memberships, scoped to this account", async () => {
    const supabase = createSupabaseMock();
    supabase.from.mockImplementation((table: string) =>
      table === "profiles" ? chainable({ data: {} }) : chainable({ data: [] }),
    );
    const calls: Record<string, { method: string; args: unknown[] }[]> = {};
    supabaseAdminFrom.mockImplementation((table: string) => {
      calls[table] = [];
      return chainable({ data: [{ from: table }], error: null, count: 1 }, calls[table]);
    });
    getUserById.mockResolvedValue({
      data: {
        user: {
          id: USER_ID,
          created_at: "2026-01-01T00:00:00Z",
          last_sign_in_at: "2026-11-01T00:00:00Z",
          identities: [{ provider: "email" }, { provider: "google" }],
        },
      },
      error: null,
    });

    const result = await exportMyData({ context: ctx(supabase) });
    const tables = JSON.parse(result.tables);
    for (const [table, column] of [
      // Only blocks this account made: who blocked it is never revealed.
      ["blocked_users", "blocker"],
      ["content_reports", "reporter"],
      ["teams", "created_by"],
      ["team_kicks", "user_id"],
      ["friend_invite_codes", "user_id"],
      ["buddy_members", "user_id"],
      ["lesson_completion_hits", "user_id"],
      ["weekly_xp_totals", "user_id"],
      ["heart_loss_reports", "user_id"],
      ["lesson_heart_settlements", "user_id"],
      ["hearts_pro_status", "user_id"],
    ]) {
      expect(tables[table], table).toEqual([{ from: table }]);
      expect(calls[table], table).toContainEqual({ method: "eq", args: [column, USER_ID] });
    }
    expect(tables.account).toEqual({
      created_at: "2026-01-01T00:00:00Z",
      last_sign_in_at: "2026-11-01T00:00:00Z",
      sign_in_methods: ["email", "google"],
    });
  });

  it("exports the first-run answers and the voice choices kept on the account record", async () => {
    const supabase = createSupabaseMock();
    supabase.from.mockImplementation((table: string) =>
      table === "profiles" ? chainable({ data: {} }) : chainable({ data: [] }),
    );
    supabaseAdminFrom.mockImplementation(() => chainable({ data: [], error: null, count: 0 }));
    const learner_profile = {
      name: "Sam",
      nativeLanguage: "en",
      country: "CA",
      showFlag: false,
      goal: "travel",
      level: "some",
      dailyMinutes: 10,
      ageRange: "25-34",
      interests: ["food", "music"],
      heardFrom: "friend",
      completedAt: "2026-11-06T00:00:00.000Z",
    };
    getUserById.mockResolvedValue({
      data: {
        user: {
          id: USER_ID,
          identities: [],
          user_metadata: { learner_profile, voices: { alphonso: { es: "aura-2-javier-es" } } },
        },
      },
      error: null,
    });
    const tables = JSON.parse((await exportMyData({ context: ctx(supabase) })).tables);
    expect(tables.preferences.learner_profile).toEqual(learner_profile);
    expect(tables.preferences.voices).toEqual({ alphonso: { es: "aura-2-javier-es" } });
  });

  it("fails rather than exporting without the account record", async () => {
    const supabase = createSupabaseMock();
    supabase.from.mockImplementation(() => chainable({ data: [] }));
    supabaseAdminFrom.mockImplementation(() => chainable({ data: [], error: null, count: 0 }));
    getUserById.mockResolvedValue({ data: { user: null }, error: { message: "down" } });
    await expect(exportMyData({ context: ctx(supabase) })).rejects.toThrow(/account/);
  });
});

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
    // buddy_pool_exclusions (20261013100100_buddy_pool_exclusion.sql) is a server-only operational flag that keeps
    // the App Review demo account out of stranger matching. It has no client policy and holds nothing the learner
    // typed or did; it goes with the account through ON DELETE CASCADE.
    "buddy_pool_exclusions",
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
    // staff_roles and staff_notes (20261113100000): staff-side records, not the learner's own data. staff_notes are
    // internal notes about a learner and stay out of their export by design; staff_roles is the staff allowlist.
    // Both are RLS-on, service-role only, and go with the account through ON DELETE CASCADE.
    "staff_roles",
    "staff_notes",
  ]);

  it("exports every table that has a user_id column", () => {
    const withUserId = createTableBlocks
      .filter(({ body }) => /^\s*user_id\s+uuid/im.test(body))
      .map(({ table }) => table)
      .filter((t) => !NOT_PERSONAL_DATA.has(t));

    const serviceScoped = accountModule.SERVICE_SCOPED_EXPORT_TABLES.map((t) => t.table as string);
    const missing = withUserId.filter(
      (t) => !exportTables.includes(t) && !serviceScoped.includes(t),
    );
    expect(missing).toEqual([]);
  });

  it("every reference to auth.users lets the account go (ON DELETE CASCADE or SET NULL)", () => {
    // deleteMyAccount and the service-role deletion both end in auth.admin.deleteUser(); a user-scoped table whose
    // foreign key neither cascades nor nulls would either block that delete or, worse, outlive it.
    // Fixed by a later ALTER instead of in its CREATE TABLE: admin_users.added_by (20261014100100, SET NULL).
    const fixedLater = new Map([
      ["admin_users", "20261014100100_admin_users_added_by_set_null.sql"],
    ]);
    const blocking = createTableBlocks.flatMap(({ table, body }) =>
      [...body.matchAll(/references\s+auth\.users[^,\n]*/gi)]
        .filter(([ref]) => !/on\s+delete\s+(cascade|set\s+null)/i.test(ref))
        .map(() => table),
    );
    expect(blocking.filter((t) => !fixedLater.has(t))).toEqual([]);
    for (const migration of fixedLater.values()) {
      expect(readFileSync(path.join(migrationsDir, migration), "utf8")).toMatch(
        /ON DELETE SET NULL/,
      );
    }
    // The minutes-spoken table (20261106100000) is one of them.
    expect(createTableBlocks.map(({ table }) => table)).toContain("speech_days");
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
      // Read with the service role, scoped to this account (the caller has no SELECT on these).
      ...accountModule.SERVICE_SCOPED_EXPORT_TABLES.map((t) => t.table),
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
    // The account is being deleted: its id is not written to the logs.
    expect(String(log.mock.calls[0][0])).not.toContain(USER_ID);
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

  /** A service client whose stored grant is "rt-1" and whose retry-queue inserts are recorded. */
  function adminWithStoredGrant(parkError: { message: string } | null = null) {
    const parked: unknown[] = [];
    const admin = {
      from: (table: string) =>
        table === "apple_revocation_pending"
          ? {
              insert: async (row: unknown) => {
                parked.push(row);
                return { error: parkError };
              },
            }
          : chainable({ data: { refresh_token: "rt-1" }, error: null }),
    };
    return { admin, parked };
  }

  it("queues the credential for a retry when Apple does not confirm the revocation", async () => {
    configureApple();
    const realFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => new Response("", { status: 503 })) as never;
    const { admin, parked } = adminWithStoredGrant();
    try {
      expect(await accountModule.revokeAppleGrantForUser(admin as never, USER_ID)).toBe("failed");
    } finally {
      globalThis.fetch = realFetch;
    }
    // Only the credential: nothing that ties the row to the account being deleted.
    expect(parked).toEqual([{ refresh_token: "rt-1" }]);
  });

  it("opens a sealed stored grant before revoking it, and parks it still sealed", async () => {
    const { randomBytes } = await import("node:crypto");
    const { sealToken } = await import("./token-sealing.server");
    const key = randomBytes(32).toString("base64");
    configureApple();
    vi.stubEnv("APPLE_TOKEN_ENCRYPTION_KEY", key);
    const { generateKeyPairSync } = await import("node:crypto");
    const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    vi.stubEnv("APPLE_PRIVATE_KEY", privateKey.export({ type: "pkcs8", format: "pem" }).toString());
    const sealed = sealToken("rt-1", key);
    const parked: unknown[] = [];
    const admin = {
      from: (table: string) =>
        table === "apple_revocation_pending"
          ? { insert: async (row: unknown) => (parked.push(row), { error: null }) }
          : chainable({ data: { refresh_token: sealed }, error: null }),
    };
    const realFetch = globalThis.fetch;
    const fetchMock = vi.fn(
      async (_url: unknown, _init?: RequestInit) => new Response("", { status: 503 }),
    );
    globalThis.fetch = fetchMock as never;
    try {
      expect(await accountModule.revokeAppleGrantForUser(admin as never, USER_ID)).toBe("failed");
    } finally {
      globalThis.fetch = realFetch;
    }
    expect(String(fetchMock.mock.calls[0][1]?.body)).toContain("token=rt-1");
    expect(parked).toEqual([{ refresh_token: sealed }]);
  });

  it("queues nothing when Apple confirms the revocation", async () => {
    const { generateKeyPairSync } = await import("node:crypto");
    const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    configureApple();
    vi.stubEnv("APPLE_PRIVATE_KEY", privateKey.export({ type: "pkcs8", format: "pem" }).toString());
    const realFetch = globalThis.fetch;
    const fetchMock = vi.fn(async () => new Response("", { status: 200 }));
    globalThis.fetch = fetchMock as never;
    const { admin, parked } = adminWithStoredGrant();
    try {
      expect(await accountModule.revokeAppleGrantForUser(admin as never, USER_ID)).toBe("revoked");
    } finally {
      globalThis.fetch = realFetch;
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(parked).toEqual([]);
  });

  it("still reports the failure, without throwing, when the retry cannot be queued", async () => {
    configureApple();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { admin } = adminWithStoredGrant({ message: "permission denied" });
    expect(await accountModule.revokeAppleGrantForUser(admin as never, USER_ID)).toBe("failed");
    expect(error.mock.calls.flat().join(" ")).toContain("could not queue a retry");
    error.mockRestore();
  });
});

describe("eraseSubscriberRecord", () => {
  const DELETED = "99999999-aaaa-4bbb-8ccc-000000000000";
  const realFetch = globalThis.fetch;
  let error: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("REVENUECAT_SECRET_API_KEY", "sk_test");
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.unstubAllEnvs();
    error.mockRestore();
  });

  /** The service client's retry list, recording what was queued. */
  function queue(result: { error: { message: string } | null } = { error: null }) {
    const queued: unknown[] = [];
    supabaseAdminFrom.mockImplementation((table: string) =>
      table === "revenuecat_erasure_pending"
        ? {
            upsert: async (row: unknown) => {
              queued.push(row);
              return result;
            },
          }
        : chainable({ data: null, error: null }),
    );
    return queued;
  }

  it("queues nothing and logs nothing when RevenueCat erased the record", async () => {
    globalThis.fetch = vi.fn(async () => new Response("{}", { status: 200 })) as never;
    const queued = queue();
    await accountModule.eraseSubscriberRecord(DELETED);
    expect(queued).toEqual([]);
    expect(error).not.toHaveBeenCalled();
  });

  it("queues the id for a retry when the erase fails, and keeps it out of the logs", async () => {
    globalThis.fetch = vi.fn(async () => new Response("{}", { status: 500 })) as never;
    const queued = queue();
    await accountModule.eraseSubscriberRecord(DELETED);
    expect(queued).toEqual([{ app_user_id: DELETED }]);
    expect(error.mock.calls.flat().join(" ")).not.toContain(DELETED);
  });

  it("cancels a renewing web subscription before erasing the record", async () => {
    vi.stubEnv("REVENUECAT_V2_SECRET_KEY", "sk_v2");
    vi.stubEnv("REVENUECAT_PROJECT_ID", "proj1");
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const order: string[] = [];
    globalThis.fetch = vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      order.push(`${method} ${String(url).replace("https://api.revenuecat.com", "")}`);
      if (String(url).includes("/v1/subscribers/") && method === "GET") {
        return Response.json({
          subscriber: {
            entitlements: {},
            subscriptions: { w: { store: "rc_billing", expires_date: future } },
          },
        });
      }
      if (String(url).endsWith("/subscriptions")) {
        return Response.json({
          items: [{ id: "sub_1", store: "rc_billing", auto_renewal_status: "will_renew" }],
        });
      }
      return new Response("{}", { status: 200 });
    }) as never;
    const queued = queue();
    await accountModule.eraseSubscriberRecord(DELETED);
    expect(queued).toEqual([]);
    const cancelAt = order.findIndex((o) => o.startsWith("POST") && o.endsWith("/actions/cancel"));
    expect(cancelAt).toBeGreaterThanOrEqual(0);
    expect(cancelAt).toBeLessThan(order.findIndex((o) => o.startsWith("DELETE")));
    expect(order.some((o) => o.startsWith("DELETE"))).toBe(true);
  });

  it("does not erase, and queues the id, when the web subscription could not be cancelled", async () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const methods: string[] = [];
    globalThis.fetch = vi.fn(async (_url: string, init?: RequestInit) => {
      methods.push(init?.method ?? "GET");
      return Response.json({
        subscriber: {
          entitlements: {},
          subscriptions: { w: { store: "rc_billing", expires_date: future } },
        },
      });
    }) as never;
    const queued = queue();
    await accountModule.eraseSubscriberRecord(DELETED);
    expect(queued).toEqual([{ app_user_id: DELETED }]);
    expect(methods).not.toContain("DELETE");
    expect(error.mock.calls.flat().join(" ")).not.toContain(DELETED);
  });

  it("with v2 configured, does not erase and queues the id when RevenueCat refuses the cancel", async () => {
    vi.stubEnv("REVENUECAT_V2_SECRET_KEY", "sk_v2");
    vi.stubEnv("REVENUECAT_PROJECT_ID", "proj1");
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const order: string[] = [];
    globalThis.fetch = vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      order.push(`${method} ${String(url)}`);
      if (String(url).includes("/v1/subscribers/") && method === "GET") {
        return Response.json({
          subscriber: {
            entitlements: {},
            subscriptions: { w: { store: "rc_billing", expires_date: future } },
          },
        });
      }
      if (String(url).endsWith("/subscriptions")) {
        return Response.json({
          items: [{ id: "sub_1", store: "rc_billing", auto_renewal_status: "will_renew" }],
        });
      }
      if (String(url).endsWith("/actions/cancel")) return new Response("{}", { status: 500 });
      return new Response("{}", { status: 200 });
    }) as never;
    const queued = queue();
    await accountModule.eraseSubscriberRecord(DELETED);
    expect(order.some((o) => o.startsWith("POST") && o.endsWith("/actions/cancel"))).toBe(true);
    expect(order.some((o) => o.startsWith("DELETE"))).toBe(false);
    expect(queued).toEqual([{ app_user_id: DELETED }]);
    expect(error.mock.calls.flat().join(" ")).not.toContain(DELETED);
  });

  it("queues the id when RevenueCat is not configured, instead of dropping it", async () => {
    vi.stubEnv("REVENUECAT_SECRET_API_KEY", "");
    const queued = queue();
    await accountModule.eraseSubscriberRecord(DELETED);
    expect(queued).toEqual([{ app_user_id: DELETED }]);
  });

  it("never throws, even when the retry list cannot be written", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error("network");
    }) as never;
    queue({ error: { message: "permission denied" } });
    await expect(accountModule.eraseSubscriberRecord(DELETED)).resolves.toBeUndefined();
    const logged = error.mock.calls.flat().join(" ");
    expect(logged).toContain("could not be queued");
    expect(logged).not.toContain(DELETED);
  });
});
