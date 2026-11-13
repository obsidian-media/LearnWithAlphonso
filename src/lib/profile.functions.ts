import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { LeagueTier } from "../data/achievements";
import { isCourse, type Course } from "../data/courses";
import { publicError } from "./public-error";
import { SKILL_WINDOW_DAYS, isValidTimeZone } from "./profile-data";
import { LEARNER_PROFILE_KEY, parseLearnerProfile } from "./learner-profile";
import {
  addDays,
  streakToday,
  threeMonthsWindow,
  weekStart,
  type ProfileOverview,
} from "./profile-overview";

type LearningRow = { day: string; lesson_seconds: number; practice_seconds: number };
type SkillRow = { day: string; skill: string; right_answers: number; total_answers: number };
type StandingRow = {
  league_tier: string;
  rank: number;
  size: number;
  week_start: string;
  week_end: string;
  week_xp: number;
};

const input = z.object({ course: z.enum(["en", "fr", "es"]) });

/**
 * Everything Profile shows, in ONE request: the reads below run in parallel through the learner's own RLS client,
 * so the page makes one round trip instead of a waterfall of a dozen queries. Pro status is the one thing it does
 * not include (/api/pro-status asks RevenueCat and has its own cache).
 *
 * A failed read of the learner's core rows throws: a new learner's zeros shown to someone with a 40-day streak would
 * be a lie. The social parts (friends) degrade to empty.
 */
