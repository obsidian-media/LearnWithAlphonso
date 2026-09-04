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
    const out: Record<string, unknown> = {
      exported_at: new Date().toISOString(),
      user_id: userId,
    };
    for (const table of USER_TABLES) {
      const { data } = await supabase.from(table).select("*").eq("user_id", userId);
      out[table] = data ?? [];
    }
    return out;
  });

/** Permanently delete the account and all associated data (GDPR erasure). */
export const deleteMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ confirm: z.literal("DELETE") }).parse(d))
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    // Remove owned rows first, as the caller, so RLS stays the source of truth.
    for (const table of USER_TABLES) {
      await supabase.from(table).delete().eq("user_id", userId);
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Friend rows pointing at this user are not owned by them.
    await supabaseAdmin.from("friendships").delete().eq("friend_id", userId);
    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (error) throw new Error(error.message);

    return { deleted: true };
  });
