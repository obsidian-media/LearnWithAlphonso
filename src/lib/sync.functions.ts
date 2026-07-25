import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ACHIEVEMENTS } from "../data/achievements";
import type { LeagueTier } from "../data/achievements";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function daysDiff(a: string, b: string) {
  const ms = new Date(b).getTime() - new Date(a).getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

const LEAGUES: LeagueTier[] = ["bronze", "silver", "sapphire", "ruby", "diamond"];

export type ProgressSnapshot = {
  xp: number;
  streak: number;
  longestStreak: number;
  lastActiveDate: string | null;
  hearts: number;
  heartsRefillAt: number | null;
  streakFreezes: number;
  leagueTier: LeagueTier;
  completedLessons: string[];
  answersByLesson: Record<string, { correct: number; total: number }>;
  activityDates: string[];
  unlockedAchievements: string[];
};

export const fetchProgress = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ProgressSnapshot> => {
    const { supabase, userId } = context;
    const [prog, comps, acts, unlocks] = await Promise.all([
      supabase.from("user_progress").select("*").eq("user_id", userId).maybeSingle(),
      supabase.from("lesson_completions").select("*").eq("user_id", userId),
      supabase
        .from("activity_days")
        .select("day,xp_earned")
        .eq("user_id", userId)
        .gte("day", new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)),
      supabase.from("user_achievements").select("achievement_id").eq("user_id", userId),
    ]);
    let p = prog.data;
    if (!p) {
      const ins = await supabase
        .from("user_progress")
        .insert({ user_id: userId })
        .select("*")
        .single();
      p = ins.data;
    }
    const answers: Record<string, { correct: number; total: number }> = {};
    const completedLessons: string[] = [];
    for (const c of comps.data ?? []) {
      completedLessons.push(c.lesson_id);
      answers[c.lesson_id] = { correct: c.correct, total: c.total };
    }
    return {
      xp: p?.xp ?? 0,
      streak: p?.streak ?? 0,
      longestStreak: p?.longest_streak ?? 0,
      lastActiveDate: p?.last_active_date ?? null,
      hearts: p?.hearts ?? 5,
      heartsRefillAt: p?.hearts_refill_at ? new Date(p.hearts_refill_at).getTime() : null,
      streakFreezes: p?.streak_freezes ?? 0,
      leagueTier: ((p?.league_tier as LeagueTier) ?? "bronze") as LeagueTier,
      completedLessons,
      answersByLesson: answers,
      activityDates: (acts.data ?? []).map((a) => a.day as string),
      unlockedAchievements: (unlocks.data ?? []).map((u) => u.achievement_id as string),
    };
  });

const completeLessonSchema = z.object({
  lessonId: z.string().min(1).max(100),
  correct: z.number().int().min(0).max(50),
  total: z.number().int().min(1).max(50),
});

