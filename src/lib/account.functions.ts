import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const USER_TABLES = [
  "review_items",
  "lesson_completions",
  "activity_days",
  "achievements",
  "friendships",
  "ai_usage",
  "user_progress",
  "profiles",
] as const;

/** Export every row this account owns (GDPR data portability). */
export const exportMyData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const tables: Record<string, unknown[]> = {};
    for (const table of USER_TABLES) {
      // Table name is a union of literals from a heterogeneous table list;
      // the generated per-table query builder types don't unify across the
      // loop, so this cast is the pragmatic escape hatch rather than a
      // type-safety gap (each name is still a real, known table).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase.from(table) as any).select("*").eq("user_id", userId);
      tables[table] = (data as unknown[]) ?? [];
    }
    return {
      exported_at: new Date().toISOString(),
      user_id: userId,
      tables: JSON.stringify(tables),
    };
  });

/** Permanently delete the account and all associated data (GDPR erasure). */
export const deleteMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ confirm: z.literal("DELETE") }).parse(d))
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    // Remove owned rows first, as the caller, so RLS stays the source of truth.
    for (const table of USER_TABLES) {
      // See the matching cast + comment in exportMyData above.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from(table) as any).delete().eq("user_id", userId);
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Friend rows pointing at this user are not owned by them.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabaseAdmin.from("friendships") as any).delete().eq("friend_id", userId);
    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (error) throw new Error(error.message);

    return { deleted: true };
  });
