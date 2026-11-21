import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireStaff } from "./staff-middleware";
import { consumeStaffLimit, STAFF_LIMITS } from "./staff-rate-limit";
import { validateReason } from "./staff-audit.server";
import { callRpc } from "./untyped-rpc";

/**
 * The console's settings (admin_settings). Anyone who works support may READ them; only an owner may change one, with
 * a reason, and the database writes the action-record row in the same transaction. Today one setting:
 * support_breach_hours, the hours a ticket may wait for a staff reply before it counts as breaching.
 */

export type AdminSettings = { support_breach_hours: number | null };

const OWNER_ONLY_MESSAGE = "Only an owner can change settings.";
const TOO_MANY = "Too many changes. Wait a minute and try again.";

export const staffGetSettings = createServerFn({ method: "GET" })
  .middleware([requireStaff("support.read")])
  .handler(async ({ context }): Promise<AdminSettings> => {
    const { data, error } = await callRpc(context.supabaseAdmin, "staff_get_settings", {
      p_actor: context.userId,
    });
    if (error || !data || typeof data !== "object") throw new Error("Could not read the settings.");
    const hours = (data as Record<string, unknown>).support_breach_hours;
    return { support_breach_hours: typeof hours === "number" ? hours : null };
  });

export const staffSetSetting = createServerFn({ method: "POST" })
  .middleware([requireStaff("staff.manage")])
  .inputValidator((d: unknown) =>
    z
      .object({
        key: z.literal("support_breach_hours"),
        value: z.number().int().min(1).max(168),
        reason: z.string(),
      })
      .strict()
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<{ ok: true; changed: boolean }> => {
    if (context.staffRole !== "owner") throw new Error(OWNER_ONLY_MESSAGE);
    const reason = validateReason(data.reason);
    if (
      !(await consumeStaffLimit(context.supabaseAdmin, context.userId, STAFF_LIMITS.settings_write))
    )
      throw new Error(TOO_MANY);
    const { data: changed, error } = await callRpc(context.supabaseAdmin, "staff_set_setting", {
      p_actor: context.userId,
      p_role: context.staffRole,
      p_key: data.key,
      p_value: data.value,
      p_reason: reason,
    });
    if (error) {
      throw new Error(
        error.code === "42501"
          ? OWNER_ONLY_MESSAGE
          : "Could not change the setting. Nothing was changed.",
      );
    }
    return { ok: true, changed: changed === true };
  });
