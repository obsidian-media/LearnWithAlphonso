import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveNvidiaChatModel } from "@/lib/nvidia-chat-model.server";
import type { Json } from "@/integrations/supabase/types";
import { ACHIEVEMENTS } from "../data/achievements";
import type { LeagueTier } from "../data/achievements";
import { getCourse } from "../data/courses";
import {
  LEAGUES,
  computeLeaguePromotion,
  computeLessonReplayXp,
  computeStreakUpdate,
  deriveLessonCompletion,
} from "./progress-math";
import {
  MAX_HEARTS,
  XP_HEART_COST,
  gainHearts,
  perfectLessonBonusEarned,
  resolveHeartsRefill,
  streakHeartMilestoneReached,
} from "./hearts";

/**
 * Course-specific progress (xp, cefr level, placement, league) lives in
 * `language_progress` (PK: user_id + language), keyed by this field.
 * Account-wide state (streak, hearts, streak freezes, achievements,
 * activity calendar) stays in `user_progress` / `activity_days` /
 * `user_achievements`, unaffected by which course is active — the same
 * split Duolingo-style apps use: one streak, one set of hearts, but a
 * separate level/XP per course.
 */
const courseSchema = z.enum(["en", "fr", "es"]).default("en");

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
      // user_progress/language_progress no longer grant direct INSERT/UPDATE
      // to `authenticated` (see supabase/migrations/
      // 20260920050000_revoke_direct_gamification_writes.sql) -- this
      // handler already validated the request via requireSupabaseAuth, so
      // supabaseAdmin (service-role, bypasses RLS) is the correct trust
      // boundary for the actual write, same pattern the complete-lesson/
      // grade-review Edge Functions already use.
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const ins = await supabaseAdmin
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
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const ins = await supabaseAdmin
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

    // A pending "out of hearts" timer may have already elapsed since this
    // row was last written -- resolve it now (full refill) and persist,
    // rather than leaving the client to display a countdown that never
    // actually restores anything.
    const rawHeartsRefillAt = p?.hearts_refill_at ? new Date(p.hearts_refill_at).getTime() : null;
    const resolvedHearts = resolveHeartsRefill(
      p?.hearts ?? MAX_HEARTS,
      rawHeartsRefillAt,
      Date.now(),
    );
    if (
      resolvedHearts.hearts !== (p?.hearts ?? MAX_HEARTS) ||
      resolvedHearts.heartsRefillAt !== rawHeartsRefillAt
    ) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin
        .from("user_progress")
        .update({ hearts: resolvedHearts.hearts, hearts_refill_at: null })
        .eq("user_id", userId);
    }

    return {
      xp: lp?.xp ?? 0,
      streak: p?.streak ?? 0,
      longestStreak: p?.longest_streak ?? 0,
      lastActiveDate: p?.last_active_date ?? null,
      hearts: resolvedHearts.hearts,
      heartsRefillAt: resolvedHearts.heartsRefillAt,
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
    // paying out XP for it. See deriveLessonCompletion for the pure,
    // unit-tested membership check.
    const found = getCourse(course).findLesson(lessonId);
    if (!found) {
      throw new Error("Invalid lesson completion payload");
    }
    const { verifyLessonSessionToken } = await import("./lesson-session.server");
    if (!verifyLessonSessionToken(sessionToken, { userId, lessonId, course })) {
      throw new Error("Invalid or expired lesson session");
    }
    const { correct } = deriveLessonCompletion(found.lesson, total, missedQuestionIds);

    const today = todayStr();

    // Batch every read this handler needs that doesn't depend on another
    // read's result -- was 3+ sequential round trips, now 1.
    const [{ data: pRow }, { data: lpRow }, { data: existingComp }, { data: existingDay }] =
      await Promise.all([
        supabase.from("user_progress").select("*").eq("user_id", userId).maybeSingle(),
        supabase
          .from("language_progress")
          .select("*")
          .eq("user_id", userId)
          .eq("language", course)
          .maybeSingle(),
        supabase
          .from("lesson_completions")
          .select("correct,xp_earned")
          .eq("user_id", userId)
          .eq("lesson_id", lessonId)
          .eq("language", course)
          .maybeSingle(),
        supabase
          .from("activity_days")
          .select("xp_earned")
          .eq("user_id", userId)
          .eq("day", today)
          .maybeSingle(),
      ]);

    // Replay-farming fix: a repeat completion of an already-completed
    // lesson only pays out the XP delta over its previous best score (0 if
    // this attempt doesn't improve on it), instead of the full amount
    // every time -- previously completeLessonRemote had no dedup check at
    // all, so a scripted loop of startLessonSession+completeLessonRemote
    // against any lesson farmed unlimited XP and hearts.
    const { bestCorrect, bestXp, xpGain } = computeLessonReplayXp(
      existingComp ? { correct: existingComp.correct, xpEarned: existingComp.xp_earned } : null,
      correct,
      total,
    );

    const cur = pRow ?? {
      user_id: userId,
      streak: 0,
      longest_streak: 0,
      last_active_date: null as string | null,
      hearts: MAX_HEARTS,
      hearts_refill_at: null as string | null,
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

    // Resolve any pending passive regen first, then layer bonuses on top:
    // a streak milestone grants a full refill (takes priority), otherwise
    // a perfect lesson (zero misses) grants a single heart back.
    const regen = resolveHeartsRefill(
      cur.hearts,
      cur.hearts_refill_at ? new Date(cur.hearts_refill_at).getTime() : null,
      Date.now(),
    );
    let heartsResult = regen;
    let heartsBonus: "streak" | "perfect" | null = null;
    if (streakHeartMilestoneReached(cur.streak, streak)) {
      heartsResult = { hearts: MAX_HEARTS, heartsRefillAt: null };
      heartsBonus = "streak";
      // Gated on xpGain > 0 (a genuine improvement, not a replay) so the
      // same replay-farming loop this session's XP fix closes can't still
      // farm free hearts by repeatedly "completing" an already-perfect
      // lesson with no new XP.
    } else if (
      perfectLessonBonusEarned(correct, total) &&
      xpGain > 0 &&
      regen.hearts < MAX_HEARTS
    ) {
      heartsResult = gainHearts(regen.hearts, 1);
      heartsBonus = "perfect";
    }

    // per-course state: xp and league live in language_progress
    const curLp = lpRow ?? { xp: 0, league_tier: "bronze" };
    const xp = curLp.xp + xpGain;

    const oldIdx = LEAGUES.indexOf(curLp.league_tier as LeagueTier);
    const { leagueTier, newIdx } = computeLeaguePromotion(xp, oldIdx);

    // Friends activity feed (supabase/migrations/20260920010000_friend_activity_events.sql).
    // Kept in sync by hand with the same logic in
    // supabase/functions/complete-lesson/index.ts (the native iOS path) --
    // see that file's comment for why only xpGain > 0 completions are
    // logged, not every replay.
    const activityEvents: { user_id: string; event_type: string; payload: Json }[] = [];
    if (xpGain > 0) {
      activityEvents.push({
        user_id: userId,
        event_type: "lesson_completed",
        payload: { lessonId, xpGain },
      });
    }
    if (heartsBonus === "streak") {
      activityEvents.push({ user_id: userId, event_type: "streak_milestone", payload: { streak } });
    }
    if (newIdx > oldIdx) {
      activityEvents.push({
        user_id: userId,
        event_type: "league_promotion",
        payload: { newTier: leagueTier },
      });
    }

    // Independent writes -- none reads another's result -- batched into
    // one round trip instead of several sequential ones. user_progress/
    // language_progress/lesson_completions/activity_days no longer grant
    // direct INSERT/UPDATE to `authenticated` (see supabase/migrations/
    // 20260920050000_revoke_direct_gamification_writes.sql) -- every value
    // here is already server-computed above (trust boundary already
    // crossed), so supabaseAdmin is the correct client for the actual
    // persist, same as the complete-lesson Edge Function's own writes.
    // friend_activity_events is unaffected (not one of the hardened
    // tables) and stays on the RLS-scoped client.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await Promise.all([
      supabaseAdmin.from("user_progress").upsert({
        user_id: userId,
        streak,
        longest_streak: longest,
        last_active_date: today,
        hearts: heartsResult.hearts,
        hearts_refill_at: heartsResult.heartsRefillAt
          ? new Date(heartsResult.heartsRefillAt).toISOString()
          : null,
        streak_freezes: freezes,
      }),
      supabaseAdmin
        .from("language_progress")
        .upsert(
          { user_id: userId, language: course, xp, league_tier: leagueTier },
          { onConflict: "user_id,language" },
        ),
      // Best score kept: correct/xp_earned reflect the best attempt ever
      // recorded for this lesson, not just this attempt.
      supabaseAdmin.from("lesson_completions").upsert(
        {
          user_id: userId,
          lesson_id: lessonId,
          correct: bestCorrect,
          total,
          xp_earned: bestXp,
          language: course,
        },
        { onConflict: "user_id,lesson_id" },
      ),
      supabaseAdmin.from("activity_days").upsert({
        user_id: userId,
        day: today,
        xp_earned: (existingDay?.xp_earned ?? 0) + xpGain,
      }),
      ...(activityEvents.length > 0
        ? [supabase.from("friend_activity_events").insert(activityEvents)]
        : []),
    ]);

    // Both reads below depend on the writes above having landed (lesson
    // count/perfect count must include this attempt), but not on each
    // other -- batched together.
    const [{ data: allComps }, { data: prevUnlocks }] = await Promise.all([
      supabase.from("lesson_completions").select("correct,total").eq("user_id", userId),
      supabase.from("user_achievements").select("achievement_id,progress").eq("user_id", userId),
    ]);
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
      // Same admin-write rationale as the batch above -- user_achievements
      // is one of the hardened tables too.
      await supabaseAdmin
        .from("user_achievements")
        .upsert(rows, { onConflict: "user_id,achievement_id" });
    }

    // V3 package 3b: "unify weakness signals" -- lesson mistakes now feed
    // the same taxonomy-constrained detection pipeline conversation
    // transcripts do (src/lib/weakness-detection.server.ts), not a
    // separate parallel system. Gated on a real miss on a real completion
    // (xpGain > 0, not a zero-gain replay) so this doesn't fire on every
    // completion. Awaited rather than fire-and-forget: this serverless
    // environment has no safe background-task primitive to rely on, so
    // the trade-off is accepted latency on the subset of completions that
    // actually have a mistake to learn from, not silently-dropped work.
    // Wrapped in try/catch -- a classification failure must never fail
    // the lesson completion itself.
    if (missedQuestionIds.length > 0 && xpGain > 0 && process.env.NVIDIA_API_KEY) {
      try {
        const missedQuestions = found.lesson.questions.filter((q) =>
          missedQuestionIds.includes(q.id),
        );
        const transcriptMessages = missedQuestions.map((q) => ({
          role: "user" as const,
          // A listening question's stem is a constant ("What did you hear?"),
          // so the spoken sentence is the only part with any signal in it --
          // without this the classifier sees the same prompt for every miss.
          content: `Question: ${
            q.type === "listening" ? `${q.prompt} (heard: "${q.audioText}")` : q.prompt
          } — I answered incorrectly. The correct answer was: ${
            q.type === "mc" ? q.choices[q.answer] : q.answer
          }.`,
        }));
        if (transcriptMessages.length > 0) {
          const { detectAndRecordWeaknesses } = await import("./weakness-detection.server");
          await detectAndRecordWeaknesses({
            userId,
            sourceDescription: "set of English lesson questions the learner got wrong",
            transcriptMessages,
            nvidiaApiKey: process.env.NVIDIA_API_KEY,
            nvidiaModel: resolveNvidiaChatModel(),
            dedupCheck: async (label) => {
              const { data: existing } = await supabase
                .from("review_items")
                .select("item_key")
                .eq("user_id", userId)
                .eq("source", "weakness")
                .eq("weakness_label", label)
                .maybeSingle();
              return !!existing;
            },
            adminInsertReviewItem: async (weakness) => {
              const weaknessItemKey = `weakness:${crypto.randomUUID().replace(/-/g, "")}`;
              const { error } = await supabaseAdmin.from("review_items").insert({
                user_id: userId,
                item_key: weaknessItemKey,
                lesson_id: "weakness",
                level: "A1",
                language: course,
                ease: 2.5,
                interval_days: 0,
                repetitions: 0,
                due_on: today,
                source: "weakness",
                weakness_label: weakness.label,
                weakness_display: weakness.display,
                prompt: weakness.prompt,
                choices: weakness.choices,
                answer_index: weakness.answerIndex,
                explanation: weakness.explanation,
              });
              return !error;
            },
            adminInsertEvent: async (category) => {
              await supabaseAdmin
                .from("weakness_events")
                .insert({ user_id: userId, category, event_type: "detected" });
            },
          });
        }
      } catch {
        // best-effort -- never fail the lesson completion over this
      }
    }

    // return refreshed snapshot for optimistic apply
    return {
      xpGain,
      newlyUnlocked,
      heartsBonus,
      progress: {
        xp,
        streak,
        longestStreak: longest,
        lastActiveDate: today,
        hearts: heartsResult.hearts,
        heartsRefillAt: heartsResult.heartsRefillAt,
        streakFreezes: freezes,
        leagueTier,
      },
    };
  });

