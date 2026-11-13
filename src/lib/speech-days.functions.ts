import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicError } from "./public-error";
import { localDay } from "./local-day";

/**
 * Minutes spoken, for the Profile (20261106100000_speech_days.sql). Reads the signed-in learner's own rows through
 * their RLS client (speech_days_select_own), so it can never return anyone else's.
 */

export const MAX_SPEECH_HISTORY_DAYS = 365;

export type SpeechDay = { day: string; seconds: number };
export type SpeechHistory = { days: SpeechDay[]; totalSeconds: number };

const utcDay = (d: Date) => d.toISOString().slice(0, 10);

/**
 * The `n` days ending today, oldest first, as YYYY-MM-DD: the learner's own calendar days in their stored time zone,
 * UTC when none is known. Same day rule as the database (learner_local_date).
 */
export function lastLocalDays(
  n: number,
  now: Date = new Date(),
  timeZone?: string | null,
): string[] {
  const today = localDay(now.getTime(), timeZone);
  const end = Date.parse(`${today}T00:00:00Z`);
  return Array.from({ length: n }, (_, i) => utcDay(new Date(end - (n - 1 - i) * 86_400_000)));
}

/** The same window counted in UTC days (a learner with no stored zone). */
export const lastUtcDays = (n: number, now: Date = new Date()): string[] =>
  lastLocalDays(n, now, null);

/** One entry per day in the window (0 where nothing was spoken); rows outside the window are ignored. */
export function speechHistory(
  rows: { day: string; speech_seconds: number }[],
  n: number,
  now: Date = new Date(),
  timeZone?: string | null,
): SpeechHistory {
  const byDay = new Map(rows.map((r) => [r.day, r.speech_seconds]));
  const days = lastLocalDays(n, now, timeZone).map((day) => ({
    day,
    seconds: byDay.get(day) ?? 0,
  }));
  return { days, totalSeconds: days.reduce((sum, d) => sum + d.seconds, 0) };
}

const inputSchema = z.object({
  days: z.number().int().min(1).max(MAX_SPEECH_HISTORY_DAYS).default(30),
});

export const getSpeechHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => inputSchema.parse(input ?? {}))
  .handler(async ({ data, context }): Promise<SpeechHistory> => {
    const { supabase, userId } = context;
    const now = new Date();
    const { readLearnerTimeZone } = await import("./learner-time-zone.server");
    const timeZone = await readLearnerTimeZone(supabase, userId);
    const window = lastLocalDays(data.days, now, timeZone);
    // speech_days is not in the generated types until they are regenerated against a database that has its
    // migration (regenerate-supabase-types.yml, after deploy).
    const { data: rows, error } = await (supabase as unknown as SupabaseClient)
      .from("speech_days")
      .select("day,speech_seconds")
      .eq("user_id", userId)
      .gte("day", window[0]!)
      .order("day", { ascending: true });
    if (error) throw publicError("getSpeechHistory", error);
    return speechHistory(
      (rows ?? []) as { day: string; speech_seconds: number }[],
      data.days,
      now,
      timeZone,
    );
  });
