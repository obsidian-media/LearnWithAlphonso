import { authorizeStaff } from "../staff-authorize";
import type { Scope } from "../staff-scopes";

/**
 * Test harness for the console's server functions that keeps the REAL authorization in the loop.
 *
 * The other admin tests mock the middleware away, which is right for handler logic but cannot prove that a support
 * account calling an owner-only function directly is refused. Here `requireStaff(scope)` becomes a marker, and the
 * mocked `createServerFn` runs the real `authorizeStaff` (real scopes, real error messages) against a fake
 * staff table before the handler, in the same order the real chain does: middleware first, then input validation.
 *
 * Usage in a test file:
 *   vi.mock("./staff-middleware", async () => (await import("./__testutils__/staff-harness")).staffMiddlewareMock);
 *   vi.mock("@tanstack/react-start", async () => (await import("./__testutils__/staff-harness")).startMock);
 *   vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
 */
export type TestStaff = { role: string; scopes: string[]; disabled?: boolean };

export const staffTable: Record<string, TestStaff | undefined> = {};

/** Staff the fake allowlist knows about; call from beforeEach. */
export function setStaff(table: Record<string, TestStaff | undefined>) {
  for (const key of Object.keys(staffTable)) delete staffTable[key];
  Object.assign(staffTable, table);
}

function fakeStaffClient() {
  return {
    from(name: "admin_users" | "staff_roles") {
      let uid = "";
      const q = {
        select: () => q,
        eq: (_c: string, v: string) => {
          uid = v;
          return q;
        },
        maybeSingle: async () => {
          const row = staffTable[uid];
          if (name === "admin_users") {
            return { data: row ? { user_id: uid } : null, error: null };
          }
          return {
            data: row
              ? {
                  user_id: uid,
                  role: row.role,
                  scopes: row.scopes,
                  disabled_at: row.disabled ? "2026-01-01" : null,
                }
              : null,
            error: null,
          };
        },
      };
      return q;
    },
  } as never;
}

type StaffMarker = { __staff: true; scope?: Scope };

export const staffMiddlewareMock = {
  requireStaff: (scope?: Scope): StaffMarker => ({ __staff: true, scope }),
};

export const startMock = {
  createServerFn: () => {
    let validator: ((d: unknown) => unknown) | undefined;
    let middleware: unknown[] = [];
    const builder = {
      middleware: (m: unknown[]) => {
        middleware = m;
        return builder;
      },
      inputValidator: (v: (d: unknown) => unknown) => {
        validator = v;
        return builder;
      },
      handler:
        (fn: (opts: { data: unknown; context: Record<string, unknown> }) => unknown) =>
        async (opts: { data?: unknown; context?: Record<string, unknown> } = {}) => {
          let context = opts.context ?? {};
          for (const m of middleware) {
            if ((m as StaffMarker)?.__staff) {
              const { staffRole, staffScopes } = await authorizeStaff({
                client: fakeStaffClient(),
                userId: String(context.userId ?? ""),
                claims: { aal: "aal2" },
                scope: (m as StaffMarker).scope,
              });
              context = { ...context, staffRole, staffScopes };
            }
          }
          const data = validator ? validator(opts.data) : opts.data;
          return fn({ data, context });
        },
    };
    return builder;
  },
};
