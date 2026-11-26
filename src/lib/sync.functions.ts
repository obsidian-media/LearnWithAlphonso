import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveLlmApiKey, resolveLlmChatModel } from "@/lib/llm-chat-model.server";
import type { Json } from "@/integrations/supabase/types";
import { ACHIEVEMENTS } from "../data/achievements";
import type { LeagueTier } from "../data/achievements";
import { getCourse } from "../data/courses";
import {
  LEAGUES,
  computeLeaguePromotion,
  computeLessonReplayXp,
  computeStreakUpdate,
} from "./progress-math";
import { makeBlockedTermCheck } from "./ai-safety";
import { gradeLessonAnswer } from "./grade-lesson-answer.server";
import { resolveLessonSubmission } from "./lesson-version";
import { localDay, streakBridge } from "./local-day";
import { recordOpsEvent } from "./ops-events.server";
import { readAllRows } from "./paged-read";
import { lessonProfilePayload } from "./profile-data";
import {
  MAX_HEARTS,
  XP_HEART_COST,
  gainHearts,
  perfectLessonBonusEarned,
  resolveHeartsRefill,
  streakHeartMilestoneReached,
  heartsGate,
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

export type ProgressSnapshot = {
  xp: number;
  streak: number;
  longestStreak: number;
  lastActiveDate: string | null;
  /** user_progress.day_basis: the shown streak's one-time UTC bridge (streak-display.ts). */
  dayBasis: string | null;
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
      // Every completion of this course, however many: one bare select stops at the API row cap without an error.
      readAllRows((from, to) =>
        supabase
          .from("lesson_completions")
          .select("lesson_id,correct,total", { count: "exact" })
          .eq("user_id", userId)
          .eq("language", course)
          .order("id")
          .range(from, to),
      ),
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
    // A failed or partial read must not look like "nothing completed": that would show the learner an empty map.
    if (comps.error) throw new Error("fetchProgress: could not read lesson completions");
    for (const c of comps.data ?? []) {
      completedLessons.push(c.lesson_id);
      answers[c.lesson_id] = { correct: c.correct, total: c.total };
    }

    // Hearts refill one per 30 minutes while below the cap. Hearts that came due since this row was last
    // written are added now and persisted (with the clock for the next one), rather than leaving the client to
    // display a countdown that never actually restores anything.
    const rawHeartsRefillAt = p?.hearts_refill_at ? new Date(p.hearts_refill_at).getTime() : null;
    const resolvedHearts = resolveHeartsRefill(
      p?.hearts ?? MAX_HEARTS,
      rawHeartsRefillAt,
      Date.now(),
    );
    let shownHearts = resolvedHearts;
    const readHearts = p?.hearts ?? MAX_HEARTS;
    if (
      resolvedHearts.hearts !== readHearts ||
      resolvedHearts.heartsRefillAt !== rawHeartsRefillAt
    ) {
      // An optimistic update: write only if the row still has the values read above. A lose_heart that landed
      // between the read and this write must not be overwritten (a lost heart would come back). When nothing
      // matched, show the row as it is now instead of clobbering it.
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      let update = supabaseAdmin
        .from("user_progress")
        .update({
          hearts: resolvedHearts.hearts,
          hearts_refill_at: resolvedHearts.heartsRefillAt
            ? new Date(resolvedHearts.heartsRefillAt).toISOString()
            : null,
        })
        .eq("user_id", userId)
        .eq("hearts", readHearts);
      update = p?.hearts_refill_at
        ? update.eq("hearts_refill_at", p.hearts_refill_at)
        : update.is("hearts_refill_at", null);
      const { data: written } = await update.select("hearts");
      if (!written || written.length === 0) {
        const { data: fresh } = await supabaseAdmin
          .from("user_progress")
          .select("hearts, hearts_refill_at")
          .eq("user_id", userId)
          .maybeSingle();
        if (fresh) {
          shownHearts = resolveHeartsRefill(
            typeof fresh.hearts === "number" ? fresh.hearts : MAX_HEARTS,
            fresh.hearts_refill_at ? new Date(fresh.hearts_refill_at).getTime() : null,
            Date.now(),
          );
        }
      }
    }

    return {
      xp: lp?.xp ?? 0,
      streak: p?.streak ?? 0,
      longestStreak: p?.longest_streak ?? 0,
      lastActiveDate: p?.last_active_date ?? null,
      dayBasis: p?.day_basis ?? null,
      hearts: shownHearts.hearts,
      heartsRefillAt: shownHearts.heartsRefillAt,
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
export type StartLessonSessionResult =
  | { token: string }
  | { error: "out-of-hearts"; refillAt: number | null }
  | { error: "lesson-locked" };

export const startLessonSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ lessonId: lessonIdSchema, course: courseSchema }).parse(d),
  )
  .handler(async ({ data, context }): Promise<StartLessonSessionResult> => {
    const found = getCourse(data.course).findLesson(data.lessonId);
    if (!found) throw new Error("Lesson not found");
    // Unlock order is enforced HERE, from this learner's own completions and stored level (never client input):
    // "locked" used to be drawn by the Learn screen only. Same rule as the start-lesson-session Edge Function and the
    // Learn map (lesson-unlock.ts). A failed read lets the learner in (logged).
    const { lessonStartVerdict } = await import("./lesson-unlock.server");
    if (
      (await lessonStartVerdict(context.supabase, context.userId, data.course, data.lessonId)) ===
      "locked"
    ) {
      return { error: "lesson-locked" };
    }
    // No lesson starts at 0 hearts. This is the same heartsGate as the start-lesson-session edge function, so
    // web and iOS share one rule. Returned as a value rather than thrown, because the page needs refillAt for
    // its countdown. A failed hearts read fails OPEN (an economy rule must not lock a learner out).
    const { heartsGateEnforced } = await import("./hearts-gate.server");
    // Alphonso Pro has unlimited hearts. Asked on every start (cached for up to an hour) so lose_heart() also honours
    // it for the whole lesson. When RevenueCat cannot be asked: the last stored answer at any age, else not Pro (so
    // the normal out-of-hearts answer applies); never an error.
    const { heartsProWithFallback, liveHeartsServerDeps } = await import("./hearts-server.server");
    const unlimited = liveHeartsServerDeps().then((deps) =>
      heartsProWithFallback(context.userId, deps),
    );
    if (heartsGateEnforced()) {
      const { data: row, error } = await context.supabase
        .from("user_progress")
        .select("hearts, hearts_refill_at")
        .eq("user_id", context.userId)
        .maybeSingle();
      if (!error) {
        const gate = heartsGate(
          typeof row?.hearts === "number" ? row.hearts : MAX_HEARTS,
          row?.hearts_refill_at ? new Date(row.hearts_refill_at).getTime() : null,
          Date.now(),
        );
        if (gate.blocked) {
          const pro = await unlimited;
          if (pro.source !== "live") {
            console.error(
              JSON.stringify({
                event: pro.source === "stale" ? "hearts_gate_stale_pro" : "hearts_gate_pro_unknown",
                fn: "startLessonSession",
              }),
            );
          }
          if (!pro.pro) return { error: "out-of-hearts", refillAt: gate.refillAt };
        }
      }
    }
    await unlimited;
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
  // §0.1-d #6: this used to be a client-claimed missedQuestionIds list, with
  // no check that any answer was ever actually graded -- a forged client
  // could report zero misses regardless of what it submitted. Now the
  // client submits what it actually answered, one entry per real question,
  // and the server derives correctness itself (see gradeLessonAnswer)
  // instead of trusting a claimed pass/fail.
  answers: z
    .array(
      z.object({
        questionId: z.string().regex(/^[a-z0-9]+$/),
        answer: z.string().max(2000),
      }),
    )
    .max(50),
  course: courseSchema,
  // Proves startLessonSession was called for this exact user/lesson/course
  // combination before this claim -- see lesson-session.server.ts.
  sessionToken: z.string().min(1).max(2000),
});

