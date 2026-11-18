import {
  evaluateCap,
  isMonthlyCapKind,
  monthlyCapConfig,
  needsTierLookup,
  nextMonthStartUtc,
  type CapStatus,
  type MonthlyCapConfig,
} from "./ai-monthly-cap";

/**
 * The server half of the monthly AI cost cap (src/lib/ai-monthly-cap.ts has the rules and the settings).
 *
 * One RPC reads the learner's own month-to-date cost (my_ai_cost_month: ai_cost_log + ai_cost_daily, 20261120120000).
 * The learner's tier is looked up only when the spend is high enough for it to matter (needsTierLookup), so almost
 * every call costs one cheap read and no entitlement request.
 *
 * FAILURE RULE (decided 2026-11-18): when the month's cost cannot be read, a FREE learner is refused and a Pro learner
 * is let through. The cap exists to bound cost, so an unreadable cost must not become unlimited cost for the people
 * who pay nothing; a paying learner's call is still bounded by the daily request caps and the next call re-reads.
 * The tier is found with the entitlement lookup (which keeps a confirmed "active" for a minute, so a short
 * RevenueCat outage does not make a paying learner look free):
 *   active       -> allowed
 *   inactive     -> refused (503, "could not verify your usage", retry shortly)
 *   unavailable  -> refused: the learner cannot be shown to be Pro, and cost AND entitlement being down together is
 *                   rare and brief; a 503 asks them to retry rather than telling them they hit a limit.
 * The refusal is a 503 and not the cap's 429 because the learner has NOT reached a limit; the cap message would name
 * a reset date that is not the reason.
 * Two states stay open on purpose: the cap switched off by its own kill switch (AI_MONTHLY_CAP_ENABLED=false), and the
 * migration not applied yet (my_ai_cost_month missing: nothing exists to read, a deploy-order state that cannot recur
 * once 20261120120000 is in; refusing would take AI from every free learner until then).
 */

type RpcClient = {
  rpc: (
    fn: "my_ai_cost_month",
    args?: Record<string, never>,
  ) => PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>;
};

export type MonthlyCapDeps = {
  /** "active" | "inactive" | "unavailable" for this learner; tests inject it. */
  entitlement?: (userId: string) => Promise<"active" | "inactive" | "unavailable">;
  env?: Record<string, string | undefined>;
};

export type MonthlyCapReading = {
  /** null when the cost could not be read. */
  status: (CapStatus & { tier: "free" | "pro" }) | null;
  resetsAt: string;
  /** True when the cost read FAILED (an error, an unreadable answer or an exception); not set when the cap is
   *  switched off or its function is not deployed yet. monthlyCapRefusal turns it into the failure rule. */
  readFailed?: boolean;
};

let warnedNotDeployed = false;
/** Tests only. */
export function resetMonthlyCapWarnings(): void {
  warnedNotDeployed = false;
}

async function defaultEntitlement(userId: string): Promise<"active" | "inactive" | "unavailable"> {
  const { revenueCatConfigFromEnv, getProEntitlementStatus } =
    await import("./revenuecat-entitlement");
  const rc = revenueCatConfigFromEnv();
  return rc ? getProEntitlementStatus(rc, userId) : "unavailable";
}

function readRow(data: unknown): { uid: string; micro: number } | null {
  const row = (Array.isArray(data) ? data[0] : data) as
    { uid?: unknown; month_micro?: unknown } | null | undefined;
  if (!row || typeof row.uid !== "string") return null;
  // bigint comes back as a number or a numeric string depending on the driver.
  const micro = typeof row.month_micro === "string" ? Number(row.month_micro) : row.month_micro;
  if (typeof micro !== "number" || !Number.isFinite(micro) || micro < 0) return null;
  return { uid: row.uid, micro };
}