export const completeLessonRemote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => completeLessonSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { lessonId, correct, total } = data;
    const today = todayStr();
    const xpGain = correct * 10 + (correct === total ? 20 : 0);

    // load current progress
    const { data: pRow } = await supabase
      .from("user_progress")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    const cur = pRow ?? {
      user_id: userId,
      xp: 0,
      streak: 0,
      longest_streak: 0,
      last_active_date: null as string | null,
      hearts: 5,
      streak_freezes: 0,
      league_tier: "bronze",
    };

    // streak
    let streak = cur.streak;
    let freezes = cur.streak_freezes;
    if (cur.last_active_date === today) {
      // same day, no change
    } else if (!cur.last_active_date) {
      streak = 1;
    } else {
      const diff = daysDiff(cur.last_active_date, today);
      if (diff === 1) streak = cur.streak + 1;
      else if (diff === 2 && freezes > 0) {
        streak = cur.streak + 1;
        freezes -= 1;
      } else streak = 1;
    }
    const longest = Math.max(cur.longest_streak, streak);

    // freeze reward every 10 streak days (award once per milestone by only bumping when %10==0 and crossed today)
    if (streak > cur.streak && streak % 10 === 0) freezes += 1;

    const xp = cur.xp + xpGain;

    // league promotion
    const oldIdx = LEAGUES.indexOf(cur.league_tier as LeagueTier);
    const thresholds = [0, 300, 1000, 3000, 8000];
    let newIdx = oldIdx;
    for (let i = LEAGUES.length - 1; i >= 0; i--) {
      if (xp >= thresholds[i]) {
        newIdx = Math.max(oldIdx, i);
        break;
      }
    }
    const leagueTier = LEAGUES[newIdx];

    // upsert progress
    await supabase.from("user_progress").upsert({
      user_id: userId,
      xp,
      streak,
      longest_streak: longest,
      last_active_date: today,
      hearts: cur.hearts,
      streak_freezes: freezes,
      league_tier: leagueTier,
    });

    // upsert lesson completion (best score kept)
    await supabase.from("lesson_completions").upsert(
      { user_id: userId, lesson_id: lessonId, correct, total, xp_earned: xpGain },
      { onConflict: "user_id,lesson_id" },
    );

    // activity day: add XP
    const { data: existingDay } = await supabase
      .from("activity_days")
      .select("xp_earned")
      .eq("user_id", userId)
      .eq("day", today)
      .maybeSingle();
    await supabase.from("activity_days").upsert({
      user_id: userId,
      day: today,
      xp_earned: (existingDay?.xp_earned ?? 0) + xpGain,
    });

    // count perfect lessons
    const { data: allComps } = await supabase
      .from("lesson_completions")
      .select("correct,total")
      .eq("user_id", userId);
    const totalLessons = allComps?.length ?? 0;
    const perfectLessons = (allComps ?? []).filter((c) => c.correct === c.total).length;

    // achievement evaluation
    const stats: Record<string, number> = {
      streak,
      xp,
      perfect: perfectLessons,
      lessons: totalLessons,
      league: newIdx > oldIdx ? 1 : 0, // handled below via existing progress
      freeze: freezes,
    };

    const { data: prevUnlocks } = await supabase
      .from("user_achievements")
      .select("achievement_id,progress")
      .eq("user_id", userId);
    const prevMap = new Map((prevUnlocks ?? []).map((u) => [u.achievement_id, u.progress]));
    const newlyUnlocked: string[] = [];

    // league_promote counter is cumulative: track via user_achievements progress
    const prevPromoteCount = prevMap.get("league_promote_3") ?? prevMap.get("league_promote_1") ?? 0;
    const promoteCount = prevPromoteCount + (newIdx > oldIdx ? 1 : 0);
    stats.league = promoteCount;

    const rows: {
      user_id: string;
      achievement_id: string;
      progress: number;
      unlocked_at?: string;
    }[] = [];
    for (const a of ACHIEVEMENTS) {
      const val = stats[a.category] ?? 0;
      const wasUnlocked = prevMap.has(a.id);
      if (val >= a.threshold && !wasUnlocked) {
        newlyUnlocked.push(a.id);
        rows.push({ user_id: userId, achievement_id: a.id, progress: val });
      } else if (wasUnlocked && a.category === "league") {
        rows.push({ user_id: userId, achievement_id: a.id, progress: val });
      }
    }
    if (rows.length) {
      await supabase
        .from("user_achievements")
        .upsert(rows, { onConflict: "user_id,achievement_id" });
    }

    // return refreshed snapshot for optimistic apply
    return {
      xpGain,
      newlyUnlocked,
      progress: {
        xp,
        streak,
        longestStreak: longest,
        lastActiveDate: today,
        hearts: cur.hearts,
        streakFreezes: freezes,
        leagueTier,
      },
    };
  });

export const loseHeartRemote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: p } = await supabase
      .from("user_progress")
      .select("hearts")
      .eq("user_id", userId)
      .maybeSingle();
    const next = Math.max(0, (p?.hearts ?? 5) - 1);
    await supabase
      .from("user_progress")
      .update({
        hearts: next,
        hearts_refill_at:
          next === 0 ? new Date(Date.now() + 30 * 60 * 1000).toISOString() : null,
      })
      .eq("user_id", userId);
    return { hearts: next };
  });

export const useStreakFreeze = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: p } = await supabase
      .from("user_progress")
      .select("streak_freezes")
      .eq("user_id", userId)
      .maybeSingle();
    const cur = p?.streak_freezes ?? 0;
    if (cur <= 0) return { streakFreezes: 0, used: false };
    await supabase
      .from("user_progress")
      .update({ streak_freezes: cur - 1 })
      .eq("user_id", userId);
    return { streakFreezes: cur - 1, used: true };
  });

const mergeSchema = z.object({
  xp: z.number().int().min(0).max(1_000_000).default(0),
  streak: z.number().int().min(0).max(10_000).default(0),
  longestStreak: z.number().int().min(0).max(10_000).default(0),
  completedLessons: z.array(z.string().max(100)).max(500).default([]),
  answersByLesson: z
    .record(z.string(), z.object({ correct: z.number().int(), total: z.number().int() }))
    .default({}),
  activityDates: z.array(z.string()).max(90).default([]),
});

export const mergeGuestProgress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => mergeSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: p } = await supabase
      .from("user_progress")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    // only merge if server has zero progress (first sign-in)
    if (!p || (p.xp === 0 && p.streak === 0)) {
      await supabase.from("user_progress").upsert({
        user_id: userId,
        xp: data.xp,
        streak: data.streak,
        longest_streak: data.longestStreak,
        last_active_date: data.activityDates[data.activityDates.length - 1] ?? null,
      });
      const comps = data.completedLessons.map((lid) => ({
        user_id: userId,
        lesson_id: lid,
        correct: data.answersByLesson[lid]?.correct ?? 0,
        total: data.answersByLesson[lid]?.total ?? 1,
        xp_earned: 0,
      }));
      if (comps.length)
        await supabase
          .from("lesson_completions")
          .upsert(comps, { onConflict: "user_id,lesson_id" });
      const acts = data.activityDates.map((d) => ({
        user_id: userId,
        day: d,
        xp_earned: 0,
      }));
      if (acts.length)
        await supabase
          .from("activity_days")
          .upsert(acts, { onConflict: "user_id,day" });
    }
    return { merged: true };
  });