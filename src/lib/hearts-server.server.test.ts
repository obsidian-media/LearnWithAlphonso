import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { ProEntitlementStatus } from "./revenuecat-entitlement";
import { heartsUnlimited, type HeartsServerDeps, settleLessonHearts } from "./hearts-server.server";

const NOW = Date.parse("2026-11-05T12:00:00Z");

function deps(
  opts: {
    cached?: { pro: boolean; checked_at: string } | null;
    status?: ProEntitlementStatus;
    configured?: boolean;
    settle?: { data: unknown; error: { message: string } | null };
  } = {},
) {
  const upserts: Record<string, unknown>[] = [];
  const rpcs: { name: string; args: Record<string, unknown> }[] = [];
  const proStatus = vi.fn(async () => opts.status ?? "inactive");
  const d: HeartsServerDeps = {
    db: async () => ({
      from: () => ({
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: opts.cached ?? null, error: null }) }),
        }),
        upsert: async (row) => {
          upserts.push(row);
          return { error: null };
        },
      }),
      rpc: async (name, args) => {
        rpcs.push({ name, args });
        return opts.settle ?? { data: [{ hearts: 4, hearts_refill_at: null }], error: null };
      },
    }),
    rcConfig: () => (opts.configured === false ? null : { secretApiKey: "sk" }),
    proStatus,
    now: () => NOW,
  };
  return { d, upserts, rpcs, proStatus };
}

describe("heartsUnlimited (Alphonso Pro has unlimited hearts)", () => {
  it("reuses a fresh cached answer without asking RevenueCat", async () => {
    const t = deps({
      cached: { pro: true, checked_at: new Date(NOW - 59 * 60_000).toISOString() },
    });
    expect(await heartsUnlimited("u", t.d)).toBe(true);
    expect(t.proStatus).not.toHaveBeenCalled();
  });

  it("re-checks a stale 'not Pro' after ten minutes and caches the new answer", async () => {
    const t = deps({
      cached: { pro: false, checked_at: new Date(NOW - 11 * 60_000).toISOString() },
      status: "active",
    });
    expect(await heartsUnlimited("u", t.d)).toBe(true);
    expect(t.upserts[0]).toMatchObject({ user_id: "u", pro: true });
  });

  it("fails closed and caches nothing when RevenueCat is unavailable or not configured", async () => {
    const down = deps({ status: "unavailable" });
    expect(await heartsUnlimited("u", down.d)).toBe(false);
    expect(down.upserts).toHaveLength(0);
    const none = deps({ configured: false, status: "active" });
    expect(await heartsUnlimited("u", none.d)).toBe(false);
    expect(none.proStatus).not.toHaveBeenCalled();
  });
});

describe("settleLessonHearts", () => {
  const base = { userId: "u", sessionToken: "tok", misses: 2, sinceMs: NOW - 60_000 };

  it("settles from the server's misses with the token's hash and the signed session start", async () => {
    const t = deps();
    const out = await settleLessonHearts({ ...base, mode: "on" }, t.d);
    expect(out).toEqual({ hearts: 4, heartsRefillAt: null });
    expect(t.rpcs[0]).toEqual({
      name: "settle_lesson_hearts",
      args: {
        _user_id: "u",
        _token_hash: createHash("sha256").update("tok").digest("hex"),
        _misses: 2,
        _since: new Date(NOW - 60_000).toISOString(),
        _enforce: true,
        _pro: false,
      },
    });
  });

  it("shadow mode settles without charging", async () => {
    const t = deps();
    await settleLessonHearts({ ...base, mode: "shadow" }, t.d);
    expect(t.rpcs[0]!.args._enforce).toBe(false);
  });

  it("off skips the settlement entirely", async () => {
    const t = deps();
    expect(await settleLessonHearts({ ...base, mode: "off" }, t.d)).toBeNull();
    expect(t.rpcs).toHaveLength(0);
  });

  it("passes Pro so the settlement treats hearts as unlimited", async () => {
    const t = deps({ status: "active" });
    await settleLessonHearts({ ...base, mode: "on" }, t.d);
    expect(t.rpcs[0]!.args._pro).toBe(true);
  });

  it("a failed settlement returns null, so the saved lesson's own hearts stand", async () => {
    const t = deps({ settle: { data: null, error: { message: "boom" } } });
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await settleLessonHearts({ ...base, mode: "on" }, t.d)).toBeNull();
    err.mockRestore();
  });
});
