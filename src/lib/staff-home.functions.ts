import { createServerFn } from "@tanstack/react-start";
import { requireStaff } from "./staff-middleware";

/**
 * The counts on the console's home page, one small call per card, each gated by the scope of the page the card opens.
 * Counts only: no names, no text. A person without the scope is refused here, so a hidden card is never the control.
 */

/** Start of today in UTC, the day the "new learners today" count uses. */
export function startOfUtcDay(now: Date): string {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  ).toISOString();
}

export const staffHomeSupport = createServerFn({ method: "GET" })
  .middleware([requireStaff("support.read")])
  .handler(async ({ context }): Promise<{ open: number; unassigned: number }> => {
    const { data, error } = await context.supabaseAdmin.rpc("staff_support_inbox", {
      p_actor: context.userId,
      p_filter: "open",
      p_assigned: "any",
      p_cursor_at: null,
      p_cursor_id: null,
      p_limit: 1,
    } as never);
    if (error || !data || typeof data !== "object") throw new Error("Could not read the tickets.");
    const counts = (data as { counts?: { open?: number; unassigned?: number } }).counts ?? {};
    return { open: Number(counts.open ?? 0), unassigned: Number(counts.unassigned ?? 0) };
  });

export const staffHomeReports = createServerFn({ method: "GET" })
  .middleware([requireStaff("reports.manage")])
  .handler(async ({ context }): Promise<{ open: number }> => {
    const { count, error } = await context.supabaseAdmin
      .from("content_reports")
      .select("id", { count: "exact", head: true });
    if (error) throw new Error("Could not read the reports.");
    return { open: count ?? 0 };
  });

export const staffHomeNumbers = createServerFn({ method: "GET" })
  .middleware([requireStaff("numbers.read")])
  .handler(async ({ context }): Promise<{ newLearnersToday: number }> => {
    const { count, error } = await context.supabaseAdmin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .gte("created_at", startOfUtcDay(new Date()));
    if (error) throw new Error("Could not read the numbers.");
    return { newLearnersToday: count ?? 0 };
  });
