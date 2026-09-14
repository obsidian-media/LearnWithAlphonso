import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ACHIEVEMENTS } from "../data/achievements";
import type { LeagueTier } from "../data/achievements";
import { getCourse } from "../data/courses";
import {
  LEAGUES,
  computeLeaguePromotion,
  computeStreakUpdate,
  computeXpGain,
} from "./progress-math";

/**
 * Course-specific progress (xp, cefr level, placement, league) lives in
 * `language_progress` (PK: user_id + language), keyed by this field.
 * Account-wide state (streak, hearts, streak freezes, achievements,
 * activity calendar) stays in `user_progress` / `activity_days` /
 * `user_achievements`, unaffected by which course is active — the same
 * split Duolingo-style apps use: one streak, one set of hearts, but a
 * separate level/XP per course.
 */
const courseSchema = z.enum(["en", "fr"]).default("en");

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

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
  cefrLevel: string;
  placementLevel: string | null;
  placementScore: number | null;
  placementTakenAt: string | null;
};

export const fetchProgress = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ course: courseSchema }).parse(d ?? {}))
  .handler(async ({ data, context }): Promise<ProgressSnapshot> => {
    const { supabase, userId } = context;
    const { course } = data;
    const [prog, lang, comps, acts, unlocks] = await Promise.all([
      supabase.from("user_progress").select("*").eq("user_id", userId).maybeSingle(),
      supabase
        .from("language_progress")
        .select("*")
        .eq("user_id", userId)
        .eq("language", course)
        .maybeSingle(),
      supabase.from("lesson_completions").select("*").eq("user_id", userId).eq("language", course),
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
    let lp = lang.data;
    if (!lp) {
      // First time this course has been opened. For "en", seed from the
      // legacy user_progress row so nothing appears to reset; for any
      // other course, start fresh at the defaults.
      const seed =
        course === "en"
          ? {
              xp: p?.xp ?? 0,
              cefr_level: p?.cefr_level ?? "A1",
              placement_level: p?.placement_level ?? null,
              placement_score: p?.placement_score ?? null,
              placement_taken_at: p?.placement_taken_at ?? null,
              league_tier: p?.league_tier ?? "bronze",
            }
          : { xp: 0, cefr_level: "A1", league_tier: "bronze" };
      const ins = await supabase
        .from("language_progress")
        .upsert({ user_id: userId, language: course, ...seed }, { onConflict: "user_id,language" })
        .select("*")
        .single();
      lp = ins.data;
    }
    const answers: Record<string, { correct: number; total: number }> = {};
    const completedLessons: string[] = [];
    for (const c of comps.data ?? []) {
      completedLessons.push(c.lesson_id);
      answers[c.lesson_id] = { correct: c.correct, total: c.total };
    }
    return {
      xp: lp?.xp ?? 0,
      streak: p?.streak ?? 0,
      longestStreak: p?.longest_streak ?? 0,
      lastActiveDate: p?.last_active_date ?? null,
      hearts: p?.hearts ?? 5,
      heartsRefillAt: p?.hearts_refill_at ? new Date(p.hearts_refill_at).getTime() : null,
      streakFreezes: p?.streak_freezes ?? 0,
      leagueTier: ((lp?.league_tier as LeagueTier) ?? "bronze") as LeagueTier,
      completedLessons,
      answersByLesson: answers,
      activityDates: (acts.data ?? []).map((a) => a.day as string),
      unlockedAchievements: (unlocks.data ?? []).map((u) => u.achievement_id as string),
      cefrLevel: lp?.cefr_level ?? "A1",
      placementLevel: lp?.placement_level ?? null,
      placementScore: lp?.placement_score ?? null,
      placementTakenAt: lp?.placement_taken_at ?? null,
    };
  });

const lessonIdSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9]+$/, "invalid lesson id");

/**
 * Issues a signed token proving this user actually opened this lesson,
 * before they can claim it complete. Called once when the lesson player
 * mounts; completeLessonRemote below requires and verifies it.
 */
export const startLessonSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ lessonId: lessonIdSchema, course: courseSchema }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const found = getCourse(data.course).findLesson(data.lessonId);
    if (!found) throw new Error("Lesson not found");
    const { issueLessonSessionToken } = await import("./lesson-session.server");
    return {
      token: issueLessonSessionToken({
        userId: context.userId,
        lessonId: data.lessonId,
        course: data.course,
      }),
    };
  });

const completeLessonSchema = z.object({
  lessonId: lessonIdSchema,
  total: z.number().int().min(1).max(50),
  // The question ids (not "<lessonId>:<questionId>" item keys -- just the
  // bare question id) the client says it got wrong, so the server derives
  // `correct` from real question membership instead of trusting a raw
  // count. Doesn't cryptographically prove an answer was checked, but it
  // does mean a forged claim needs to name real question ids for this
  // exact lesson rather than an arbitrary number.
  missedQuestionIds: z.array(z.string().regex(/^[a-z0-9]+$/)).max(50),
  course: courseSchema,
  // Proves startLessonSession was called for this exact user/lesson/course
  // combination before this claim -- see lesson-session.server.ts.
  sessionToken: z.string().min(1).max(2000),
});

