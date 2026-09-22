import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
    const { data: rows } = await context.supabase.rpc("get_weekly_challenges");
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
    const { data: rows } = await context.supabase.rpc("join_open_duel_queue", {
      _course: data.course,
      _match_by_level: data.matchByLevel,
    });
    const row = rows?.[0];
    return { matched: row?.matched ?? false, duelId: row?.duel_id ?? null };
  });

export const leaveOpenDuelQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ ok: boolean }> => {
    await context.supabase.rpc("leave_duel_queue");
    return { ok: true };
  });