/** The learner's month-to-date standing. Never throws. `kindHint` "hector" is already a verified Pro learner. */
export async function readMonthlyCap(
  supabase: unknown,
  kindHint: string | null,
  now: Date = new Date(),
  deps: MonthlyCapDeps = {},
): Promise<MonthlyCapReading> {
  const resetsAt = nextMonthStartUtc(now);
  try {
    const cfg: MonthlyCapConfig = monthlyCapConfig(deps.env ?? process.env);
    if (!cfg.enabled) return { status: null, resetsAt };
    const { data, error } = await (supabase as RpcClient).rpc("my_ai_cost_month");
    if (error) {
      // Only these two codes mean "my_ai_cost_month does not exist yet" (PostgREST: no such function in the schema
      // cache; Postgres: undefined function). Message wording is not matched: a different failure that happens to
      // say "does not exist" (a missing table, say) is a failed read, and a free learner is refused.
      const missing = error.code === "42883" || error.code === "PGRST202";
      if (missing) {
        if (!warnedNotDeployed) {
          warnedNotDeployed = true;
          console.error(
            "[ai-cap] my_ai_cost_month is not deployed yet; the monthly cap is not enforced",
          );
        }
      } else {
        console.error("[ai-cap] could not read the month's cost:", error.message);
        return { status: null, resetsAt, readFailed: true };
      }
      return { status: null, resetsAt };
    }
    const row = readRow(data);
    if (!row) {
      console.error("[ai-cap] unexpected month cost answer");
      return { status: null, resetsAt, readFailed: true };
    }

    let tier: "free" | "pro" = "free";
    if (needsTierLookup(row.micro, cfg)) {
      if (kindHint === "hector") {
        tier = "pro";
      } else {
        const ent = await (deps.entitlement ?? defaultEntitlement)(row.uid).catch(
          () => "unavailable" as const,
        );
        // "unavailable" never locks a possibly-paying learner into the free ceiling.
        tier = ent === "inactive" ? "free" : "pro";
      }
    }
    const cap = tier === "pro" ? cfg.proMicro : cfg.freeMicro;
    return { status: { ...evaluateCap(row.micro, cap, cfg.warnShare), tier }, resetsAt };
  } catch (e) {
    console.error("[ai-cap] check failed:", e instanceof Error ? e.message : "error");
    return { status: null, resetsAt, readFailed: true };
  }
}

export type MonthlyCapRefusal =
  /** Over the ceiling: a 429 with the reset date. */
  | { kind: "capped"; resetsAt: string }
  /** The cost could not be read and the learner is not shown to be Pro: a 503. */
  | { kind: "unverified" };

type SessionClient = {
  auth?: { getUser: () => PromiseLike<{ data: { user: { id: string } | null } }> };
};

/**
 * For consumeQuotaFor: a refusal when `kind` is blocked this month, else null (allow). `userId` is used only when the
 * cost read failed, to find the tier; without it the tier is looked up from the session.
 */
export async function monthlyCapRefusal(
  supabase: unknown,
  kind: string,
  now: Date = new Date(),
  deps: MonthlyCapDeps = {},
  userId?: string,
): Promise<MonthlyCapRefusal | null> {
  if (!isMonthlyCapKind(kind)) return null;
  const reading = await readMonthlyCap(supabase, kind, now, deps);
  if (reading.status?.state === "capped") return { kind: "capped", resetsAt: reading.resetsAt };
  if (!reading.readFailed) return null;
  // The failure rule (see the header): free fails closed, Pro stays open.
  if (kind === "hector") return null; // Hector is Pro-only, and the route has already verified Pro.
  let uid = userId;
  if (!uid) {
    uid = await Promise.resolve((supabase as SessionClient).auth?.getUser())
      .then((r) => r?.data.user?.id)
      .catch(() => undefined);
  }
  if (!uid) return { kind: "unverified" };
  const ent = await (deps.entitlement ?? defaultEntitlement)(uid).catch(
    () => "unavailable" as const,
  );
  return ent === "active" ? null : { kind: "unverified" };
}
