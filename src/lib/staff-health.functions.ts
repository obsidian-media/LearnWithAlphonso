import { createServerFn } from "@tanstack/react-start";
import { requireStaff } from "./staff-middleware";
import { createRateLimiter } from "./staff-rate-limit";
import type { OpsHealth } from "./ops-health.server";

export type { OpsHealth, OpsHealthRow, OpsLatest } from "./ops-health.server";

/**
 * The System health page's one server function. requireStaff("numbers.read") = session, active staff row, second
 * factor (AAL2) and the scope, exactly as the Numbers page. Reads only; the answer holds ids, codes and counts, no
 * learner content, so there is no entry in the action record.
 */
const limiter = createRateLimiter(30, 60_000);
export const TOO_MANY_HEALTH = "Too many requests. Wait a minute and try again.";

export const staffGetSystemHealth = createServerFn({ method: "POST" })
  .middleware([requireStaff("numbers.read")])
  .handler(async ({ context }): Promise<OpsHealth> => {
    if (!limiter.allow(context.userId)) throw new Error(TOO_MANY_HEALTH);
    const { readOpsHealth } = await import("./ops-health.server");
    return readOpsHealth(context.supabaseAdmin);
  });
