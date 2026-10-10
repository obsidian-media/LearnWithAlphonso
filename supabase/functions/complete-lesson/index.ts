// Supabase Edge Function: complete-lesson
//
// The trust-boundary piece of lesson completion that a Swift/web client
// cannot implement directly -- see
// docs/superpowers/specs/2026-09-17-complete-lesson-edge-function-design.md
// for the full design rationale. This is a 1:1 port of
// src/lib/sync.functions.ts's completeLessonRemote handler
// (src/lib/sync.functions.ts:174-351), reading curriculum data from the
// lessons/questions/achievements tables (supabase/migrations/20260918120000_curriculum_data_tables.sql)
// instead of the in-process curriculum.ts the web app uses.
//
// Env vars: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY are
// auto-injected by the Supabase platform (local `supabase functions serve`
// and production alike) -- do not set them manually. LESSON_SESSION_SECRET
// must be set explicitly (`supabase secrets set LESSON_SESSION_SECRET=...`)
// and MUST match the web app's own LESSON_SESSION_SECRET, or tokens issued
// by startLessonSession (web) won't verify here.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  computeLeaguePromotion,
  computeLessonReplayXp,
  computeStreakUpdate,
  LEAGUES,
  type LeagueTier,
} from "./progress-math.ts";
import { verifyLessonSessionToken } from "./lesson-session.ts";
import { lessonPayloadMatches } from "./lesson-version.ts";
import {
  gainHearts,
  MAX_HEARTS,
  perfectLessonBonusEarned,
  resolveHeartsRefill,
  streakHeartMilestoneReached,
} from "../_shared/hearts.ts";
import { sendPushToUser } from "../_shared/apns.ts";
// §0.1-d #6: re-grades each submitted answer against the real question
// instead of trusting a client-claimed missedQuestionIds list. The same
// function grade-review already used to re-derive review-item correctness.
import { hasAiConsent } from "../_shared/ai-consent.ts";
import { deriveAnswerCorrectness, type QuestionRow } from "../_shared/answer-correctness.ts";
import { makeTranslateQuotaCheck } from "../_shared/ai-quota.ts";

// Was missing "es" -- predates Spanish's 2026-09-21 launch and was never
// updated, unlike grade-review's identical schema. Silently rejected every
// Spanish-course lesson completion from iOS (web's completeLessonRemote,
// grade-review and start-lesson-session's own schema below all already
// allow "es").
const courseSchema = z.enum(["en", "fr", "es"]);
const lessonIdSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9]+$/, "invalid lesson id");
const completeLessonSchema = z.object({
  lessonId: lessonIdSchema,
  total: z.number().int().min(1).max(50),
  // §0.1-d #6: was a client-claimed missedQuestionIds list, trusted with no
  // check that any answer was ever actually graded. Now the client submits
  // what it actually answered, one entry per real question, and the server
  // derives correctness itself (see deriveAnswerCorrectness below).
  answers: z
    .array(
      z.object({
        questionId: z.string().regex(/^[a-z0-9]+$/),
        answer: z.string().max(2000),
      }),
    )
    .max(50),
  course: courseSchema,
  sessionToken: z.string().min(1).max(2000),
});

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function authenticate(
  req: Request,
): Promise<{ userId: string; userClient: SupabaseClient } | Response> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonResponse({ error: "Unauthorized: missing bearer token" }, 401);
  }
  const token = authHeader.slice("Bearer ".length);
  if (!token || token.split(".").length !== 3) {
    return jsonResponse({ error: "Unauthorized: invalid token" }, 401);
  }

  const anonClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    },
  );
  const { data, error } = await anonClient.auth.getClaims(token);
  if (error || !data?.claims?.sub) {
    return jsonResponse({ error: "Unauthorized: invalid token" }, 401);
  }
  return { userId: data.claims.sub as string, userClient: anonClient };
}

/**
 * Looks up a lesson + its questions, scoped to the claimed course (a
 * lesson id belonging to the other course's units correctly returns null
 * here, matching getCourse(course).findLesson(lessonId)'s semantics).
 * Also returns the unit's level_id -- needed for the review_items rows
 * this function upserts below, same as recordMisses' client-supplied
 * `level` on the web (here derived server-side instead, one less field
 * to trust from the caller).
 */