export const completeLessonRemote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => completeLessonSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { lessonId, total, missedQuestionIds, course, sessionToken } = data;

    // Trust boundary: the client reports its own score, so verify the
    // lesson exists, that `total` matches its real question count, that
    // every claimed-missed question id actually belongs to this lesson
    // (deduped), and that a real lesson session was started, before
    // paying out XP for it.
    const found = getCourse(course).findLesson(lessonId);
    if (!found || total !== found.lesson.questions.length) {
      throw new Error("Invalid lesson completion payload");
    }
    const { verifyLessonSessionToken } = await import("./lesson-session.server");
    if (!verifyLessonSessionToken(sessionToken, { userId, lessonId, course })) {
      throw new Error("Invalid or expired lesson session");
    }
    const realQuestionIds = new Set(found.lesson.questions.map((q) => q.id));
    const missedSet = new Set(missedQuestionIds);
    if (missedSet.size > total || [...missedSet].some((id) => !realQuestionIds.has(id))) {
      throw new Error("Invalid lesson completion payload");
    }
    const correct = total - missedSet.size;

    const today = todayStr();
    const xpGain = computeXpGain(correct, total);

    // account-wide state: streak, hearts, freezes (unaffected by course)
    const { data: pRow } = await supabase
      .from("user_progress")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    const cur = pRow ?? {
      user_id: userId,
      streak: 0,
      longest_streak: 0,
      last_active_date: null as string | null,
      hearts: 5,
      streak_freezes: 0,
    };

    const {
      streak,
      longestStreak: longest,
      freezes,
    } = computeStreakUpdate({
      lastActiveDate: cur.last_active_date,
      today,
      streak: cur.streak,
      longestStreak: cur.longest_streak,
      freezes: cur.streak_freezes,
    });

    // per-course state: xp and league live in language_progress
    const { data: lpRow } = await supabase
      .from("language_progress")
      .select("*")
      .eq("user_id", userId)
      .eq("language", course)
      .maybeSingle();
    const curLp = lpRow ?? { xp: 0, league_tier: "bronze" };
    const xp = curLp.xp + xpGain;

    const oldIdx = LEAGUES.indexOf(curLp.league_tier as LeagueTier);
    const { leagueTier, newIdx } = computeLeaguePromotion(xp, oldIdx);

    // upsert account-wide progress
    await supabase.from("user_progress").upsert({
      user_id: userId,
      streak,
      longest_streak: longest,
      last_active_date: today,
      hearts: cur.hearts,
      streak_freezes: freezes,
    });

    // upsert per-course progress
    await supabase
      .from("language_progress")
      .upsert(
        { user_id: userId, language: course, xp, league_tier: leagueTier },
        { onConflict: "user_id,language" },
      );

    // upsert lesson completion (best score kept)
    await supabase.from("lesson_completions").upsert(
      {
        user_id: userId,
        lesson_id: lessonId,
        correct,
        total,
        xp_earned: xpGain,
        language: course,
      },
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
    const prevPromoteCount =
      prevMap.get("league_promote_3") ?? prevMap.get("league_promote_1") ?? 0;
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
        hearts_refill_at: next === 0 ? new Date(Date.now() + 30 * 60 * 1000).toISOString() : null,
      })
      .eq("user_id", userId);
    return { hearts: next };
  });

const mergeSchema = z.object({
  xp: z.number().int().min(0).max(1_000_000).default(0),
  streak: z.number().int().min(0).max(10_000).default(0),
  longestStreak: z.number().int().min(0).max(10_000).default(0),
  completedLessons: z
    .array(
      z
        .string()
        .max(100)
        .regex(/^[a-z0-9]+$/),
    )
    .max(500)
    .default([]),
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
        await supabase.from("activity_days").upsert(acts, { onConflict: "user_id,day" });
    }
    return { merged: true };
  });
const LEVELS_ENUM = ["A1", "A2", "B1", "B2", "C1"] as const;

export const setCefrLevel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ level: z.enum(LEVELS_ENUM), course: courseSchema }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await supabase
      .from("language_progress")
      .upsert(
        { user_id: userId, language: data.course, cefr_level: data.level },
        { onConflict: "user_id,language" },
      );
    return { cefrLevel: data.level };
  });

export const savePlacementResult = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        level: z.enum(LEVELS_ENUM),
        score: z.number().int().min(0).max(100),
        course: courseSchema,
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const takenAt = new Date().toISOString();
    await supabase.from("language_progress").upsert(
      {
        user_id: userId,
        language: data.course,
        cefr_level: data.level,
        placement_level: data.level,
        placement_score: data.score,
        placement_taken_at: takenAt,
      },
      { onConflict: "user_id,language" },
    );
    return {
      cefrLevel: data.level,
      placementLevel: data.level,
      placementScore: data.score,
      placementTakenAt: takenAt,
    };
  });
