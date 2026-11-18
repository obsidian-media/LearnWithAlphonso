import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicError } from "./public-error";

export type WeeklyChallenge = {
  templateId: string;
  title: string;
  description: string;
  progress: number;
  threshold: number;
  completed: boolean;
};

export const getWeeklyChallenges = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<WeeklyChallenge[]> => {
    const { data: rows, error } = await context.supabase.rpc("get_weekly_challenges");
    // A failed read must not look like "no challenges this week": the card shows an error with a retry.
    if (error) throw publicError("getWeeklyChallenges", error);
    return (rows ?? []).map((r) => ({
      templateId: r.template_id,
      title: r.title,
      description: r.description,
      progress: r.progress ?? 0,
      threshold: r.threshold,
      completed: r.completed ?? false,
    }));
  });

const courseSchema = z.enum(["en", "fr", "es"]).default("en");

export const joinOpenDuelQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ course: courseSchema, matchByLevel: z.boolean().default(true) }).parse(d),
  )
  .handler(async ({ data, context }): Promise<{ matched: boolean; duelId: string | null }> => {
    const { data: rows, error } = await context.supabase.rpc("join_open_duel_queue", {
      _course: data.course,
      _match_by_level: data.matchByLevel,
    });
    // A failed call is not "queued, no match yet": the page would say "Waiting for an opponent…" for nothing.
    if (error) throw publicError("joinOpenDuelQueue", error);
    const row = rows?.[0];
    return { matched: row?.matched ?? false, duelId: row?.duel_id ?? null };
  });

export const leaveOpenDuelQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ ok: boolean }> => {
    const { error } = await context.supabase.rpc("leave_duel_queue");
    // The learner would be told they left while the server keeps them queued (and can still match them).
    if (error) throw publicError("leaveOpenDuelQueue", error);
    return { ok: true };
  });

/** join_open_duel_queue drops queue rows older than this before matching, so an older row can never be matched. */
const QUEUE_ENTRY_LIFETIME_MS = 10 * 60 * 1000;

export type DuelQueueState = { queued: false } | { queued: true; course: string; queuedAt: string };

/**
 * Whether the caller is waiting in the open-duel queue right now, read from their own `duel_queue` row (SELECT is
 * granted and the policy `duel_queue_select_own` limits it to that row). The page uses it on load, so leaving and
 * coming back still shows "Waiting for an opponent…" with a way to leave, instead of a fresh "Find" button while the
 * server keeps them queued.
 */
export const getMyDuelQueue = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DuelQueueState> => {
    const { data, error } = await context.supabase
      .from("duel_queue")
      .select("course,queued_at")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw publicError("getMyDuelQueue", error);
    if (!data) return { queued: false };
    const age = Date.now() - new Date(data.queued_at).getTime();
    if (!(age < QUEUE_ENTRY_LIFETIME_MS)) return { queued: false };
    return { queued: true, course: data.course, queuedAt: data.queued_at };
  });