/**
 * Calls the `lose_heart` SECURITY DEFINER RPC (supabase/migrations/
 * 20260920050000_revoke_direct_gamification_writes.sql) rather than a
 * manual read-then-write under RLS -- same row-locked atomicity reasoning
 * as restoreHeartsRemote/buyHeartWithXpRemote below, and the same RPC the
 * native iOS client calls directly.
 */
export const loseHeartRemote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase.rpc("lose_heart");
    if (error) throw new Error("Could not record heart loss");
    const row = Array.isArray(data) ? data[0] : data;
    return { hearts: row?.hearts ?? MAX_HEARTS };
  });

/**
 * Called by the client the moment its countdown reaches zero, so hearts
 * come back immediately instead of waiting for the next page load to
 * hydrate. Also safe to call speculatively -- it's a no-op if no refill
 * is actually due yet.
 */
/**
 * These two hearts endpoints call SECURITY DEFINER RPCs
 * (supabase/migrations/20260918141500_hearts_economy_rpcs.sql) rather than
 * doing a manual read-then-write under RLS: the RPCs take a row lock for
 * the duration of the check-then-write, which the previous
 * select-compute-update implementation didn't, and closes a real race
 * window under concurrent calls (see that migration's own comment).
 */
export const restoreHeartsRemote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase.rpc("restore_hearts_if_due");
    if (error) throw new Error("Could not check hearts refill");
    const row = Array.isArray(data) ? data[0] : data;
    return {
      hearts: row?.hearts ?? MAX_HEARTS,
      heartsRefillAt: row?.hearts_refill_at ? new Date(row.hearts_refill_at).getTime() : null,
    };
  });