/** How many times a completion is recomputed from a fresh read after the transaction refuses a stale snapshot. */
const COMPLETION_CONFLICT_RETRIES = 3;

/** The reply the apps and the web page read (also what a redeemed token answers with). */
type CompletionResponse = {
  xpGain: number;
  correct: number;
  newlyUnlocked: string[];
  heartsBonus: "streak" | "perfect" | null;
  previousLeagueTier: LeagueTier;
  progress: {
    xp: number;
    streak: number;
    longestStreak: number;
    lastActiveDate: string;
    hearts: number;
    heartsRefillAt: number | null;
    streakFreezes: number;
    leagueTier: LeagueTier;
  };
  /** Set when the lesson is saved but its hearts could not be settled just now (logged; the apps ignore it). */
  settlementPending?: boolean;
};

export const completeLessonRemote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => completeLessonSchema.parse(d))
  .handler(async ({ data, context }): Promise<CompletionResponse> => {
    const { supabase, userId } = context;
    const { lessonId, total: claimedTotal, answers: claimedAnswers, course, sessionToken } = data;

    const { createHash } = await import("node:crypto");
    const tokenHash = createHash("sha256").update(sessionToken).digest("hex");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // The redemption table and functions are not in the generated types until they are regenerated.
    const redemptionDb = supabaseAdmin as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (
            c: string,
            v: string,
          ) => {
            eq: (
              c: string,
              v: string,
            ) => {
              maybeSingle: () => Promise<{
                data: {
                  result: CompletionResponse;
                  misses: number;
                  settle_since: string;
                  lesson_id: string;
                  course: string;
                } | null;
                error: { code?: string } | null;
              }>;
            };
          };
        };
      };
      rpc: (
        name: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: { message: string; code?: string } | null }>;
    };
    // Hearts for a completion this token already saved: settled from the ORIGINAL misses (idempotent per token, so a
    // retry after a settlement charges nothing more, and a first attempt that saved but never settled is settled now).
    const replayRedeemed = async (prior: {
      result: CompletionResponse;
      misses: number;
      settle_since: string;
    }): Promise<CompletionResponse> => {
      const { serverHeartsMode } = await import("./hearts-gate.server");
      const { settleLessonHeartsStrict, liveHeartsServerDeps } =
        await import("./hearts-server.server");
      const settleArgs = {
        userId,
        sessionToken,
        misses: prior.misses,
        sinceMs: Date.parse(prior.settle_since),
        mode: serverHeartsMode(),
      };
      const heartsDeps = await liveHeartsServerDeps();
      // One inline retry; the lesson is saved either way, so a second failure is reported as pending, not an error.
      let again = await settleLessonHeartsStrict(settleArgs, heartsDeps);
      if (!again.ok) again = await settleLessonHeartsStrict(settleArgs, heartsDeps);
      const progress = { ...prior.result.progress };
      if (again.ok && again.settlement) {
        progress.hearts = again.settlement.hearts;
        progress.heartsRefillAt = again.settlement.heartsRefillAt;
      }
      // The stored copy is the first completion's snapshot and the apps overwrite their cache with this reply, so the
      // progress is the CURRENT one (read only). A failed read keeps the stored values for that part.
      const [pr, lpr] = await Promise.all([
        supabaseAdmin
          .from("user_progress")
          .select(
            "streak, longest_streak, last_active_date, hearts, hearts_refill_at, streak_freezes",
          )
          .eq("user_id", userId)
          .maybeSingle(),
        supabaseAdmin
          .from("language_progress")
          .select("xp, league_tier")
          .eq("user_id", userId)
          .eq("language", course)
          .maybeSingle(),
      ]);
      if (!pr.error && pr.data) {
        progress.streak = pr.data.streak ?? progress.streak;
        progress.longestStreak = pr.data.longest_streak ?? progress.longestStreak;
        progress.lastActiveDate = pr.data.last_active_date ?? progress.lastActiveDate;
        progress.hearts = pr.data.hearts ?? progress.hearts;
        progress.heartsRefillAt = pr.data.hearts_refill_at
          ? new Date(pr.data.hearts_refill_at).getTime()
          : null;
        progress.streakFreezes = pr.data.streak_freezes ?? progress.streakFreezes;
      }
      if (!lpr.error && lpr.data) {
        progress.xp = lpr.data.xp ?? progress.xp;
        progress.leagueTier = (lpr.data.league_tier as LeagueTier) ?? progress.leagueTier;
      }
      const reply: CompletionResponse = { ...prior.result, progress };
      if (!again.ok) {
        console.error(
          JSON.stringify({ event: "hearts_settlement_pending", fn: "completeLessonRemote" }),
        );
        reply.settlementPending = true;
      }
      return reply;
    };

    // A token redeems once: a repeat (a retry after a lost response) is answered from what the first completion stored,
    // before anything is re-graded or written, whatever answers it carries.
    const priorRead = await redemptionDb
      .from("lesson_session_redemptions")
      .select("result, misses, settle_since, lesson_id, course")
      .eq("token_hash", tokenHash)
      .eq("user_id", userId)
      .maybeSingle();
    if (priorRead.error) {
      throw new Error("Could not load lesson progress");
    }
    if (
      priorRead.data &&
      priorRead.data.lesson_id === lessonId &&
      priorRead.data.course === course
    ) {
      return await replayRedeemed(priorRead.data);
    }

    // Trust boundary: the client reports its own score, so verify the
    // lesson exists, that `total` matches its real question count, that
    // the answers cover exactly this lesson's real questions (no missing,
    // no duplicate, no foreign id -- see resolveLessonSubmission), and
    // that a real lesson session was started, before grading anything.
    const found = getCourse(course).findLesson(lessonId);
    // Accepts the current lesson and the version before appended extras (lesson-version.ts); what is graded and paid
    // from here on is the accepted set, never the client's own count.
    const submission = resolveLessonSubmission(found?.lesson ?? null, claimedTotal, claimedAnswers);
    if (!found || !submission.ok) {
      throw new Error("Invalid lesson completion payload");
    }
    const { answers, total } = submission;
    const { lessonSessionIssuedAt } = await import("./lesson-session.server");
    const sessionIssuedAt = lessonSessionIssuedAt(sessionToken, { userId, lessonId, course });
    if (sessionIssuedAt === null) {
      throw new Error("Invalid or expired lesson session");
    }

    // The actual re-grade: never trust which questions the client says it
    // missed, derive it from the real answer key. Sequential, not
    // Promise.all -- a lesson has at most a handful of "translate"
    // questions capable of an AI call, and each one already re-uses the
    // exact same local-first check the player showed the learner live.
    // 2026-09-30 audit: lesson-completion translate grading had no quota
    // gate at all -- see grade-lesson-answer.server.ts's own doc comment.
    // Built once, reused across however many translate questions this one
    // lesson has (each call still independently decrements/checks quota).
    // getRequest() is called lazily, inside the closure, not eagerly here
    // -- same reason review.functions.ts's identical checkQuota does the
    // same: it throws outside a TanStack Start request context (every
    // other test in this suite calls completeLessonRemote directly), so
    // it must only run when a translate question actually needs it, not
    // on every lesson completion.
    const checkQuota = async () => {
      const { consumeQuota } = await import("./ai-quota.server");
      const quota = await consumeQuota(getRequest(), "translate");
      return quota.ok;
    };

    // Read once, and only if some answer needs the AI grader or weakness detection.
    let consent: Promise<boolean> | undefined;
    const aiAllowed = async () => {
      const { hasAiConsent } = await import("./ai-consent.server");
      // strict: an unreadable consent row throws (nothing is saved yet) rather than reading as "no consent", which
      // would keep the curated verdict and could save a wrong grade.
      consent ??= hasAiConsent(supabase, userId, { strict: true });
      return consent;
    };

    const questionById = new Map(found.lesson.questions.map((q) => [q.id, q]));
    const missedQuestionIds: string[] = [];
    const graded: { type: string; correct: boolean }[] = [];
    for (const { questionId, answer } of answers) {
      // Safe: resolveLessonSubmission already proved questionId is a
      // real id in this lesson.
      const question = questionById.get(questionId)!;
      const isCorrect = await gradeLessonAnswer(question, answer, course, {
        allowed: aiAllowed,
        checkQuota,
      });
      if (!isCorrect) missedQuestionIds.push(questionId);
      graded.push({ type: question.type, correct: isCorrect });
    }
    const correct = answers.length - missedQuestionIds.length;

    // The learner's own calendar day (owner decision 2026-11-12): their stored zone, UTC when none is known.
    const { readLearnerTimeZone } = await import("./learner-time-zone.server");
    // strict: an unreadable zone throws (nothing is saved yet) rather than booking the day as UTC.
    const today = localDay(
      Date.now(),
      await readLearnerTimeZone(supabase, userId, { strict: true }),
    );

    // Read the current state, derive the next one, and write it in one transaction. Another write to the same
    // account (a lost heart, a quest reward, a second device) between the read and the write makes the snapshot
    // stale; the transaction refuses it and this runs again from a fresh read, so the lesson is never dropped.
    // Hourly ceiling (anti-farming.ts): taken once per completion, only when it pays XP (an already-recorded replay is a
    // no-op), refused before any write, and given back if the save then fails so the client's retry is not double counted.
    let slotHeld = false;
    const slotAtIso = new Date().toISOString();
    const applyOnce = async () => {
      // Batch every read this handler needs that doesn't depend on another
      // read's result -- was 3+ sequential round trips, now 1.
      const [pResult, lpResult, compResult, dayResult] = await Promise.all([
        supabase.from("user_progress").select("*").eq("user_id", userId).maybeSingle(),
        supabase
          .from("language_progress")
          .select("*")
          .eq("user_id", userId)
          .eq("language", course)
          .maybeSingle(),
        supabase
          .from("lesson_completions")
          .select("correct,total,xp_earned")
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
      const readError = [pResult, lpResult, compResult, dayResult].find((r) => r.error);
      if (readError) throw new Error("Could not load lesson progress");
      const pRow = pResult.data;
      const lpRow = lpResult.data;
      const existingComp = compResult.data;
      const existingDay = dayResult.data;

      // Replay-farming fix: a repeat completion of an already-completed
      // lesson only pays out the XP delta over its previous best score (0 if
      // this attempt doesn't improve on it), instead of the full amount
      // every time -- previously completeLessonRemote had no dedup check at
      // all, so a scripted loop of startLessonSession+completeLessonRemote
      // against any lesson farmed unlimited XP and hearts.
      // The stored best is a (correct, total) pair: the total only ever grows (a lesson that gained extras), so a
      // replay of the older, shorter version can neither break correct <= total nor re-earn the perfect bonus.
      const bestTotal = Math.max(existingComp?.total ?? 0, total);
      const { bestCorrect, bestXp, xpGain } = computeLessonReplayXp(
        existingComp ? { correct: existingComp.correct, xpEarned: existingComp.xp_earned } : null,
        correct,
        bestTotal,
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
        // A streak still on the old UTC-day basis bridges one extra day, once, so the switch drops nobody.
        bridgeUtcDay: streakBridge((cur as { day_basis?: string | null }).day_basis),
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
        heartsResult = gainHearts(regen.hearts, 1, regen.heartsRefillAt, Date.now());
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
        activityEvents.push({
          user_id: userId,
          event_type: "streak_milestone",
          payload: { streak },
        });
      }
      if (newIdx > oldIdx) {
        activityEvents.push({
          user_id: userId,
          event_type: "league_promotion",
          payload: { newTier: leagueTier },
        });
      }

      // One service-role-only database transaction serializes core completion
      // writes and rejects stale snapshots. A caller can retry after rereading
      // without losing XP or reporting a partial success.
      if (xpGain > 0 && !slotHeld) {
        const { consumeCompletionSlot } = await import("./completion-slot.server");
        if (!(await consumeCompletionSlot(userId, slotAtIso))) throw new Error("rate-limited");
        slotHeld = true;
      }
      const storedResult: CompletionResponse = {
        xpGain,
        correct,
        newlyUnlocked: [],
        heartsBonus,
        previousLeagueTier: LEAGUES[oldIdx] ?? leagueTier,
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
      const onceArgs = {
        _user_id: userId,
        _course: course,
        _lesson_id: lessonId,
        _level: found.unit.level,
        _today: today,
        _expected: {
          p_updated_at: pRow?.updated_at ?? null,
          lp_updated_at: lpRow?.updated_at ?? null,
          completion_xp: existingComp?.xp_earned ?? null,
          day_xp: existingDay?.xp_earned ?? null,
        },
        _next: {
          streak,
          longest_streak: longest,
          last_active_date: today,
          hearts: heartsResult.hearts,
          hearts_refill_at: heartsResult.heartsRefillAt
            ? new Date(heartsResult.heartsRefillAt).toISOString()
            : null,
          streak_freezes: freezes,
          day_basis: "local",
          xp,
          league_tier: leagueTier,
          best_correct: bestCorrect,
          total: bestTotal,
          best_xp: bestXp,
          day_xp: (existingDay?.xp_earned ?? 0) + xpGain,
          // Booked in the same transaction as the lesson (it used to be two later calls whose failures were ignored).
          profile: lessonProfilePayload({
            sessionIssuedAtMs: sessionIssuedAt,
            nowMs: Date.now(),
            graded,
          }),
        },
        _missed_question_ids: missedQuestionIds,
        _activity_events: activityEvents,
        _token_hash: tokenHash,
        _result: storedResult as unknown as Json,
        _misses: missedQuestionIds.length,
        _settle_since: new Date(sessionIssuedAt).toISOString(),
      };
      type OnceReply = {
        data: {
          status: string;
          result?: CompletionResponse;
          misses?: number;
          settle_since?: string;
        } | null;
        error: { message: string; code?: string } | null;
      };
      // The only save path: the token is claimed in the same transaction (20261125110000). There is deliberately no
      // fallback to the older apply_lesson_completion, which claims nothing and so would let a token be reused.
      const { data: transition, error: transitionError } = (await redemptionDb.rpc(
        "apply_lesson_completion_once",
        onceArgs,
      )) as unknown as OnceReply;
      // A token that belongs to another completion: not retryable (the same answer as any session not accepted).
      if (transitionError && /different completion/i.test(transitionError.message ?? "")) {
        if (slotHeld) {
          const { releaseCompletionSlot } = await import("./completion-slot.server");
          await releaseCompletionSlot(userId, slotAtIso);
          slotHeld = false;
        }
        throw new Error("Invalid or expired lesson session");
      }
      if (transitionError || !transition) {
        throw new Error("Could not save lesson completion; retry");
      }
      if (transition.status === "conflict") return null;
      // Lost a race with a request carrying the same token: nothing was saved here, so the slot goes back.
      if (transition.status === "redeemed" && transition.result) {
        if (slotHeld) {
          const { releaseCompletionSlot } = await import("./completion-slot.server");
          await releaseCompletionSlot(userId, slotAtIso);
          slotHeld = false;
        }
        return {
          redeemed: {
            result: transition.result,
            misses: transition.misses ?? 0,
            settle_since: transition.settle_since ?? new Date(sessionIssuedAt).toISOString(),
          },
        };
      }
      if (transition.status !== "applied") {
        throw new Error("Could not save lesson completion; retry");
      }
      return {
        xpGain,
        streak,
        longest,
        freezes,
        heartsResult,
        heartsBonus,
        xp,
        oldIdx,
        newIdx,
        leagueTier,
      };
    };
    let applied: Awaited<ReturnType<typeof applyOnce>> = null;
    try {
      applied = await applyOnce();
      for (let retry = 0; !applied && retry < COMPLETION_CONFLICT_RETRIES; retry++) {
        applied = await applyOnce();
      }
    } finally {
      if (slotHeld && !applied) {
        const { releaseCompletionSlot } = await import("./completion-slot.server");
        await releaseCompletionSlot(userId, slotAtIso);
      }
    }
    if (!applied) throw new Error("Could not save lesson completion; retry");
    if ("redeemed" in applied && applied.redeemed) return await replayRedeemed(applied.redeemed);

    // Hearts are settled on the server from this grading (same as the complete-lesson Edge Function).
    const { serverHeartsMode } = await import("./hearts-gate.server");
    const { settleLessonHeartsStrict, liveHeartsServerDeps } =
      await import("./hearts-server.server");
    const settleArgs = {
      userId,
      sessionToken,
      misses: missedQuestionIds.length,
      sinceMs: sessionIssuedAt,
      mode: serverHeartsMode(),
    };
    const heartsDeps = await liveHeartsServerDeps();
    // One inline retry (settlement is idempotent per token). The lesson is saved either way: a second failure is
    // reported as settlementPending, never as a failed lesson.
    let settled = await settleLessonHeartsStrict(settleArgs, heartsDeps);
    if (!settled.ok) settled = await settleLessonHeartsStrict(settleArgs, heartsDeps);
    // Referral reward: the first saved lesson of a referred learner pays both sides. Best effort (never throws), a
    // no-op for everyone without a pending referral; after hearts are settled so the grant is not overwritten.
    const { settleReferralReward, liveReferralDeps } = await import("./referral.server");
    await settleReferralReward(userId, await liveReferralDeps());
    const heartsResult = (settled.ok ? settled.settlement : null) ?? applied.heartsResult;
    const { xpGain, streak, longest, freezes, heartsBonus, xp, oldIdx, newIdx, leagueTier } =
      applied;

    // The lesson is already saved. Nothing below may turn that into an error, and nothing below may write
    // from a failed read: an unreadable unlock list looks like "nothing unlocked yet", which would
    // re-announce every achievement and reset the promotion count. Kept in step with the same block in
    // supabase/functions/complete-lesson/index.ts.
    const newlyUnlocked: string[] = [];
    const [compsRead, unlocksRead, promotionsRead] = await Promise.all([
      // Accuracy and the lesson counts behind the achievements: every completion across all courses, paged, so a heavy
      // learner's totals are not cut off at the API row cap.
      readAllRows((from, to) =>
        supabase
          .from("lesson_completions")
          .select("correct,total", { count: "exact" })
          .eq("user_id", userId)
          .order("id")
          .range(from, to),
      ),
      supabase.from("user_achievements").select("achievement_id,progress").eq("user_id", userId),
      supabaseAdmin
        .from("friend_activity_events")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("event_type", "league_promotion"),
    ]);
    if (compsRead.error || unlocksRead.error) {
      console.error(
        JSON.stringify({
          event: "achievements_skipped",
          fn: "completeLessonRemote",
          reason: "read-failed",
        }),
      );
    } else {
      const allComps = compsRead.data ?? [];
      const prevUnlocks = unlocksRead.data ?? [];
      const totalLessons = allComps.length;
      const perfectLessons = allComps.filter((c) => c.correct === c.total).length;
      const prevMap = new Map(prevUnlocks.map((u) => [u.achievement_id, u.progress]));

      // Promotions are written as feed events inside the completion transaction, so their count survives a
      // response that was lost before this step ran. The stored counter covers promotions older than the feed.
      const prevPromoteCount =
        prevMap.get("league_promote_3") ?? prevMap.get("league_promote_1") ?? 0;
      const promoteCount = Math.max(
        prevPromoteCount + (newIdx > oldIdx ? 1 : 0),
        promotionsRead.error ? 0 : (promotionsRead.count ?? 0),
      );

      const stats: Record<string, number> = {
        streak,
        xp,
        perfect: perfectLessons,
        lessons: totalLessons,
        league: promoteCount,
        freeze: freezes,
      };

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
        // user_achievements is one of the hardened tables, so this goes through the service client.
        const { error: unlockError } = await supabaseAdmin
          .from("user_achievements")
          .upsert(rows, { onConflict: "user_id,achievement_id" });
        // Derived from saved state, so the next completion writes them again.
        if (unlockError) {
          console.error(
            JSON.stringify({ event: "achievements_write_failed", fn: "completeLessonRemote" }),
          );
        }
      }
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
    const llmApiKey = resolveLlmApiKey();
    // The lesson is saved: an unreadable consent row here just skips the (best-effort) weakness step.
    if (
      missedQuestionIds.length > 0 &&
      xpGain > 0 &&
      llmApiKey &&
      (await aiAllowed().catch(() => false))
    ) {
      try {
        const missedQuestions = found.lesson.questions.filter((q) =>
          missedQuestionIds.includes(q.id),
        );
        const transcriptMessages = missedQuestions.map((q) => ({
          role: "user" as const,
          // A listening question's stem is a constant ("What did you hear?"),
          // so the spoken sentence is the only part with any signal in it --
          // without this the classifier sees the same prompt for every miss.
          // A speaking question's stem is a constant for the same reason ("Say
          // this aloud:"), and it also needs saying that the miss was a spoken
          // attempt: otherwise a pronunciation or microphone problem is
          // classified into the grammar/vocabulary taxonomy and the learner
          // gets a review item for a weakness they may not have.
          content: `Question: ${
            q.type === "listening"
              ? `${q.prompt} (heard: "${q.audioText}")`
              : q.type === "speak"
                ? `${q.prompt} (said aloud: "${q.answer}")`
                : q.type === "translate"
                  ? `${q.prompt} (wrote it themselves)`
                  : q.prompt
          } — I answered incorrectly. The correct answer was: ${
            q.type === "mc"
              ? q.choices[q.answer]
              : q.type === "translate"
                ? q.acceptableAnswers[0]
                : q.answer
          }.`,
        }));
        if (transcriptMessages.length > 0) {
          const { detectAndRecordWeaknesses } = await import("./weakness-detection.server");
          await detectAndRecordWeaknesses({
            userId,
            sourceDescription: "set of English lesson questions the learner got wrong",
            transcriptMessages,
            llmApiKey,
            llmModel: resolveLlmChatModel(),
            course,
            outputCheck: makeBlockedTermCheck(supabaseAdmin),
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
    const response: CompletionResponse = {
      xpGain,
      /** Right answers by this server's own grading: the count xpGain was computed from (the complete screen's XP lines). */
      correct,
      newlyUnlocked,
      heartsBonus,
      /**
       * The league this course was in before this completion, so the lesson-complete screen can tell a promotion
       * from a first load. The apps compare against a cached tier; here the server already knows it for certain.
       * Equal to `progress.leagueTier` unless this very completion moved the learner up.
       */
      previousLeagueTier: LEAGUES[oldIdx] ?? leagueTier,
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
    // So a retry of this token returns what this reply says (the achievements it announced, the settled hearts).
    // Best effort: the stored first copy is already a complete answer.
    try {
      // supabase-js returns the error rather than throwing it, so it is checked here.
      const { error: finalizeError } = await redemptionDb.rpc("finalize_lesson_session_result", {
        _user_id: userId,
        _token_hash: tokenHash,
        _result: response,
      });
      if (finalizeError) {
        console.error(
          JSON.stringify({
            event: "lesson_result_finalize_failed",
            fn: "completeLessonRemote",
            message: finalizeError.message,
          }),
        );
        await recordOpsEvent(
          "lesson_result_finalize_failed",
          { fn: "completeLessonRemote" },
          userId,
        );
      }
    } catch {
      // Nothing to do: the earlier stored result stands.
    }
    // Saved, but the hearts could not be settled even after one retry: the lesson is NOT reported as failed (it is
    // saved; an error would make the page say it was not). Logged and flagged for the caller.
    if (!settled.ok) {
      console.error(
        JSON.stringify({ event: "hearts_settlement_pending", fn: "completeLessonRemote" }),
      );
      response.settlementPending = true;
    }
    return response;
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
    // 2026-09-30 audit: _cost is no longer a real parameter this RPC
    // accepts (removed entirely -- see the migration's own comment for
    // why a caller-controlled cost was a real XP-mint exploit). XP_HEART_COST
    // is kept purely to report back in this function's own return value.
    const { data: rpcData, error } = await supabase.rpc("buy_heart_with_xp", {
      _course: data.course,
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
    // 2026-09-30 audit: same fix as buyHeartWithXpRemote above -- _cost
    // is no longer a real parameter this RPC accepts.
    const { data: rpcData, error } = await supabase.rpc("buy_streak_freeze_with_xp", {
      _course: data.course,
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
