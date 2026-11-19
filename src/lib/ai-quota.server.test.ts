import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
const rpc = vi.fn();
// is_restricted (the ban check verifyAuth makes) must go through the SERVICE-ROLE client: signed-in users may not
// execute it. The learner's own client therefore throws if it is ever asked, and the queued answers on `rpc` below
// are only the quota functions, in order.
const banRpc = vi.fn();
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { rpc: (fn: string, args: unknown) => banRpc(fn, args) },
}));
const createClient = vi.fn().mockReturnValue({
  auth: { getUser },
  rpc: (fn: string, args: unknown) => {
    if (fn === "is_restricted") throw new Error("is_restricted must not use the learner's client");
    return rpc(fn, args);
  },
});
vi.mock("@supabase/supabase-js", () => ({ createClient }));

// The monthly cost cap has its own tests (ai-monthly-cap.*.test.ts); here it must not eat the mocked rpc sequence.
const monthlyCapRefusal = vi.fn(async (..._args: unknown[]): Promise<unknown> => null);
vi.mock("./ai-monthly-cap.server", () => ({
  monthlyCapRefusal,
  USAGE_UNVERIFIED_MESSAGE: "Could not verify your usage. Try again shortly.",
}));

const { consumeQuota, DAILY_LIMITS } = await import("./ai-quota.server");

function req(headers: Record<string, string> = {}) {
  return new Request("https://example.com/api/chat", { headers });
}

beforeEach(() => {
  getUser.mockReset();
  rpc.mockReset();
  banRpc.mockReset().mockResolvedValue({ data: false, error: null });
  monthlyCapRefusal.mockClear();
  createClient.mockClear();
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_PUBLISHABLE_KEY = "publishable-key";
});

describe("consumeQuota", () => {
  it("rejects a request without a bearer token", async () => {
    const result = await consumeQuota(req(), "chat");
    expect(result).toEqual({ ok: false, status: 401, message: "Sign in to use AI features." });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("fails closed when Supabase env vars aren't configured", async () => {
    delete process.env.SUPABASE_URL;
    const result = await consumeQuota(req({ Authorization: "Bearer tok" }), "chat");
    expect(result).toEqual({ ok: false, status: 500, message: "Server not configured." });
  });

  it("rejects when the session token doesn't resolve to a user", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    const result = await consumeQuota(req({ Authorization: "Bearer bad" }), "chat");
    expect(result).toEqual({
      ok: false,
      status: 401,
      message: "Session expired — sign in again.",
    });
  });

  it("rejects when the per-minute burst limit is exceeded, with the next-minute reset", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    rpc.mockResolvedValueOnce({ data: [{ allowed: false }], error: null }); // consume_ai_rate_limit
    const result = await consumeQuota(
      req({ Authorization: "Bearer tok" }),
      "chat",
      new Date("2026-10-07T18:00:40Z"),
    );
    expect(result).toEqual({
      ok: false,
      status: 429,
      message: "Too many requests — slow down and try again in a minute.",
      code: "quota-exceeded",
      resetsAt: "2026-10-07T18:01:00.000Z",
    });
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("rejects when the daily quota is exhausted, with the next UTC midnight as the reset", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    rpc
      .mockResolvedValueOnce({ data: [{ allowed: true }], error: null }) // rate limit ok
      .mockResolvedValueOnce({ data: [{ allowed: false, used: 60 }], error: null }); // daily cap hit
    const result = await consumeQuota(
      req({ Authorization: "Bearer tok" }),
      "chat",
      new Date("2026-10-07T18:00:00Z"),
    );
    expect(result).toEqual({
      ok: false,
      status: 429,
      message: "Daily CHAT limit reached (60/day). Try again tomorrow.",
      code: "quota-exceeded",
      resetsAt: "2026-10-08T00:00:00.000Z",
    });
  });

  it("succeeds and reports usage when under both limits", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    rpc
      .mockResolvedValueOnce({ data: [{ allowed: true }], error: null })
      .mockResolvedValueOnce({ data: [{ allowed: true, used: 5 }], error: null });
    const result = await consumeQuota(req({ Authorization: "Bearer tok" }), "chat");
    expect(result).toEqual({ ok: true, used: 5, limit: 60 });
  });

  it("fails closed when the rate-limit RPC itself errors", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    rpc.mockResolvedValueOnce({ data: null, error: new Error("db down") });
    const result = await consumeQuota(req({ Authorization: "Bearer tok" }), "tts");
    expect(result).toEqual({
      ok: false,
      status: 500,
      message: "Could not verify your usage.",
    });
  });
});

