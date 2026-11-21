import { createServerFn } from "@tanstack/react-start";
import { requireStaff } from "./staff-middleware";
import { consumeStaffLimit, STAFF_LIMITS } from "./staff-rate-limit";
import type { OpsHealth } from "./ops-health.server";

import type { HealthData } from "./health-core";

export type { OpsHealth, OpsHealthRow, OpsLatest } from "./ops-health.server";
export type { HealthData } from "./health-core";

/**
 * The System health page's one server function. requireStaff("numbers.read") = session, active staff row, second
 * factor (AAL2) and the scope, exactly as the Numbers page. Reads only; the answer holds ids, codes and counts, no
 * learner content, so there is no entry in the action record.
 */
export const TOO_MANY_HEALTH = "Too many requests. Wait a minute and try again.";

export const staffGetSystemHealth = createServerFn({ method: "POST" })
  .middleware([requireStaff("numbers.read")])
  .handler(async ({ context }): Promise<OpsHealth> => {
    if (
      !(await consumeStaffLimit(context.supabaseAdmin, context.userId, STAFF_LIMITS.system_health))
    )
      throw new Error(TOO_MANY_HEALTH);
    const { readOpsHealth } = await import("./ops-health.server");
    return readOpsHealth(context.supabaseAdmin);
  });

/**
 * The Health screen's read: live probes (database, auth) with a timeout, stored history, the maintenance job's log, the
 * presence of the AI and RevenueCat settings, and the ops events. Same gate and the same limiter as the function above.
 * Environment VALUES never leave the server: only whether a setting is present and the AI model's name.
 */
export const staffGetHealth = createServerFn({ method: "POST" })
  .middleware([requireStaff("numbers.read")])
  .handler(async ({ context }): Promise<HealthData> => {
    if (
      !(await consumeStaffLimit(context.supabaseAdmin, context.userId, STAFF_LIMITS.system_health))
    )
      throw new Error(TOO_MANY_HEALTH);
    const { readHealth } = await import("./health.server");
    return readHealth(context.supabaseAdmin, process.env);
  });
