import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { authorizeStaff } from "./staff-authorize";
import { readOpsHealth } from "./ops-health.server";
import { navItemsFor } from "./staff-nav";
import { SECOND_FACTOR_REQUIRED_MESSAGE, UNAUTHORIZED_MESSAGE } from "./admin-auth";
import type { SupabaseClient } from "@supabase/supabase-js";

const strip = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const fn = strip(readFileSync("src/lib/staff-health.functions.ts", "utf8"));

/** A fake service-role client: admin_users membership and a staff_roles row. */
function client(opts: { admin: boolean; role?: string; scopes?: string[] }) {
  return {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () =>
            table === "admin_users"
              ? { data: opts.admin ? { user_id: "u" } : null, error: null }
              : {
                  data: opts.role
                    ? { role: opts.role, scopes: opts.scopes ?? [], disabled_at: null }
                    : null,
                  error: null,
                },
        }),
      }),
    }),
  } as unknown as SupabaseClient;
}

describe("the System health server function is staff-only", () => {
  it("has two POST server functions (Home's event strip and the Health screen), each gated by requireStaff('numbers.read') and the system_health limit", () => {
    expect(fn.match(/createServerFn\(/g)).toHaveLength(2);
    expect(fn.match(/\.middleware\(\[requireStaff\("numbers\.read"\)\]\)/g)).toHaveLength(2);
    expect(fn.match(/consumeStaffLimit\([^)]*STAFF_LIMITS\.system_health\)/g)).toHaveLength(2);
    expect(fn).toMatch(/readOpsHealth\(context\.supabaseAdmin\)/);
    expect(fn).toMatch(/readHealth\(context\.supabaseAdmin, process\.env\)/);
    // no other scope can reach it: nothing in the file asks for a weaker gate
    expect(fn).not.toMatch(/requireStaff\(\)/);
  });

  const call = (c: SupabaseClient, claims: { aal?: unknown } = { aal: "aal2" }) =>
    authorizeStaff({ client: c, userId: "u", claims, scope: "numbers.read", requireAal2: "true" });

  it("refuses a user who is not staff, a staff member without the scope, and a missing second factor", async () => {
    await expect(call(client({ admin: false }))).rejects.toThrow(UNAUTHORIZED_MESSAGE);
    await expect(call(client({ admin: true, role: "support", scopes: [] }))).rejects.toThrow(
      "Forbidden: missing scope numbers.read",
    );
    await expect(call(client({ admin: true }), { aal: "aal1" })).rejects.toThrow(
      SECOND_FACTOR_REQUIRED_MESSAGE,
    );
  });

  it("lets the owner and a staff member granted numbers.read through", async () => {
    await expect(call(client({ admin: true }))).resolves.toBeDefined();
    await expect(
      call(client({ admin: true, role: "support", scopes: ["numbers.read"] })),
    ).resolves.toBeDefined();
  });

  it("the nav item shows only with numbers.read", () => {
    expect(navItemsFor(["numbers.read"]).some((i) => i.key === "health")).toBe(true);
    expect(navItemsFor(["users.read"]).some((i) => i.key === "health")).toBe(false);
  });

  it("the page does not touch the database or a server-only module itself", () => {
    for (const f of [
      "admin/routes/health.tsx",
      "src/components/console/health/HealthScreen.tsx",
      "src/components/console/health/healthApi.ts",
    ]) {
      const src = strip(readFileSync(f, "utf8"));
      expect(src, f).not.toMatch(/supabaseAdmin|process\.env|from "[^"]*\.server"/);
    }
  });
});

describe("readOpsHealth", () => {
  const db = (summary: unknown[], latest: unknown[]) =>
    ({
      rpc: async () => ({ data: summary, error: null }),
      from: () => ({
        select: () => ({ order: () => ({ limit: async () => ({ data: latest, error: null }) }) }),
      }),
    }) as unknown as SupabaseClient;

  it("lists every known event even with no rows, with status from the thresholds, worst first", async () => {
    const r = await readOpsHealth(
      db(
        [
          {
            event: "hearts_settlement_failed",
            count_1h: 1,
            count_24h: 6,
            count_7d: 9,
            last_at: "2026-11-20T10:00:00Z",
          },
        ],
        [
          {
            id: 7,
            event: "hearts_settlement_failed",
            source: "web",
            user_id: "u1",
            detail: { fn: "x" },
            created_at: "2026-11-20T10:00:00Z",
          },
        ],
      ),
    );
    expect(r.events[0]).toMatchObject({
      event: "hearts_settlement_failed",
      count24h: 6,
      count7d: 9,
      status: "red",
    });
    expect(r.events.find((e) => e.event === "lesson_result_finalize_failed")).toMatchObject({
      count24h: 0,
      lastAt: null,
      status: "green",
    });
    expect(r.latest).toHaveLength(1);
  });
});

describe("the Health route gate", () => {
  const route = strip(readFileSync("admin/routes/health.tsx", "utf8"));

  it("asks for numbers.read in the loader, shows the forbidden card without it, and reads only through staffGetHealth", () => {
    expect(route).toContain('me.scopes.includes("numbers.read")');
    expect(route).toContain("ForbiddenCard");
    expect(route).toContain('scope="numbers.read"');
    expect(route).toContain("staffGetHealth");
    expect(route).toContain('redirect({ to: "/signin" })');
  });

  it("is a rebuilt screen: the old view is gone and the page is no longer in the legacy list", () => {
    expect(existsSync("src/components/staff/SystemHealthView.tsx")).toBe(false);
    expect(readFileSync("src/lib/console-no-hardcoded-data.test.ts", "utf8")).not.toContain(
      '"health.tsx"',
    );
    expect(readFileSync("admin/routeTree.gen.ts", "utf8")).toContain("'/health'");
  });
});