export type BuyHeartResult =
  | { ok: true; hearts: number; xp: number; cost: number }
  | { ok: false; reason: "hearts-full" | "insufficient-xp"; hearts: number | null };

/** Spend XP from the active course to buy back a heart -- gives impatient
 * users a way to unblock themselves besides waiting out the timer. */
export const buyHeartWithXpRemote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ course: courseSchema }).parse(d ?? {}))
  .handler(async ({ data, context }): Promise<BuyHeartResult> => {
    const { supabase } = context;
    const { data: rpcData, error } = await supabase.rpc("buy_heart_with_xp", {
      _course: data.course,
      _cost: XP_HEART_COST,
    });
    if (error) throw new Error("Could not process heart purchase");
    const row = Array.isArray(rpcData) ? rpcData[0] : rpcData;
    if (!row?.ok) {
      return {
        ok: false,
        reason: row?.reason === "hearts-full" ? "hearts-full" : "insufficient-xp",
        hearts: row?.hearts ?? null,
      };
    }
    return { ok: true, hearts: row.hearts ?? 0, xp: row.xp ?? 0, cost: XP_HEART_COST };
  });

const XP_STREAK_FREEZE_COST = 75;

export type BuyStreakFreezeResult =
  | { ok: true; streakFreezes: number; xp: number; cost: number }
  | { ok: false; reason: "insufficient-xp"; streakFreezes: number | null };

