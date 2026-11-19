import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  MONTHLY_CAP_DEFAULTS as WEB_DEFAULTS,
  monthlyCapConfig as webConfig,
} from "./ai-monthly-cap";
import {
  MONTHLY_CAP_DEFAULTS,
  monthlyCapAllows,
  monthlyCapConfig,
} from "../../supabase/functions/_shared/ai-monthly-cap";
import { makeTranslateQuotaCheck } from "../../supabase/functions/_shared/ai-quota";

// The Edge Functions' copy of the monthly cap (supabase/functions/_shared/ai-monthly-cap.ts), run from here because
// the repo's CI runs this suite; the module has no Deno-only imports at load time.

const USD = 1_000_000;
const noEnv = () => undefined;

type Client = Parameters<typeof monthlyCapAllows>[0];
const month = (micro: number | string, uid = "u1") =>
  ({
    rpc: vi.fn().mockResolvedValue({ data: [{ uid, month_micro: micro }], error: null }),
  }) as unknown as Client;
const failing = (error: { message: string; code?: string }, userId: string | null = "u1") =>
  ({
    rpc: vi.fn().mockResolvedValue({ data: null, error }),
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: userId ? { id: userId } : null } }),
    },
  }) as unknown as Client;
const pro = (v: boolean) => ({ isPro: vi.fn().mockResolvedValue(v), env: noEnv });

describe("the Edge copy keeps the web defaults and rules", () => {
  it("defaults and config parsing agree with the web module", () => {
    expect(MONTHLY_CAP_DEFAULTS).toEqual(WEB_DEFAULTS);
    for (const env of [
      {},
      {
        AI_MONTHLY_CAP_FREE_USD: "5",
        AI_MONTHLY_CAP_PRO_USD: "20",
        AI_MONTHLY_CAP_WARN_PERCENT: "50",
      },
      { AI_MONTHLY_CAP_FREE_USD: "nope", AI_MONTHLY_CAP_PRO_USD: "1" },
      { AI_MONTHLY_CAP_ENABLED: "false" },
    ]) {
      expect(monthlyCapConfig((k) => (env as Record<string, string>)[k])).toEqual(webConfig(env));
    }
  });
});

describe("monthlyCapAllows", () => {
  it("allows below the free ceiling without asking about Pro", async () => {
    const deps = pro(false);
    expect(await monthlyCapAllows(month(1 * USD), deps)).toBe(true);
    expect(deps.isPro).not.toHaveBeenCalled();
  });
  it("blocks a free learner at the free ceiling and lets a Pro learner through to the Pro one", async () => {
    expect(await monthlyCapAllows(month(2 * USD), pro(false))).toBe(false);
    expect(await monthlyCapAllows(month(5 * USD), pro(true))).toBe(true);
    expect(await monthlyCapAllows(month(8 * USD), pro(true))).toBe(false);
  });
  it("switched off: nothing is read", async () => {
    const c = month(100 * USD);
    expect(
      await monthlyCapAllows(c, {
        isPro: async () => false,
        env: (k) => (k === "AI_MONTHLY_CAP_ENABLED" ? "false" : undefined),
      }),
    ).toBe(true);
    expect((c as unknown as { rpc: { mock: { calls: unknown[] } } }).rpc.mock.calls).toHaveLength(
      0,
    );
  });
  it("wording alone is not 'not deployed': a missing-table error is a failed read (free refused)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(
      await monthlyCapAllows(
        failing({ message: 'relation "ai_cost_log" does not exist' }),
        pro(false),
      ),
    ).toBe(false);
    expect(await monthlyCapAllows(failing({ message: "x", code: "42883" }), pro(false))).toBe(true);
  });
  it("migration not applied yet: allowed", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await monthlyCapAllows(failing({ message: "x", code: "PGRST202" }), pro(false))).toBe(
      true,
    );
  });

  describe("a failed cost read: free fails closed, Pro stays open", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    it("free is refused", async () => {
      expect(await monthlyCapAllows(failing({ message: "boom" }), pro(false))).toBe(false);
    });
    it("Pro is allowed", async () => {
      expect(await monthlyCapAllows(failing({ message: "boom" }), pro(true))).toBe(true);
    });
    it("no session id to look up: refused", async () => {
      expect(await monthlyCapAllows(failing({ message: "boom" }, null), pro(true))).toBe(false);
    });
    it("an unreadable answer is a failed read too", async () => {
      const c = {
        rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
        auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
      } as unknown as Client;
      expect(await monthlyCapAllows(c, pro(false))).toBe(false);
      expect(await monthlyCapAllows(c, pro(true))).toBe(true);
    });
    it("a lookup that throws counts as not Pro", async () => {
      expect(
        await monthlyCapAllows(failing({ message: "boom" }), {
          isPro: async () => {
            throw new Error("rc");
          },
          env: noEnv,
        }),
      ).toBe(false);
    });
  });
});

describe("makeTranslateQuotaCheck applies the cap before spending any quota", () => {
  const quotaClient = (cap: { micro: number } | "fail") => {
    const calls: string[] = [];
    const client = {
      rpc: vi.fn(async (fn: string) => {
        calls.push(fn);
        if (fn === "my_ai_cost_month") {
          return cap === "fail"
            ? { data: null, error: { message: "boom" } }
            : { data: [{ uid: "u1", month_micro: cap.micro }], error: null };
        }
        return { data: [{ allowed: true, used: 1 }], error: null };
      }),
      auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
    };
    return { client: client as unknown as Parameters<typeof makeTranslateQuotaCheck>[0], calls };
  };

  it("a capped free learner is refused and burns no burst token or daily unit", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { client, calls } = quotaClient({ micro: 3 * USD });
    expect(await makeTranslateQuotaCheck(client, pro(false))()).toBe(false);
    expect(calls).toEqual(["my_ai_cost_month"]);
  });
  it("an uncapped learner goes on to the rate limit and the daily quota", async () => {
    const { client, calls } = quotaClient({ micro: 0 });
    expect(await makeTranslateQuotaCheck(client, pro(false))()).toBe(true);
    expect(calls).toEqual(["my_ai_cost_month", "consume_ai_rate_limit", "consume_ai_quota"]);
  });
  it("an unreadable cost refuses a free learner and lets Pro on to the quota", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const free = quotaClient("fail");
    expect(await makeTranslateQuotaCheck(free.client, pro(false))()).toBe(false);
    expect(free.calls).toEqual(["my_ai_cost_month"]);
    const paid = quotaClient("fail");
    expect(await makeTranslateQuotaCheck(paid.client, pro(true))()).toBe(true);
  });
});

describe("the callers still use makeTranslateQuotaCheck with one argument", () => {
  it("complete-lesson and grade-review pass only the user client (so the default Pro lookup applies)", () => {
    const root = path.resolve(import.meta.dirname, "../../supabase/functions");
    expect(readFileSync(path.join(root, "grade-review/index.ts"), "utf8")).toContain(
      "makeTranslateQuotaCheck(userClient)",
    );
    expect(readFileSync(path.join(root, "complete-lesson/handler.ts"), "utf8")).toContain(
      "translateQuotaCheck: makeTranslateQuotaCheck",
    );
  });
});