async function findLesson(
  admin: SupabaseClient,
  course: string,
  lessonId: string,
): Promise<{ questions: (QuestionRow & { id: string })[]; level: string } | null> {
  const { data, error } = await admin
    .from("lessons")
    .select(
      "id, units!inner(course, level_id), questions(id, type, prompt, choices, bank, answer_index, answer_text)",
    )
    .eq("id", lessonId)
    .eq("units.course", course)
    .maybeSingle();
  if (error || !data) return null;
  const units = data.units as unknown as { level_id: string } | { level_id: string }[];
  const level = Array.isArray(units) ? units[0]?.level_id : units.level_id;
  return {
    questions: (data.questions ?? []) as (QuestionRow & { id: string })[],
    level: level ?? "A1",
  };
}

export async function handleRequest(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;
  const { userId, userClient } = auth;
  const checkQuota = makeTranslateQuotaCheck(userClient);

  let parsed: z.infer<typeof completeLessonSchema>;
  try {
    parsed = completeLessonSchema.parse(await req.json());
  } catch (err) {
    return jsonResponse({ error: "Invalid request body", details: `${err}` }, 400);
  }
  const { lessonId, total, answers, course, sessionToken } = parsed;

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const found = await findLesson(admin, course, lessonId);
  if (!lessonPayloadMatches(found, total, answers)) {
    console.log(
      JSON.stringify({
        event: "lesson_version_mismatch",
        lessonId,
        course,
        total,
        serverTotal: found?.questions.length ?? null,
      }),
    );
    return jsonResponse({ error: "lesson-version-mismatch" }, 409);
  }
  const lesson = found!;

  if (!verifyLessonSessionToken(sessionToken, { userId, lessonId, course })) {
    return jsonResponse({ error: "Invalid or expired lesson session" }, 403);
  }

  // The actual re-grade: never trust which questions the client says it
  // missed, derive it from the real answer key. Sequential, not
  // Promise.all -- at most a handful of "translate" questions can reach the
  // AI grader, and each one already reuses the exact local-first check the
  // player showed the learner live (deriveAnswerCorrectness).
  // The AI step runs only with account consent. Read lazily, once, and only if a translate answer needs it.
  let consent: Promise<boolean> | undefined;
  const ai = {
    allowed: () => (consent ??= hasAiConsent(admin, userId)),
    checkQuota,
  };

  const questionById = new Map(lesson.questions.map((q) => [q.id, q]));
  const missedQuestionIds: string[] = [];
  for (const { questionId, answer } of answers) {
    // Safe: validateLessonAnswerCoverage already proved questionId is a
    // real id in this lesson.
    const question = questionById.get(questionId)!;
    const isCorrect = await deriveAnswerCorrectness(question, answer, course, ai);
    if (!isCorrect) missedQuestionIds.push(questionId);
  }
  if (consent && !(await consent)) {
    console.log(
      JSON.stringify({
        event: "ai_grading_skipped",
        fn: "complete-lesson",
        reason: "no-ai-consent",
      }),
    );
  }
  const correct = answers.length - missedQuestionIds.length;

  const today = todayStr();

  // Batch every read that doesn't depend on another read's result.
  const [pResult, lpResult, compResult, dayResult] = await Promise.all([
    admin.from("user_progress").select("*").eq("user_id", userId).maybeSingle(),
    admin
      .from("language_progress")
      .select("*")
      .eq("user_id", userId)
      .eq("language", course)
      .maybeSingle(),
    admin
      .from("lesson_completions")
      .select("correct,xp_earned")
      .eq("user_id", userId)
      .eq("lesson_id", lessonId)
      .eq("language", course)
      .maybeSingle(),
    admin
      .from("activity_days")
      .select("xp_earned")
      .eq("user_id", userId)
      .eq("day", today)
      .maybeSingle(),
  ]);
  const readError = [pResult, lpResult, compResult, dayResult].find((r) => r.error);
  if (readError) return jsonResponse({ error: "Could not load lesson progress" }, 503);
  const pRow = pResult.data;
  const lpRow = lpResult.data;
  const existingComp = compResult.data;
  const existingDay = dayResult.data;

  // Replay-farming fix, mirrors src/lib/sync.functions.ts's
  // completeLessonRemote: a repeat completion only pays the XP delta over
  // its previous best score.
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
  // a perfect lesson (zero misses) grants a single heart back. Matches
  // completeLessonRemote (src/lib/sync.functions.ts) exactly.
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
  } else if (perfectLessonBonusEarned(correct, total) && xpGain > 0 && regen.hearts < MAX_HEARTS) {
    heartsResult = gainHearts(regen.hearts, 1);
    heartsBonus = "perfect";
  }

  const curLp = lpRow ?? { xp: 0, league_tier: "bronze" };
  const xp = curLp.xp + xpGain;

  const oldIdx = LEAGUES.indexOf(curLp.league_tier as LeagueTier);
  const { leagueTier, newIdx } = computeLeaguePromotion(xp, oldIdx);

  // Friends activity feed (supabase/migrations/20260920010000_friend_activity_events.sql).
  // Only meaningful completions (xpGain > 0) are logged, not every replay
  // of an already-mastered lesson -- otherwise the feed would fill with
  // noise from a single learner re-doing content for review.
  const activityEvents: {
    user_id: string;
    event_type: string;
    payload: Record<string, unknown>;
  }[] = [];
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

  const { data: transition, error: transitionError } = await admin.rpc("apply_lesson_completion", {
    _user_id: userId,
    _course: course,
    _lesson_id: lessonId,
    _level: lesson.level,
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
      xp,
      league_tier: leagueTier,
      best_correct: bestCorrect,
      total,
      best_xp: bestXp,
      day_xp: (existingDay?.xp_earned ?? 0) + xpGain,
    },
    _missed_question_ids: missedQuestionIds,
    _activity_events: activityEvents,
  });
  if (transitionError || !transition || transition.status !== "applied") {
    return jsonResponse({ error: "Could not save lesson completion; retry" }, 503);
  }

  // Real (remote) push for leaderboard "you've been overtaken" -- V4
  // candidate #2 (docs/BACKLOG.md sec 2.1). This function is the one
  // place that already knows this user's XP just changed, so overtake
  // detection happens here rather than a separately-scheduled job: a
  // friend just got overtaken exactly when their xp falls strictly
  // between this user's xp *before* this completion and *after* it (this
  // user passed them). sendPushToUser itself no-ops silently if APNs
  // secrets aren't configured yet -- see supabase/functions/_shared/apns.ts.
  // Deliberately best-effort and never awaited into the critical path in
  // a way that could turn a successful lesson completion into a 500.
  if (xpGain > 0) {
    try {
      const { data: friendRows } = await admin
        .from("friendships")
        .select("friend_id")
        .eq("user_id", userId)
        .eq("status", "accepted");
      const friendIds = (friendRows ?? []).map((r) => r.friend_id as string);
      if (friendIds.length > 0) {
        const { data: overtaken } = await admin
          .from("language_progress")
          .select("user_id")
          .eq("language", course)
          .in("user_id", friendIds)
          .gt("xp", curLp.xp)
          .lte("xp", xp);
        await Promise.all(
          (overtaken ?? []).map((row) =>
            sendPushToUser(
              admin,
              row.user_id as string,
              "Leaderboard update",
              "Someone passed you on the leaderboard!",
              { type: "overtake" },
            ).catch(() => undefined),
          ),
        );
      }
    } catch {
      // Same best-effort reasoning as above -- never fail this response
      // over a push-delivery hiccup.
    }
  }

  const [{ data: allComps }, { data: achievements }, { data: prevUnlocks }] = await Promise.all([
    admin.from("lesson_completions").select("correct,total").eq("user_id", userId),
    admin.from("achievements").select("id, category, threshold"),
    admin.from("user_achievements").select("achievement_id,progress").eq("user_id", userId),
  ]);
  const totalLessons = allComps?.length ?? 0;
  const perfectLessons = (allComps ?? []).filter((c) => c.correct === c.total).length;

  const prevMap = new Map((prevUnlocks ?? []).map((u) => [u.achievement_id, u.progress]));
  const newlyUnlocked: string[] = [];

  const prevPromoteCount = prevMap.get("league_promote_3") ?? prevMap.get("league_promote_1") ?? 0;
  const promoteCount = prevPromoteCount + (newIdx > oldIdx ? 1 : 0);

  const stats: Record<string, number> = {
    streak,
    xp,
    perfect: perfectLessons,
    lessons: totalLessons,
    league: promoteCount,
    freeze: freezes,
  };

  const rows: { user_id: string; achievement_id: string; progress: number }[] = [];
  for (const a of achievements ?? []) {
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
    await admin.from("user_achievements").upsert(rows, {
      onConflict: "user_id,achievement_id",
    });
  }

  return jsonResponse(
    {
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
    },
    200,
  );
}

Deno.serve(handleRequest);