/**
 * Spend XP from the active course to buy an extra streak freeze -- same
 * RPC-first pattern as buyHeartWithXpRemote above
 * (supabase/migrations/20260920060000_v3_engagement_mechanics.sql). No
 * "full" rejection case: unlike hearts, streak_freezes has no cap.
 */
export const buyStreakFreezeWithXpRemote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ course: courseSchema }).parse(d ?? {}))
  .handler(async ({ data, context }): Promise<BuyStreakFreezeResult> => {
    const { supabase } = context;
    const { data: rpcData, error } = await supabase.rpc("buy_streak_freeze_with_xp", {
      _course: data.course,
      _cost: XP_STREAK_FREEZE_COST,
    });
    if (error) throw new Error("Could not process streak freeze purchase");
    const row = Array.isArray(rpcData) ? rpcData[0] : rpcData;
    if (!row?.ok) {
      return { ok: false, reason: "insufficient-xp", streakFreezes: row?.streak_freezes ?? null };
    }
    return {
      ok: true,
      streakFreezes: row.streak_freezes ?? 0,
      xp: row.xp ?? 0,
      cost: XP_STREAK_FREEZE_COST,
    };
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
      // Same admin-write rationale as completeLessonRemote above -- all
      // three tables are hardened (supabase/migrations/
      // 20260920050000_revoke_direct_gamification_writes.sql).
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.from("user_progress").upsert({
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
        await supabaseAdmin
          .from("lesson_completions")
          .upsert(comps, { onConflict: "user_id,lesson_id" });
      const acts = data.activityDates.map((d) => ({
        user_id: userId,
        day: d,
        xp_earned: 0,
      }));
      if (acts.length)
        await supabaseAdmin.from("activity_days").upsert(acts, { onConflict: "user_id,day" });
    }
    return { merged: true };
  });
const LEVELS_ENUM = ["A1", "A2", "B1", "B2", "C1"] as const;

/**
 * Calls the `set_cefr_level` SECURITY DEFINER RPC (supabase/migrations/
 * 20260920050000_revoke_direct_gamification_writes.sql) rather than a
 * direct upsert -- language_progress no longer grants direct INSERT/UPDATE
 * to `authenticated`. Same RPC the native iOS client calls directly.
 */
export const setCefrLevel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ level: z.enum(LEVELS_ENUM), course: courseSchema }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.rpc("set_cefr_level", {
      _language: data.course,
      _level: data.level,
    });
    if (error) throw new Error("Could not set CEFR level");
    return { cefrLevel: data.level };
  });

/**
 * Calls the `save_placement_result` SECURITY DEFINER RPC (same migration
 * as setCefrLevel above) rather than a direct upsert. Same RPC the native
 * iOS client calls directly.
 */
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
    const { supabase } = context;
    const { data: takenAt, error } = await supabase.rpc("save_placement_result", {
      _language: data.course,
      _level: data.level,
      _score: data.score,
    });
    if (error) throw new Error("Could not save placement result");
    return {
      cefrLevel: data.level,
      placementLevel: data.level,
      placementScore: data.score,
      placementTakenAt: takenAt as string,
    };
  });
