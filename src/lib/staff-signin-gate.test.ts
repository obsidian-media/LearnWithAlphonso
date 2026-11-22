import { beforeEach, describe, expect, it, vi } from "vitest";
import { SECOND_FACTOR_REQUIRED_MESSAGE, UNAUTHORIZED_MESSAGE } from "./admin-auth";

/**
 * The sign-in page proves who someone is; it never grants anything. Whatever the page does, a session that has not
 * passed the second factor (AAL2) must not reach any console page. Every page loads through a staff server function,
 * and every one of those goes through the REAL requireStaff middleware, which is what runs here: only the framework
 * wrapper (createServerFn / createMiddleware), the token check and the database are faked, so the AAL decision in
 * authorizeStaff is the production code. The token is an aal1 one: a password with no code.
 */
type ServerStep = (o: { next: (o: { context: unknown }) => unknown; context: unknown }) => unknown;

const state = vi.hoisted(() => ({
  claims: { aal: "aal1" } as { aal?: string },
  profileReads: 0,
  staff: new Set<string>(),
}));

vi.mock("@tanstack/react-start", () => ({
  createMiddleware: () => {
    const mw: { steps: unknown[]; middleware: unknown; server: unknown } = {
      steps: [],
      middleware: undefined,
      server: undefined,
    };
    mw.middleware = (deps: unknown[]) => {
      mw.steps.push(...(deps as { steps: unknown[] }[]).flatMap((d) => d.steps));
      return mw;
    };
    mw.server = (fn: ServerStep) => {
      mw.steps.push({ run: fn });
      return mw;
    };
    return mw;
  },
  createServerFn: () => {
    let steps: unknown[] = [];
    let validator: ((d: unknown) => unknown) | undefined;
    const builder = {
      middleware: (list: { steps: unknown[] }[]) => {
        steps = list.flatMap((m) => m.steps);
        return builder;
      },
      inputValidator: (v: (d: unknown) => unknown) => {
        validator = v;
        return builder;
      },
      handler:
        (fn: (o: { data: unknown; context: unknown }) => unknown) =>
        async (opts: { data?: unknown } = {}) => {
          // Run every middleware step in order, each handing its context to the next; the handler is the last.
          const chain = async (i: number, context: unknown): Promise<unknown> => {
            const step = steps[i] as { run?: ServerStep; auth?: true } | undefined;
            if (!step) return fn({ data: validator ? validator(opts.data) : opts.data, context });
            if (step.auth) {
              return chain(i + 1, {
                userId: "u-staff",
                claims: state.claims,
                accessToken: "token",
              });
            }
            return step.run!({
              context,
              next: ({ context: c }) => chain(i + 1, c),
            });
          };
          return chain(0, {});
        },
    };
    return builder;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({
  requireSupabaseAuth: { steps: [{ auth: true }] },
}));
vi.mock("./live-session.server", () => ({ requireLiveSession: async () => undefined }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from(table: string) {
      let uid = "";
      const q = {
        select: () => q,
        eq: (_c: string, v: string) => {
          uid = v;
          return q;
        },
        maybeSingle: async () => {
          if (table === "profiles") {
            state.profileReads += 1;
            return { data: { display_name: "Staff" }, error: null };
          }
          if (table === "admin_users") {
            return { data: state.staff.has(uid) ? { user_id: uid } : null, error: null };
          }
          return { data: null, error: null }; // staff_roles: no row means an owner
        },
      };
      return q;
    },
  },
}));

const { adminWhoAmI } = (await import("./admin.functions")) as unknown as {
  adminWhoAmI: () => Promise<{ userId: string; role: string }>;
};

beforeEach(() => {
  state.claims = { aal: "aal1" };
  state.profileReads = 0;
  state.staff = new Set(["u-staff"]);
  delete process.env.ADMIN_REQUIRE_AAL2;
});

describe("a session without the second factor cannot reach any console page", () => {
  it("adminWhoAmI refuses an aal1 token with the second-factor message and never runs the handler", async () => {
    await expect(adminWhoAmI()).rejects.toThrow(SECOND_FACTOR_REQUIRED_MESSAGE);
    expect(state.profileReads).toBe(0);
  });

  it("still refuses when ADMIN_REQUIRE_AAL2 is set to anything but the exact opt-out", async () => {
    for (const v of ["true", "", "0", "FALSE", "no"]) {
      process.env.ADMIN_REQUIRE_AAL2 = v;
      await expect(adminWhoAmI(), v).rejects.toThrow(SECOND_FACTOR_REQUIRED_MESSAGE);
    }
  });

  it("a token with no assurance claim at all is refused the same way", async () => {
    state.claims = {};
    await expect(adminWhoAmI()).rejects.toThrow(SECOND_FACTOR_REQUIRED_MESSAGE);
  });

  it("the same account with an aal2 token is let in (so the refusal above is the second factor, not the setup)", async () => {
    state.claims = { aal: "aal2" };
    const me = await adminWhoAmI();
    expect(me.userId).toBe("u-staff");
    expect(state.profileReads).toBe(1);
  });

  it("someone who is not staff is told nothing about a second factor, whatever their token", async () => {
    state.staff = new Set();
    await expect(adminWhoAmI()).rejects.toThrow(new RegExp(`^${UNAUTHORIZED_MESSAGE}$`));
    expect(state.profileReads).toBe(0);
  });
});
