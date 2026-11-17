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
 * FAIL-SAFE, decided: every failure here ALLOWS the call and logs one line. Blocking on a failed read would lock out
 * paying learners because of OUR outage, which is worse than one extra costly call; the daily request caps still
 * apply, and the next call re-reads. The same goes for the migration not being applied yet (the function is missing)
 * and for an entitlement lookup that cannot answer: the learner gets the Pro (higher) ceiling.
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
  /** null when the cost could not be read (the call is then allowed). */
  status: (CapStatus & { tier: "free" | "pro" }) | null;
  resetsAt: string;
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
      const missing =
        error.code === "42883" ||
        error.code === "PGRST202" ||
        /schema cache|does not exist/i.test(error.message);
      if (missing) {
        if (!warnedNotDeployed) {
          warnedNotDeployed = true;
          console.error(
            "[ai-cap] my_ai_cost_month is not deployed yet; the monthly cap is not enforced",
          );
        }
      } else {
        console.error("[ai-cap] could not read the month's cost; allowing:", error.message);
      }
      return { status: null, resetsAt };
    }
    const row = readRow(data);
    if (!row) {
      console.error("[ai-cap] unexpected month cost answer; allowing");
      return { status: null, resetsAt };
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
    console.error("[ai-cap] check failed; allowing:", e instanceof Error ? e.message : "error");
    return { status: null, resetsAt };
  }
}

/** For consumeQuotaFor: a refusal when `kind` is blocked this month, else null (allow). */
export async function monthlyCapRefusal(
  supabase: unknown,
  kind: string,
  now: Date = new Date(),
  deps: MonthlyCapDeps = {},
): Promise<{ resetsAt: string } | null> {
  if (!isMonthlyCapKind(kind)) return null;
  const reading = await readMonthlyCap(supabase, kind, now, deps);
  return reading.status?.state === "capped" ? { resetsAt: reading.resetsAt } : null;
}
