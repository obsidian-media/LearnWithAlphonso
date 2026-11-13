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
