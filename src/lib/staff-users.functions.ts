import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireStaff } from "./staff-middleware";
import { createRateLimiter } from "./staff-rate-limit";

/**
 * Learner management for the staff console. Every function is gated by requireStaff(scope) and every write names its
 * reason and lands in the action record (see staff-audit.server.ts). Server-only helpers are imported inside the
 * handlers, like the rest of the repo's server functions, so they never reach a client bundle.
 */

const idSchema = z.string().uuid();
const searchLimiter = createRateLimiter(30, 60_000);

export type StaffUserHit = {
  id: string;
  email: string;
  displayName: string | null;
  createdAt: string;
};

/** Exact email or id, or a display-name prefix; at least 2 characters, at most 25 results. */
export const staffSearchUsers = createServerFn({ method: "POST" })
  .middleware([requireStaff("users.read")])
  .inputValidator((d: unknown) => z.object({ q: z.string().trim().min(2).max(100) }).parse(d))
  .handler(async ({ data, context }): Promise<StaffUserHit[]> => {
    if (!searchLimiter.allow(context.userId)) {
      throw new Error("Too many searches. Wait a minute and try again.");
    }
    const { data: rows, error } = await context.supabaseAdmin.rpc("staff_search_users", {
      p_q: data.q,
    });
    if (error) throw new Error("Search failed.");
    return (rows ?? []).map((r) => ({
      id: r.id,
      email: r.email,
      displayName: r.display_name,
      createdAt: r.created_at,
    }));
  });

/** One learner's facts. The view is recorded FIRST: no record, no facts. */
export const staffGetUser = createServerFn({ method: "POST" })
  .middleware([requireStaff("users.read")])
  .inputValidator((d: unknown) => z.object({ id: idSchema }).parse(d))
  .handler(async ({ data, context }) => {
    const { recordUserView } = await import("./staff-audit.server");
    const { loadLearnerFacts } = await import("./staff-user-facts.server");
    await recordUserView(context.supabaseAdmin, {
      actor: context.userId,
      role: context.staffRole,
      target: data.id,
    });
    return loadLearnerFacts(context.supabaseAdmin, data.id);
  });

/** An internal note on a learner. The note and its record row are written in one database call. */
export const staffAddNote = createServerFn({ method: "POST" })
  .middleware([requireStaff("users.notes")])
  .inputValidator((d: unknown) =>
    z.object({ id: idSchema, body: z.string().trim().min(1).max(2000) }).parse(d),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { assertNotSelf } = await import("./staff-audit.server");
    assertNotSelf(context.userId, data.id);
    const { error } = await context.supabaseAdmin.rpc("staff_add_note", {
      p_actor: context.userId,
      p_role: context.staffRole,
      p_target: data.id,
      p_body: data.body,
    });
    if (error) throw new Error("Could not save the note.");
    return { ok: true };
  });

/** The Pro state recorded as "before": status and store only, never links or ids. */
async function proSnapshot(userId: string) {
  const { getAccountSubscriberSummary, revenueCatConfigFromEnv } =
    await import("./revenuecat-entitlement");
  const config = revenueCatConfigFromEnv();
  if (!config) return { status: "unconfigured" };
  const s = await getAccountSubscriberSummary(config, userId);
  return { status: s.status, store: "store" in s ? s.store : null };
}

/**
 * Gives Pro for 1 to 365 days as a RevenueCat promotional entitlement (so iOS, Android and web all see it). The
 * order keeps the books honest: RevenueCat first; a refusal is recorded as pro.grant.failed and nothing else changes;
 * on success the grant row and the record row are written in one database call.
 */
export const staffGrantPro = createServerFn({ method: "POST" })
  .middleware([requireStaff("pro.grant")])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: idSchema,
        days: z.number().int().min(1).max(365),
        reason: z.string(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<{ ok: true; endsAt: string }> => {
    const { assertNotSelf, validateReason, recordStaffAction } =
      await import("./staff-audit.server");
    const {
      accountAppUserIds,
      grantPromotionalPro,
      revenueCatConfigFromEnv,
      revokePromotionalPro,
    } = await import("./revenuecat-entitlement");
    const reason = validateReason(data.reason);
    assertNotSelf(context.userId, data.id);
    const config = revenueCatConfigFromEnv();
    if (!config) throw new Error("Gifting Pro is not set up on this server.");

    const before = await proSnapshot(data.id);
    const endMs = Date.now() + data.days * 86_400_000;
    const appUserId = accountAppUserIds(config, data.id)[0]!;
    try {
      await grantPromotionalPro(config, appUserId, endMs);
    } catch {
      await recordStaffAction(context.supabaseAdmin, {
        actor: context.userId,
        role: context.staffRole,
        action: "pro.grant.failed",
        target: data.id,
        reason,
        before,
        after: { days: data.days, failedStep: "revenuecat" },
      });
      throw new Error("RevenueCat refused the gift; nothing changed.");
    }
    const endsAt = new Date(endMs).toISOString();
    const { error } = await context.supabaseAdmin.rpc("staff_record_pro_grant", {
      p_actor: context.userId,
      p_role: context.staffRole,
      p_target: data.id,
      p_ends_at: endsAt,
      p_reason: reason,
      p_before: before,
    } as never);
    if (error) {
      // The gift is live but unrecorded: withdraw it rather than leave a change with no record.
      const withdrawn = await revokePromotionalPro(config, appUserId).then(
        () => true,
        () => false,
      );
      throw new Error(
        withdrawn
          ? "The gift could not be recorded, so it was withdrawn. Try again."
          : "The gift is live but could not be recorded. Revoke it from this page and try again.",
      );
    }
    return { ok: true, endsAt };
  });

/** Ends a gifted Pro (promotional entitlements only; store purchases are untouched). */
export const staffRevokePro = createServerFn({ method: "POST" })
  .middleware([requireStaff("pro.revoke")])
  .inputValidator((d: unknown) => z.object({ id: idSchema, reason: z.string() }).parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { assertNotSelf, validateReason, recordStaffAction } =
      await import("./staff-audit.server");
    const { accountAppUserIds, revenueCatConfigFromEnv, revokePromotionalPro } =
      await import("./revenuecat-entitlement");
    const reason = validateReason(data.reason);
    assertNotSelf(context.userId, data.id);
    const config = revenueCatConfigFromEnv();
    if (!config) throw new Error("Gifting Pro is not set up on this server.");

    const before = await proSnapshot(data.id);
    try {
      for (const id of accountAppUserIds(config, data.id)) await revokePromotionalPro(config, id);
    } catch {
      await recordStaffAction(context.supabaseAdmin, {
        actor: context.userId,
        role: context.staffRole,
        action: "pro.revoke.failed",
        target: data.id,
        reason,
        before,
        after: { failedStep: "revenuecat" },
      });
      throw new Error("RevenueCat refused the change; nothing changed.");
    }
    const { error } = await context.supabaseAdmin.rpc("staff_record_pro_revoke", {
      p_actor: context.userId,
      p_role: context.staffRole,
      p_target: data.id,
      p_reason: reason,
      p_before: before,
    } as never);
    if (error) {
      throw new Error("The gift was ended but the change could not be recorded. Tell the owner.");
    }
    return { ok: true };
  });