export const getProfileOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => input.parse(d))
  .handler(async ({ data, context }): Promise<ProfileOverview> => {
    const { supabase, userId } = context;
    const { course } = data;
    // speech_days is not in the generated types until they are regenerated (speech-days.functions.ts).
    const untyped = supabase as unknown as SupabaseClient;
    // The learner's own calendar day is "today" (owner decision 2026-11-12): read their zone first, UTC when unknown.
    const zone = await untyped
      .from("learner_time_zones")
      .select("time_zone")
      .eq("user_id", userId)
      .maybeSingle();
    const today = streakToday(new Date(), (zone.data as { time_zone: string } | null)?.time_zone);
    const from = weekStart(threeMonthsWindow(today).start);

    const [
      profile,
      langs,
      prog,
      comps,
      acts,
      best,
      speech,
      weak,
      saved,
      events,
      achievements,
      friends,
      learning,
      mastered,
      standing,
      skills,
    ] = await Promise.all([
      supabase
        .from("profiles")
        .select("display_name,avatar_seed,country,created_at")
        .eq("id", userId)
        .maybeSingle(),
      supabase
        .from("language_progress")
        .select("language,xp,cefr_level,league_tier")
        .eq("user_id", userId),
      supabase
        .from("user_progress")
        .select("streak,longest_streak,streak_freezes")
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("lesson_completions")
        .select("lesson_id,language,correct,total")
        .eq("user_id", userId),
      supabase
        .from("activity_days")
        .select("day,xp_earned")
        .eq("user_id", userId)
        .gte("day", from)
        .order("day", { ascending: true }),
      supabase
        .from("activity_days")
        .select("xp_earned")
        .eq("user_id", userId)
        .order("xp_earned", { ascending: false })
        .limit(1),
      untyped
        .from("speech_days")
        .select("day,speech_seconds")
        .eq("user_id", userId)
        .gte("day", weekStart(today)),
      supabase
        .from("review_items")
        .select("weakness_label,weakness_display,lapses,repetitions")
        .eq("user_id", userId)
        .eq("language", course)
        .eq("source", "weakness"),
      supabase
        .from("review_items")
        .select("item_key", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("language", course)
        .eq("source", "saved_word"),
      supabase
        .from("weakness_events")
        .select("category,event_type,created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: true }),
      supabase
        .from("user_achievements")
        .select("achievement_id,progress,unlocked_at")
        .eq("user_id", userId),
      supabase.rpc("get_friends_progress"),
      // The Profile data tables and function are not in the generated types until they are regenerated against a
      // database that has 20261107120000_profile_data.sql (regenerate-supabase-types.yml, after deploy).
      untyped
        .from("learning_days")
        .select("day,lesson_seconds,practice_seconds")
        .eq("user_id", userId)
        .gte("day", weekStart(today)),
      untyped
        .from("mastered_words")
        .select("item_key", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("language", course),
      untyped.rpc("get_my_league_standing", { _course: course }),
      untyped
        .from("skill_days")
        .select("day,skill,right_answers,total_answers")
        .eq("user_id", userId)
        .gte("day", addDays(today, -(SKILL_WINDOW_DAYS - 1))),
    ]);

    const core = {
      profile,
      langs,
      prog,
      comps,
      acts,
      best,
      speech,
      weak,
      saved,
      events,
      achievements,
      learning,
      mastered,
      standing,
      zone,
      skills,
    };
    for (const result of Object.values(core)) {
      if (result.error) throw publicError("getProfileOverview", result.error);
    }

    const p = profile.data;
    const st = (standing.data as StandingRow[] | null)?.[0];
    return {
      today,
      course,
      profile: {
        displayName: p?.display_name ?? null,
        avatarSeed: p?.avatar_seed ?? null,
        country: p?.country ?? null,
        createdAt: p?.created_at ?? null,
      },
      courses: (langs.data ?? [])
        .filter((l) => isCourse(l.language))
        .map((l) => ({
          course: l.language as Course,
          xp: l.xp ?? 0,
          cefrLevel: l.cefr_level ?? "A1",
          leagueTier: (l.league_tier ?? "bronze") as LeagueTier,
        })),
      progress: {
        streak: prog.data?.streak ?? 0,
        longestStreak: prog.data?.longest_streak ?? 0,
        streakFreezes: prog.data?.streak_freezes ?? 0,
      },
      completions: (comps.data ?? []).map((c) => ({
        lessonId: c.lesson_id,
        language: c.language,
        correct: c.correct,
        total: c.total,
      })),
      activity: (acts.data ?? []).map((a) => ({ day: a.day, xp: a.xp_earned ?? 0 })),
      bestDayXp: best.data?.[0]?.xp_earned ?? 0,
      speech: ((speech.data ?? []) as { day: string; speech_seconds: number }[]).map((s) => ({
        day: s.day,
        seconds: s.speech_seconds,
      })),
      weakItems: (weak.data ?? [])
        .filter((w) => w.weakness_label && w.weakness_display)
        .map((w) => ({
          label: w.weakness_label!,
          display: w.weakness_display!,
          lapses: w.lapses ?? 0,
          repetitions: w.repetitions ?? 0,
        })),
      savedWords: saved.count ?? 0,
      weaknessEvents: events.data ?? [],
      achievements: (achievements.data ?? []).map((a) => ({
        id: a.achievement_id,
        progress: a.progress ?? 0,
        unlockedAt: a.unlocked_at ?? null,
      })),
      learning: ((learning.data ?? []) as LearningRow[]).map((l) => ({
        day: l.day,
        lessonSeconds: l.lesson_seconds,
        practiceSeconds: l.practice_seconds,
      })),
      masteredWords: mastered.count ?? 0,
      league: st
        ? {
            leagueTier: st.league_tier,
            rank: st.rank,
            size: st.size,
            weekStart: st.week_start,
            weekEnd: st.week_end,
            weekXp: st.week_xp,
          }
        : null,
      timeZone: (zone.data as { time_zone: string } | null)?.time_zone ?? null,
      dailyGoalMinutes:
        parseLearnerProfile(
          (context.claims as { user_metadata?: Record<string, unknown> } | undefined)
            ?.user_metadata?.[LEARNER_PROFILE_KEY],
        ).dailyMinutes ?? null,
      skills: ((skills.data ?? []) as SkillRow[]).map((r) => ({
        day: r.day,
        skill: r.skill,
        right: r.right_answers,
        total: r.total_answers,
      })),
      friends: friends.error
        ? []
        : (friends.data ?? []).map((r) => ({
            userId: r.user_id,
            displayName: r.display_name ?? "Learner",
            avatarSeed: r.avatar_seed ?? "0",
            streak: r.streak ?? 0,
            weekXp: Number(r.week_xp ?? 0),
          })),
    };
  });

/**
 * Stores the device's IANA time zone (Intl.DateTimeFormat().resolvedOptions().timeZone). Stored and exposed only:
 * streaks and days stay on UTC. The write is service-role only and validated again by the database against its own
 * zone list; a client cannot write the table.
 */
export const setTimeZone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ timeZone: z.string().min(1).max(64).refine(isValidTimeZone, "unknown time zone") })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<{ timeZone: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as unknown as SupabaseClient).rpc(
      "set_learner_time_zone",
      {
        _user_id: context.userId,
        _time_zone: data.timeZone,
      },
    );
    if (error) throw publicError("setTimeZone", error);
    return { timeZone: data.timeZone };
  });
