import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { isAdminUser, UNAUTHORIZED_MESSAGE } from "./admin-auth";

/** Minimal PostgREST-shaped stub: .from().select().eq().maybeSingle() */
function clientReturning(result: { data: unknown; error: unknown }) {
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    maybeSingle: vi.fn(async () => result),
  };
  return { from: vi.fn(() => chain) };
}

describe("isAdminUser", () => {
  it("is true for a user present in admin_users", async () => {
    const client = clientReturning({ data: { user_id: "u1" }, error: null });
    expect(await isAdminUser(client as never, "u1")).toBe(true);
  });

  it("is false for a user absent from admin_users", async () => {
    // The ordinary case: every learner in the product hits this branch.
    const client = clientReturning({ data: null, error: null });
    expect(await isAdminUser(client as never, "u2")).toBe(false);
  });

  it("is false when the query errors", async () => {
    // Fail closed. An unreachable database must not mean "everyone is an
    // admin"; a transient PostgREST error is exactly when an attacker
    // would like the opposite.
    const client = clientReturning({ data: null, error: { message: "boom" } });
    expect(await isAdminUser(client as never, "u1")).toBe(false);
  });

  it("is false for an empty user id without querying at all", async () => {
    // An empty subject claim must never match a row, and must not reach
    // the database where a permissive filter could return the first row.
    const client = clientReturning({ data: { user_id: "anyone" }, error: null });
    expect(await isAdminUser(client as never, "")).toBe(false);
    expect(client.from).not.toHaveBeenCalled();
  });

  it("queries admin_users by user_id, not by anything the caller controls", async () => {
    // Pins the column and table: a filter on an email or a claim would
    // make the allowlist depend on something a user can change about
    // themselves. The id comes from a validated token and cannot be.
    const client = clientReturning({ data: { user_id: "u1" }, error: null });
    await isAdminUser(client as never, "u1");
    expect(client.from).toHaveBeenCalledWith("admin_users");
    const chain = client.from.mock.results[0].value;
    expect(chain.eq).toHaveBeenCalledWith("user_id", "u1");
  });
});

// requireAdmin's whole claim is that a non-admin cannot tell their
// refusal apart from an ordinary auth failure. It threw a BARE
// "Unauthorized" while every requireSupabaseAuth failure is suffixed
// ("Unauthorized: Invalid token", "Unauthorized: No authorization header
// provided", ...) -- so a learner with a VALID token got a string no bad
// token can produce, which is precisely the oracle the comment claimed
// to avoid. Nothing asserted the parity the comment asserted.
describe("the admin refusal is indistinguishable from an auth failure", () => {
  const authSource = readFileSync("src/integrations/supabase/auth-middleware.ts", "utf8");
  const authMessages = [...authSource.matchAll(/new Error\("(Unauthorized[^"]*)"\)/g)].map(
    (m) => m[1],
  );

  it("finds the auth middleware's messages (guards a silently-empty scan)", () => {
    expect(authMessages.length).toBeGreaterThan(2);
  });

  it("reuses one of them verbatim rather than inventing its own", () => {
    expect(authMessages).toContain(UNAUTHORIZED_MESSAGE);
  });

  it("is the string requireAdmin actually throws", () => {
    const middleware = readFileSync("src/lib/admin-middleware.ts", "utf8");
    // Pins the import, not a copy: a literal here would drift the moment
    // auth-middleware's wording changed, and the drift would be silent.
    expect(middleware).toContain("UNAUTHORIZED_MESSAGE");
    expect(middleware).not.toMatch(/throw new Error\("Unauthorized/);
  });
});

// The spec names this as the one test that proves the central claim of
// the whole design -- and the one most likely to be written as a test
// that cannot fail. It asserts on a real PostgREST response, not on a
// stub: an empty result and a refusal look identical from a mock, and
// only one of them means the table is safe.
describe("admin_users is unreadable by a non-service client", () => {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  // Set by the CI step that runs this file against the real project,
  // AFTER migrations are pushed. Without it, "CI has them so CI runs it"
  // was simply false: `bun run test` runs in lint-and-typecheck, which
  // sets no Supabase env at all, and the only job that sets any uses
  // PLACEHOLDER values for Playwright. This test therefore never ran
  // anywhere -- the purest form of a test that cannot fail, guarding
  // the single most important claim in the design.
  const required = process.env.ADMIN_RLS_TEST_REQUIRED === "1";

  it("refuses to be silently skipped where it is required", () => {
    // The skip below is fine on a laptop and unacceptable in CI. This
    // assertion is what makes the difference observable instead of
    // trusting a comment.
    if (required) expect(Boolean(url && anonKey)).toBe(true);
    else expect(required).toBe(false);
  });

  it.skipIf(!url || !anonKey)("returns no rows to an anon client", async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const client = createClient(url!, anonKey!);
    const { data, error } = await client.from("admin_users").select("user_id");

    // A row is the failure this exists to catch.
    expect(data ?? []).toHaveLength(0);

    if (error) {
      // "does not exist" is NOT accepted: that is also what a project
      // where the migration was never applied returns, so accepting it
      // would let this pass green against a database with no
      // admin_users table at all -- proving nothing while looking like
      // proof. Only an actual refusal counts.
      expect(error.message).toMatch(/permission denied|not authorized|insufficient/i);
      expect(error.message).not.toMatch(/does not exist|could not find|not find the table/i);
    }
  });
});
