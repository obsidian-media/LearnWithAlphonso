import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
const rpc = vi.fn();
const createClient = vi.fn().mockReturnValue({ auth: { getUser }, rpc });
vi.mock("@supabase/supabase-js", () => ({ createClient }));

const { consumeQuota, DAILY_LIMITS } = await import("./ai-quota.server");

function req(headers: Record<string, string> = {}) {
  return new Request("https://example.com/api/chat", { headers });
}

beforeEach(() => {
  getUser.mockReset();
  rpc.mockReset();
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

  it("rejects when the per-minute burst limit is exceeded", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    rpc.mockResolvedValueOnce({ data: [{ allowed: false }], error: null }); // consume_ai_rate_limit
    const result = await consumeQuota(req({ Authorization: "Bearer tok" }), "chat");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(429);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("rejects when the daily quota is exhausted", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    rpc
      .mockResolvedValueOnce({ data: [{ allowed: true }], error: null }) // rate limit ok
      .mockResolvedValueOnce({ data: [{ allowed: false, used: 60 }], error: null }); // daily cap hit
    const result = await consumeQuota(req({ Authorization: "Bearer tok" }), "chat");
    expect(result).toEqual({
      ok: false,
      status: 429,
      message: "Daily CHAT limit reached (60/day). Try again tomorrow.",
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

  it.each(Object.keys(DAILY_LIMITS))("consume_ai_rate_limit handles %s", (kind) => {
    expect(latestBodyOf("consume_ai_rate_limit")).toContain(`WHEN '${kind}' THEN`);
  });
});