describe("every QuotaKind is known to the database functions", () => {
  // The TypeScript DAILY_LIMITS map is documentation; the real cap lives in
  // consume_ai_quota / consume_ai_rate_limit, which resolve their limit with a
  // CASE over `_kind` and REFUSE the call when it falls through to NULL.
  //
  // That refusal is indistinguishable from "quota exhausted" at every call
  // site, and /api/grade-translation treats exhausted quota as "no AI opinion"
  // and carries on with the local verdict -- so adding a kind here and
  // forgetting the migration does not error, does not log, and silently
  // disables the feature the kind exists for. That is exactly what happened to
  // "translate" (fixed in 20260926020000). This test is the guard.
  // Resolved from this file rather than from process.cwd(): a cwd-relative
  // read is a dependency on how the runner happens to be invoked, and this
  // test failed once in a full-suite run while passing in isolation.
  const MIGRATIONS = path.resolve(import.meta.dirname, "../../supabase/migrations");
  const migrations = fs.readdirSync(MIGRATIONS).sort();

  function latestBodyOf(fn: string): string {
    // Later migrations CREATE OR REPLACE the earlier definition, so only the
    // last file defining the function describes what is actually live.
    const defining = migrations.filter((f) =>
      fs.readFileSync(path.join(MIGRATIONS, f), "utf8").includes(`FUNCTION public.${fn}(`),
    );
    expect(defining.length).toBeGreaterThan(0);
    return fs.readFileSync(path.join(MIGRATIONS, defining[defining.length - 1]!), "utf8");
  }

  it.each(Object.keys(DAILY_LIMITS))("consume_ai_quota handles %s", (kind) => {
    expect(latestBodyOf("consume_ai_quota")).toContain(`WHEN '${kind}' THEN`);
  });

  it.each(Object.entries(DAILY_LIMITS))(
    "consume_ai_quota's %s limit matches DAILY_LIMITS (%i)",
    (kind, limit) => {
      // The displayed limit is what the learner reads in the 429 message; a drift tells them the wrong number.
      expect(latestBodyOf("consume_ai_quota")).toMatch(
        new RegExp(`WHEN '${kind}' THEN ${limit}(?![0-9])`),
      );
    },
  );

  it("Pro learners' Hector turns have their own daily allowance, separate from free Practice", () => {
    expect(DAILY_LIMITS.hector).toBe(150);
    expect(latestBodyOf("consume_ai_rate_limit")).toMatch(/WHEN 'hector' THEN 10(?!\d)/);
  });

  it.each(Object.keys(DAILY_LIMITS))("consume_ai_rate_limit handles %s", (kind) => {
    expect(latestBodyOf("consume_ai_rate_limit")).toContain(`WHEN '${kind}' THEN`);
  });
});

describe("verifyAuth", () => {
  it("returns the caller's user id", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    const { verifyAuth } = await import("./ai-quota.server");
    const r = await verifyAuth(req({ Authorization: "Bearer tok" }));
    expect(r.ok && r.userId).toBe("u1");
  });
});

describe("verifyAuth refuses a banned learner", () => {
  const authed = () => getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });

  it("asks the SERVICE-ROLE client, never the learner's own, and the learner's client is never given the call", async () => {
    authed();
    const { verifyAuth } = await import("./ai-quota.server");
    const r = await verifyAuth(req({ Authorization: "Bearer tok" }));
    // the learner's client throws on is_restricted, so an ok result proves it was not used for it
    expect(r.ok).toBe(true);
    expect(banRpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls.some((c) => c[0] === "is_restricted")).toBe(false);
  });

  it("asks is_restricted for this user and the ban kind", async () => {
    authed();
    const { verifyAuth } = await import("./ai-quota.server");
    await verifyAuth(req({ Authorization: "Bearer tok" }));
    expect(banRpc).toHaveBeenCalledWith("is_restricted", { p_user: "u1", p_kind: "ban" });
  });

  it("a banned learner gets 403 account_suspended, the same string the Edge Functions send", async () => {
    authed();
    banRpc.mockResolvedValue({ data: true, error: null });
    const { verifyAuth } = await import("./ai-quota.server");
    expect(await verifyAuth(req({ Authorization: "Bearer tok" }))).toEqual({
      ok: false,
      status: 403,
      message: "account_suspended",
    });
    const edge = fs.readFileSync(
      path.resolve(import.meta.dirname, "../../supabase/functions/_shared/account-status.ts"),
      "utf8",
    );
    expect(edge).toContain('ACCOUNT_SUSPENDED_ERROR = "account_suspended"');
  });

  it("consumeQuota stops a banned learner before any quota is spent", async () => {
    authed();
    banRpc.mockResolvedValue({ data: true, error: null });
    const result = await consumeQuota(req({ Authorization: "Bearer tok" }), "chat");
    expect(result).toMatchObject({ ok: false, status: 403, message: "account_suspended" });
    expect(rpc).not.toHaveBeenCalled();
    expect(monthlyCapRefusal).not.toHaveBeenCalled();
  });

  it("an unreadable status check is a 503, not a pass", async () => {
    authed();
    banRpc.mockResolvedValue({ data: null, error: { message: "down" } });
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const { verifyAuth } = await import("./ai-quota.server");
    expect(await verifyAuth(req({ Authorization: "Bearer tok" }))).toMatchObject({
      ok: false,
      status: 503,
    });
    logged.mockRestore();
  });

  it("an active learner passes", async () => {
    authed();
    const { verifyAuth } = await import("./ai-quota.server");
    expect(await verifyAuth(req({ Authorization: "Bearer tok" }))).toMatchObject({
      ok: true,
      userId: "u1",
    });
  });
});

describe("the monthly cap's unverified refusal", () => {
  it("passes the learner's id on and answers 503 without spending any quota", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    monthlyCapRefusal.mockResolvedValue({ kind: "unverified" });
    const result = await consumeQuota(req({ Authorization: "Bearer tok" }), "chat");
    expect(result).toEqual({
      ok: false,
      status: 503,
      message: "Could not verify your usage. Try again shortly.",
    });
    expect(monthlyCapRefusal.mock.calls[0]![4]).toBe("u1");
    expect(rpc).not.toHaveBeenCalled();
  });
});
