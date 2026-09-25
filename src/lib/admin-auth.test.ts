import { describe, expect, it, vi } from "vitest";
import { isAdminUser } from "./admin-auth";

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

// The spec names this as the one test that proves the central claim of
// the whole design -- and the one most likely to be written as a test
// that cannot fail. It asserts on a real PostgREST response, not on a
// stub: an empty result and a refusal look identical from a mock, and
// only one of them means the table is safe.
describe("admin_users is unreadable by a non-service client", () => {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_PUBLISHABLE_KEY;

  // Skipped rather than failed without credentials: a red suite on every
  // machine that lacks env vars gets muted, and a muted test is worse
  // than a skipped one. CI has them, so CI runs it.
  it.skipIf(!url || !anonKey)("returns no rows to an anon client", async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const client = createClient(url!, anonKey!);
    const { data, error } = await client.from("admin_users").select("user_id");
    // RLS with zero policies yields an empty set for a role that holds
    // the SELECT grant; we REVOKEd the grant too, so PostgREST refuses
    // outright. Either outcome is safe. A row is not.
    expect(data ?? []).toHaveLength(0);
    if (error) expect(error.message).toMatch(/permission denied|does not exist|not find/i);
  });
});
